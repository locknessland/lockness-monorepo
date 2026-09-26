#!/usr/bin/env -S deno run -A
/**
 * @fileoverview Ranged gitleaks scan of the commits a `git push` is about to
 * send, run by the `pre-push` hook (`scripts/install_hooks.ts`) after
 * `deno task gate`.
 *
 * git feeds the hook one line per updated ref on stdin:
 * `<local ref> <local sha> <remote ref> <remote sha>` (githooks(5),
 * `pre-push`). This script reads those lines directly rather than taking
 * positional arguments, so the hook body stays a thin `exec`.
 *
 * For each non-delete ref update the scanned range is:
 * - `remote_sha..local_sha` when the remote ref already exists;
 * - `origin/main..local_sha` for a brand-new branch (`remote_sha` is all
 *   zeros) when `origin/main` shares history with `local_sha`;
 * - the full history reachable from `local_sha` when there is no merge-base
 *   (a genuinely new root).
 *
 * `.gitleaksignore` is read as it stood at the range's BASE (the same commit
 * `resolveRange` diffs from), never at the tip: reading the tip would let one
 * push (or one same-branch PR) add a secret in one commit and its own
 * fingerprint in a later commit, and both scans — the one at the leak and the
 * one at HEAD — would see the suppressed version and pass (#HIGH). With no
 * base (a rootless push, full history, no merge-base), the tip's file is kept
 * — the one named residue of this rule.
 *
 * Verified against the real 8.30.1 binary before relying on it: gitleaks'
 * `--gitleaks-ignore-path` does NOT override an `.gitleaksignore` already
 * present in the scan's working directory — it only supplies a path to check
 * when the working directory has none. gitleaks reads the ignore file live
 * off disk (not a git blob), so the base's version cannot simply be handed to
 * it via a flag; it has to be present on disk at the scan's root. The
 * developer's actual working tree is never the scan's root: this script
 * creates a disposable, detached `git worktree` (sharing the same object
 * database, so the pushed range stays reachable), checked out at the push's
 * `local_sha`, writes the base's `.gitleaksignore` content into THAT
 * worktree, points `gitleaks` at it, and removes the worktree in a `finally`.
 * A crash mid-scan (SIGINT, SIGKILL, a hard crash) leaves at worst a stray
 * temp worktree — never a mutated developer tree — and the next run's
 * `git worktree prune` sweeps it up.
 *
 * Fails closed, mirroring `.github/workflows/secret-scan.yml`: the installer
 * failing, gitleaks logging an ERR/FTL line, an unreadable report, a
 * non-empty report paired with exit 0, a present `.gitleaks.toml`, or
 * gitleaks reporting "0 commits scanned" for a range this script already knows
 * is non-empty (via `git rev-list --count`) all refuse the push. `--redact`
 * keeps a real secret out of the terminal.
 *
 * @module
 */

import { dirname } from '@std/path'
import { install as installGitleaks } from './install_gitleaks.ts'

/** All-zero placeholder git uses for "this ref does not exist yet/anymore". */
const ZERO_SHA_RE = /^0+$/

/**
 * Environment variables git hooks export (`GIT_DIR`, `GIT_WORK_TREE`,
 * `GIT_INDEX_FILE`) that would otherwise redirect a git subprocess at the
 * hook's own repository/worktree instead of the `cwd` this script passes
 * explicitly — most dangerous for `git worktree add`, which must operate on
 * the disposable scan worktree, never the developer's checkout.
 */
const GIT_ENV_LEAK_KEYS = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']

/**
 * The current environment with {@link GIT_ENV_LEAK_KEYS} removed, for every
 * `git` subprocess this script spawns.
 *
 * @returns A env record safe to hand to `Deno.Command` alongside `clearEnv`.
 */
function sanitizedGitEnv(): Record<string, string> {
    const env = Deno.env.toObject()
    for (const key of GIT_ENV_LEAK_KEYS) delete env[key]
    return env
}

/** One line of pre-push stdin. */
export interface RefUpdate {
    localRef: string
    localSha: string
    remoteRef: string
    remoteSha: string
}

/**
 * Parse the pre-push stdin lines.
 *
 * @param input - The raw stdin text.
 * @returns One {@link RefUpdate} per non-blank line.
 * @throws {Error} On a line that does not have all four fields.
 */
export function parseRefUpdates(input: string): RefUpdate[] {
    return input
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => {
            const [localRef, localSha, remoteRef, remoteSha] = line.split(/\s+/)
            if (!localRef || !localSha || !remoteRef || !remoteSha) {
                throw new Error(
                    `malformed pre-push ref line: ${JSON.stringify(line)}`,
                )
            }
            return { localRef, localSha, remoteRef, remoteSha }
        })
}

