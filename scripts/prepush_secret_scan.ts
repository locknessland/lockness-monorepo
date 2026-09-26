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
 * Fails closed, mirroring `.github/workflows/secret-scan.yml`: the installer
 * failing, gitleaks logging an ERR/FTL line, an unreadable report, a
 * non-empty report paired with exit 0, a present `.gitleaks.toml`, or
 * gitleaks reporting "0 commits scanned" for a range this script already knows
 * is non-empty (via `git rev-list --count`) all refuse the push.
 * `.gitleaksignore` applies — gitleaks reads it by default — and `--redact`
 * keeps a real secret out of the terminal.
 *
 * @module
 */

import { install as installGitleaks } from './install_gitleaks.ts'

/** All-zero placeholder git uses for "this ref does not exist yet/anymore". */
const ZERO_SHA_RE = /^0+$/

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
        stdout: 'piped',
        stderr: 'piped',
    }).output()
    if (!run.success) return null
    return new TextDecoder().decode(run.stdout).trim()
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
    const base = await git(
        ['merge-base', 'origin/main', update.localSha],
        cwd,
    )
    if (base) return `origin/main..${update.localSha}`
    return update.localSha
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
 * @param cwd - The repository root.
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
        const range = await resolveRange(update, cwd)
        const expected = await commitCount(range, cwd)
        if (expected === 0) {
            lines.push(`${update.localRef}: ${range} is empty, nothing to scan`)
            continue
        }
        const result = await scanRange(range, cwd, gitleaksPath, expected)
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
                '.gitleaksignore, never by path.',
        )
        Deno.exit(1)
    }
}