/**
 * Whether a ref update is a delete (the local sha is all zeros) — nothing new
 * is being pushed, so there is nothing to scan.
 *
 * @param update - The ref update.
 * @returns `true` for a delete.
 */
export function isDelete(update: RefUpdate): boolean {
    return ZERO_SHA_RE.test(update.localSha)
}

/**
 * Run `git` in `cwd`, returning trimmed stdout, or `null` on failure.
 *
 * @param args - Arguments to `git`.
 * @param cwd - The repository root.
 */
async function git(args: string[], cwd: string): Promise<string | null> {
    const run = await new Deno.Command('git', {
        args,
        cwd,
        clearEnv: true,
        env: sanitizedGitEnv(),
        stdout: 'piped',
        stderr: 'piped',
    }).output()
    if (!run.success) return null
    return new TextDecoder().decode(run.stdout).trim()
}

/**
 * Resolve the base commit a ref update's range is diffed from: `remoteSha`
 * when the remote ref already exists, else the `origin/main` merge-base, else
 * `null` (no base — a genuinely new root, or `origin/main` unreachable).
 *
 * This is the SAME base `.gitleaksignore` is read from ({@link
 * snapshotIgnoreFile}) — reading the tip's file instead would let a push
 * suppress its own new secret with a same-push fingerprint addition (#HIGH).
 *
 * @param update - A ref update already known not to be a delete.
 * @param cwd - The repository root.
 * @returns The base commit-ish, or `null` when there is none.
 */
export async function resolveBase(
    update: RefUpdate,
    cwd: string,
): Promise<string | null> {
    if (!ZERO_SHA_RE.test(update.remoteSha)) return update.remoteSha
    return await git(['merge-base', 'origin/main', update.localSha], cwd)
}

/**
 * Resolve the `git log`-compatible range gitleaks should scan for one ref
 * update.
 *
 * @param update - A ref update already known not to be a delete.
 * @param cwd - The repository root.
 * @returns A revision expression gitleaks accepts as `--log-opts`.
 * @example
 * ```ts
 * // existing branch
 * await resolveRange({ localRef: 'refs/heads/x', localSha: 'abc', remoteRef: 'refs/heads/x', remoteSha: 'def' }, cwd)
 * // 'def..abc'
 * ```
 */
export async function resolveRange(
    update: RefUpdate,
    cwd: string,
): Promise<string> {
    if (!ZERO_SHA_RE.test(update.remoteSha)) {
        return `${update.remoteSha}..${update.localSha}`
    }
    const base = await resolveBase(update, cwd)
    if (base) return `origin/main..${update.localSha}`
    return update.localSha
}

/**
 * Read `.gitleaksignore`'s content as it stood at `base`.
 *
 * @param base - The commit-ish from {@link resolveBase}, or `null` when there
 *   is none — signals the tip's file should be left untouched (the named
 *   residue of the base-snapshot rule: a rootless push has no earlier state
 *   to pin to).
 * @param cwd - The repository root.
 * @returns The base's content (`''` when the base predates the file), or
 *   `null` when `base` itself was `null`.
 */
export async function readIgnoreAtBase(
    base: string | null,
    cwd: string,
): Promise<string | null> {
    if (base === null) return null
    // `git show` fails both when the base has no such file and on other
    // errors; either way an empty ignore file at the base is the correct,
    // fail-closed reading — no earlier suppression exists to honour.
    const content = await git(['show', `${base}:.gitleaksignore`], cwd)
    return content ?? ''
}

/**
 * Create a disposable, detached `git worktree` checked out at `localSha`, so
 * the scan never runs against the developer's actual working tree. The
 * worktree shares the calling repository's object database (`git worktree
 * add` links it in, it is not a clone), so every commit in the range this
 * push is about to send stays reachable from it.
 *
 * Runs `git worktree prune` first, sweeping up any stale registration left
 * behind by an earlier crash (see {@link removeScanWorktree}).
 *
 * @param localSha - The pushed commit to check out (a ref update's
 *   `localSha`).
 * @param cwd - The repository root the worktree is added FROM (not the
 *   worktree's own directory).
 * @returns The new worktree's absolute directory.
 * @throws {Error} When `git worktree add` fails.
 */
export async function createScanWorktree(
    localSha: string,
    cwd: string,
): Promise<string> {
    await git(['worktree', 'prune'], cwd)
    const parent = await Deno.makeTempDir({
        prefix: 'lockness-secret-scan-worktree-',
    })
    const worktreeDir = `${parent}/scan`
    const added = await git(
        ['worktree', 'add', '--detach', worktreeDir, localSha],
        cwd,
    )
    if (added === null) {
        await Deno.remove(parent, { recursive: true }).catch(() => {})
        throw new Error(
            `git worktree add failed for ${localSha} (scan cannot proceed)`,
        )
    }
    return worktreeDir
}

/**
 * Remove a worktree created by {@link createScanWorktree}: `git worktree
 * remove --force`, then `git worktree prune`, then delete the temp directory
 * that held it. Called from a `finally`, so a crash mid-scan is the only way
 * to skip it — leaving at worst a stale worktree registration, which the next
 * run's `git worktree prune` (inside {@link createScanWorktree}) sweeps up.
 * Never touches the developer's own working tree.
 *
 * @param worktreeDir - The directory returned by {@link createScanWorktree}.
 * @param cwd - The repository root the worktree was added from.
 */
export async function removeScanWorktree(
    worktreeDir: string,
    cwd: string,
): Promise<void> {
    await git(['worktree', 'remove', '--force', worktreeDir], cwd)
    await git(['worktree', 'prune'], cwd)
    await Deno.remove(dirname(worktreeDir), { recursive: true }).catch(
        () => {},
    )
}

/**
 * Write `content` as the scan worktree's `.gitleaksignore`, replacing
 * whatever the worktree's checkout already carries (the tip's version, since
 * the worktree is checked out at the push's own `local_sha`).
 *
 * @param content - The base's `.gitleaksignore` content (see {@link
 *   readIgnoreAtBase}), or `null` to leave the worktree's checked-out (tip's)
 *   file exactly as `git worktree add` produced it — the named residue of
 *   the base-snapshot rule, for a rootless push with no base at all.
 * @param worktreeDir - The directory from {@link createScanWorktree}.
 */
export async function writeBaseIgnoreFile(
    content: string | null,
    worktreeDir: string,
): Promise<void> {
    if (content === null) return
    await Deno.writeTextFile(`${worktreeDir}/.gitleaksignore`, content)
}

/**
 * Count the commits a range actually contains, so "0 commits scanned" can be
 * told apart from "there was nothing to scan".
 *
 * @param range - A `git log`-compatible range.
 * @param cwd - The repository root.
 * @returns The commit count, or `0` if `git rev-list` itself fails.
 */
export async function commitCount(range: string, cwd: string): Promise<number> {
    const out = await git(['rev-list', '--count', range], cwd)
    if (out === null) return 0
    const n = Number(out)
    return Number.isFinite(n) ? n : 0
}

/** The outcome of scanning one range. */
export interface ScanResult {
    ok: boolean
    /** Set when `ok` is `false`: why the push is refused. */
    reason?: string
}

/**
 * Run gitleaks over one range and apply the fail-closed checks mirrored from
 * `secret-scan.yml`.
 *
 * @param range - A `git log`-compatible range, already known to be non-empty.
 * @param cwd - The directory gitleaks scans from — the disposable worktree
 *   from {@link createScanWorktree} in production use, a plain repository in
 *   tests. Refs and objects are shared with the real repository the worktree
 *   was added from, so `range` resolves the same either way.
 * @param gitleaksPath - Path of the verified gitleaks binary.
 * @param expectedCommits - The commit count from {@link commitCount}, used to
 *   tell a real "0 commits scanned" apart from an empty range.
 * @returns Whether the range is clean, and why not when it is not.
 */
export async function scanRange(
    range: string,
    cwd: string,
    gitleaksPath: string,
    expectedCommits: number,
): Promise<ScanResult> {
    const reportPath = await Deno.makeTempFile({
        prefix: 'gitleaks-report-',
        suffix: '.json',
    })
    try {
        const run = await new Deno.Command(gitleaksPath, {
            args: [
                'git',
                '--redact',
                '--no-banner',
                '--no-color',
                '--ignore-gitleaks-allow',
                '--exit-code',
                '1',
                `--log-opts=${range}`,
                '--report-format',
                'json',
                '--report-path',
                reportPath,
                '.',
            ],
            cwd,
            clearEnv: true,
            env: sanitizedGitEnv(),
            stdout: 'piped',
            stderr: 'piped',
        }).output()
        const log = new TextDecoder().decode(run.stdout) +
            new TextDecoder().decode(run.stderr)

        let count: number | null = null
        try {
            const text = await Deno.readTextFile(reportPath)
            count = text.trim().length > 0
                ? (JSON.parse(text) as unknown[]).length
                : 0
        } catch {
            count = null
        }

        const scannedMatch = log.match(/(\d+)\s+commits scanned/)
        const scanned = scannedMatch ? Number(scannedMatch[1]) : null

        const problems: string[] = []
        if (/\b(ERR|FTL)\b/.test(log)) {
            problems.push('gitleaks logged an ERR/FTL line')
        }
        if (expectedCommits > 0 && (scanned === 0 || scanned === null)) {
            problems.push(
                `gitleaks scanned ${
                    scanned ?? 'an unreported number of'
                } commits, but the range holds ${expectedCommits}`,
            )
        }
        if (count === null) {
            problems.push('the gitleaks report is missing or unreadable')
        } else if (count !== 0 && run.code === 0) {
            problems.push(
                `the report holds ${count} leak(s) but gitleaks exited 0`,
            )
        }

        if (problems.length > 0) {
            return { ok: false, reason: problems.join('; ') }
        }
        if (run.code !== 0) {
            return {
                ok: false,
                reason:
                    `gitleaks exited ${run.code} (${
                        count ?? 'unknown'
                    } leak(s) found, redacted; see the fingerprint via ` +
                    `.gitleaksignore instructions in docs/testing.md)`,
            }
        }
        return { ok: true }
    } finally {
        await Deno.remove(reportPath).catch(() => {})
    }
}

/** The overall outcome of a pre-push scan across every updated ref. */
export interface PrepushResult {
    ok: boolean
    /** One line per problem, or per range skipped/scanned, for the log. */
    lines: string[]
}

/**
 * Run the full pre-push scan: parse the ref updates, resolve each range,
 * install gitleaks, and scan every non-empty, non-delete range.
 *
 * @param stdin - The hook's stdin (the ref update lines).
 * @param cwd - The repository root.
 * @returns Whether the push may proceed, and a human-readable log.
 */
export async function runPrepushScan(
    stdin: string,
    cwd: string,
): Promise<PrepushResult> {
    const lines: string[] = []

    const toolingConfig = await Deno.stat(`${cwd}/.gitleaks.toml`).then(
        () => true,
        () => false,
    )
    if (toolingConfig) {
        return {
            ok: false,
            lines: [
                '.gitleaks.toml is not allowed: it could silence findings. ' +
                'Suppress a reviewed false positive by fingerprint in ' +
                '.gitleaksignore instead.',
            ],
        }
    }

    let updates: RefUpdate[]
    try {
        updates = parseRefUpdates(stdin)
    } catch (error) {
        return { ok: false, lines: [(error as Error).message] }
    }
    if (updates.length === 0) {
        return { ok: true, lines: ['no ref updates on stdin; nothing to scan'] }
    }

    let gitleaksPath: string
    try {
        gitleaksPath = await installGitleaks()
    } catch (error) {
        return {
            ok: false,
            lines: [`gitleaks install failed: ${(error as Error).message}`],
        }
    }

    let ok = true
    for (const update of updates) {
        if (isDelete(update)) {
            lines.push(`${update.localRef}: delete, skipped`)
            continue
        }
        const base = await resolveBase(update, cwd)
        const range = await resolveRange(update, cwd)
        const expected = await commitCount(range, cwd)
        if (expected === 0) {
            lines.push(`${update.localRef}: ${range} is empty, nothing to scan`)
            continue
        }
        const ignoreContent = await readIgnoreAtBase(base, cwd)

        let worktreeDir: string | null = null
        let result: ScanResult
        try {
            worktreeDir = await createScanWorktree(update.localSha, cwd)
            await writeBaseIgnoreFile(ignoreContent, worktreeDir)
            result = await scanRange(range, worktreeDir, gitleaksPath, expected)
        } catch (error) {
            result = {
                ok: false,
                reason: `could not scan from a disposable worktree: ${
                    (error as Error).message
                }`,
            }
        } finally {
            if (worktreeDir) await removeScanWorktree(worktreeDir, cwd)
        }

        if (result.ok) {
            lines.push(
                `${update.localRef}: ${range} clean (${expected} commit(s))`,
            )
        } else {
            ok = false
            lines.push(`${update.localRef}: ${range} FAILED: ${result.reason}`)
        }
    }
    return { ok, lines }
}

if (import.meta.main) {
    const stdin = new TextDecoder().decode(
        await new Response(Deno.stdin.readable).arrayBuffer(),
    )
    const cwd = (await git(['rev-parse', '--show-toplevel'], Deno.cwd())) ??
        Deno.cwd()
    const result = await runPrepushScan(stdin, cwd)
    for (const line of result.lines) {
        console.log(`[secret-scan] ${line}`)
    }
    if (!result.ok) {
        console.error(
            '[secret-scan] push refused: see the fail(s) above. A reviewed ' +
                'false positive is suppressed by fingerprint in ' +
                '.gitleaksignore, never by path — and the ignore file is read ' +
                "as it stood BEFORE this push's commits, so if this is a false " +
                'positive, push the offending commit first, then add its ' +
                '.gitleaksignore entry in a follow-up push/PR.',
        )
        Deno.exit(1)
    }
}
