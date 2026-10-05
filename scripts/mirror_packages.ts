#!/usr/bin/env -S deno run --allow-read --allow-run --allow-env
/**
 * @fileoverview Publish each package to its own read-only GitHub mirror.
 *
 * The monorepo stays the source of truth: all development, all issues, all
 * pull requests. Each `locknessland/<package>` repository is a **generated
 * shop window** — it exists so that someone searching GitHub for "scheduler"
 * lands on something readable, which a monorepo alone does not give.
 *
 * This is the Laravel / Symfony shape (`illuminate/database` is literally
 * described as `[READ ONLY] Subtree split ...`), with one difference: their
 * splits exist because Composer resolves from git. JSR publishes files, so
 * here the mirrors serve discovery only and never publishing. Publishing stays
 * atomic from the monorepo, with OIDC provenance.
 *
 * **One commit per release, not a history replay.** `git subtree split` would
 * carry every monorepo commit that ever touched the directory. Instead each
 * sync creates a single commit whose *tree is the package directory*, via
 * `git commit-tree`, parented on the mirror's previous commit. Flat history,
 * one entry per version that changed the package.
 *
 * **Built from the release tag, never from `HEAD`** (#431). The tree is
 * `refs/tags/v<version>^{commit}:packages/<name>`, so work committed after
 * the release never reaches a mirror. Before anything is built, provenance is
 * checked, after `git fetch origin`:
 * - the local tag `v<version>` exists and equals `origin`'s;
 * - the tag's commit is an ancestor of `origin/main` and carries `<version>`
 *   in its `deno.jsonc`;
 * - a green `Secret scan` run triggered by a **push** to `main` has a head
 *   that is on `origin/main` and contains the tag. `--branch main` alone
 *   would also match a pull request from a fork whose branch is named
 *   `main`, whose head never reached `origin/main`.
 *
 * That provenance is what lets a mirror push meet the pre-push secret scan on
 * its own merits: every tree and blob it sends is already reachable from
 * `origin/main`, so `scripts/published_objects.ts` admits it without a
 * gitleaks run. The hook is never bypassed.
 *
 * **Idempotent.** Each mirror's head is fetched first (into
 * `refs/mirrors/<name>/main`, so the parent handed to `commit-tree -p` is a
 * referenced local object even in a fresh clone). A head that already holds
 * the release tree is reused; only the refs that differ are pushed, in ONE
 * `git push --atomic --force` per mirror — a mirror never ends with its
 * branch pushed and its tag missing. A mirror with nothing to push reports
 * `already at v<version>`.
 *
 * **Clone shapes** (measured, pinned by `scripts/mirror_packages_test.ts`).
 * A shallow clone whose tip is the release syncs. A shallow clone that cut
 * the release off its history refuses provenance (the tag's ancestry cannot
 * be proven), and nothing is pushed. A blobless partial clone
 * (`--filter=blob:none`) syncs: git fetches the blobs it needs from the
 * promisor remote on demand. On the scan side, a shallow clone narrows the
 * published set (it can only admit less), and a partial clone completes it
 * on demand or, with its promisor unreachable, admits nothing
 * (`scripts/prepush_secret_scan_test.ts`).
 *
 * @example
 * ```bash
 * deno task mirror --dry-run     # report, push nothing
 * deno task mirror --create      # create any missing mirror repositories
 * deno task mirror               # sync every package at the current version
 * deno task mirror --flatten     # initial import: one commit, no parent
 * ```
 *
 * @module
 */

import { parse as parseJsonc } from '@std/jsonc'
import { join } from '@std/path'
import { type GitOutput, OBJECT_ID_RE, runGit } from './git_env.ts'

const OWNER = 'locknessland'
const SOURCE_REPO = `${OWNER}/lockness-monorepo`

/** The workflow whose green run on `main` must contain the release tag. */
const SECRET_SCAN_WORKFLOW = 'Secret scan'

/** How many recent green `Secret scan` runs are searched for the tag. */
const SCAN_RUNS_SEARCHED = 50

/**
 * How `gh repo view` reports a repository that does not exist. Any other
 * failure (auth, network, rate limit) is not read as "missing".
 */
const REPO_NOT_FOUND_RE = /Could not resolve to a Repository with the name/

/** What a subprocess (`git`, `gh`) returned. */
export interface CommandOutput {
    /** Whether it exited 0. */
    ok: boolean
    /** Trimmed stdout. */
    stdout: string
    /** Trimmed stderr. */
    stderr: string
}

/**
 * Runs `gh` with the given arguments. The default spawns the real CLI; tests
 * hand in a fake.
 */
export type GhRunner = (args: string[]) => Promise<CommandOutput>

/** Everything {@link mirrorPackages} needs, with its seams injectable. */
export interface MirrorOptions {
    /** The monorepo checkout to build from (its `deno.jsonc`, tags, remotes). */
    root: string
    /**
     * Where mirrors live: each is `<mirrorBaseUrl>/<name>.git`. Defaults to
     * `https://github.com/locknessland` in the CLI; a directory in tests.
     */
    mirrorBaseUrl: string
    /** Runs `gh` (repository view/create/edit, the workflow run list). */
    gh: GhRunner
    /**
     * The environment git runs with, before `sanitizedGitEnv` strips every
     * repository-local variable and disables replace refs. Defaults to this
     * process's.
     */
    gitEnv?: Record<string, string>
    /** Report the plan; push nothing and create nothing. */
    dryRun?: boolean
    /** Create a mirror repository that does not exist yet. */
    create?: boolean
    /** Drop the parent: a single-commit history (initial import only). */
    flatten?: boolean
    /** Receives each report line. Defaults to `console.log`. */
    log?: (line: string) => void
}

/** The outcome of one {@link mirrorPackages} run. */
export interface MirrorRun {
    /** `false` when provenance was refused or any mirror failed. */
    ok: boolean
    /** Every report line, in order. */
    lines: string[]
}

/** The state of one package's mirror, as read before pushing. */
interface MirrorState {
    /** Short package name, which is also the repository name. */
    name: string
    /** The `packages/<name>` tree at the release tag. */
    tree: string
    /** `false` when the repository does not exist yet. */
    exists: boolean
}

/** Bound helpers for one run. */
interface Context {
    /** The run's options. */
    options: MirrorOptions
    /** `git` in the monorepo root, with the sanitised environment. */
    git: (args: string[]) => Promise<GitOutput>
}

/**
 * The variables `gh` is allowed to inherit: where it finds itself and its
 * config, its credentials for github.com, locale, temp dir, and proxy / CA
 * settings. Everything else — `GH_HOST`, `GH_REPO`, `GH_ENTERPRISE_TOKEN`,
 * `GH_DEBUG`, every `GIT_*` — is dropped.
 */
const GH_ENV_KEYS: readonly string[] = [
    'PATH',
    'HOME',
    'USER',
    'LOGNAME',
    'TMPDIR',
    'LANG',
    'LC_ALL',
    'LC_CTYPE',
    'XDG_CONFIG_HOME',
    'XDG_STATE_HOME',
    'XDG_DATA_HOME',
    'XDG_CACHE_HOME',
    'GH_CONFIG_DIR',
    'GH_TOKEN',
    'GITHUB_TOKEN',
    'HTTPS_PROXY',
    'https_proxy',
    'HTTP_PROXY',
    'http_proxy',
    'NO_PROXY',
    'no_proxy',
    'ALL_PROXY',
    'all_proxy',
    'SSL_CERT_FILE',
    'SSL_CERT_DIR',
    // Windows: where gh finds its config and the system.
    'APPDATA',
    'LOCALAPPDATA',
    'USERPROFILE',
    'SYSTEMROOT',
    'PATHEXT',
]

/**
 * The explicit environment the `gh` subprocess runs with: only
 * {@link GH_ENV_KEYS} from `base`, with the host pinned to `github.com` and
 * prompts off. A stray `GH_HOST` (or `GH_REPO`, or an enterprise token) in
 * the calling shell therefore cannot point the provenance check — the
 * `Secret scan` run list — or a repository create/edit at another host.
 *
 * @param base - The environment to pick from. Defaults to this process's.
 * @returns The environment to hand to `Deno.Command` with `clearEnv`.
 * @example
 * ```ts
 * ghEnv({ PATH: '/usr/bin', GH_HOST: 'evil.example' })
 * // { PATH: '/usr/bin', GH_HOST: 'github.com', GH_PROMPT_DISABLED: '1', … }
 * ```
 */
export function ghEnv(
    base: Record<string, string> = Deno.env.toObject(),
): Record<string, string> {
    const env: Record<string, string> = {}
    for (const key of GH_ENV_KEYS) {
        if (base[key] !== undefined) env[key] = base[key]
    }
    env.GH_HOST = 'github.com'
    env.GH_PROMPT_DISABLED = '1'
    env.GH_NO_UPDATE_NOTIFIER = '1'
    return env
}

/**
 * The default {@link GhRunner}: the real `gh` CLI, run in `root` with
 * {@link ghEnv} and `clearEnv`, never the full inherited environment.
 *
 * @param root - The working directory.
 * @param env - The environment {@link ghEnv} picks from. Defaults to this
 *   process's.
 * @returns A runner capturing stdout and stderr.
 */
export function ghCli(
    root: string,
    env: Record<string, string> = Deno.env.toObject(),
): GhRunner {
    return async (args) => {
        const run = await new Deno.Command('gh', {
            args,
            cwd: root,
            clearEnv: true,
            env: ghEnv(env),
            stdout: 'piped',
            stderr: 'piped',
        }).output()
        const decode = (bytes: Uint8Array) =>
            new TextDecoder().decode(bytes).trim()
        return {
            ok: run.success,
            stdout: decode(run.stdout),
            stderr: decode(run.stderr),
        }
    }
}

/**
 * Indent every stderr line under a report line, so a failure's cause is
 * shown whole rather than reduced to its last line.
 *
 * @param stderr - The captured stderr.
 * @returns Report lines, or none when stderr was empty.
 */
function stderrLines(stderr: string): string[] {
    return stderr.split('\n').filter((l) => l.trim()).map((l) => `     ${l}`)
}

/**
 * The workspace version, which selects the release tag.
 *
 * @param text - A `deno.jsonc` document.
 * @returns Its `version`, or `null` when it has none.
 */
function versionOf(text: string): string | null {
    const config = parseJsonc(text) as { version?: unknown } | null
    return typeof config?.version === 'string' ? config.version : null
}

/**
 * Check where the release came from before anything is built. Every check
 * that fails names its cause; nothing is pushed after a refusal.
 *
 * @param ctx - The run's helpers.
 * @param version - The workspace version.
 * @returns The tag's commit, or the refusal reason.
 */
async function checkProvenance(
    ctx: Context,
    version: string,
): Promise<{ commit: string } | { error: string[] }> {
    const tag = `v${version}`
    const tagRef = `refs/tags/${tag}`

    const fetched = await ctx.git(['fetch', '--quiet', '--no-tags', 'origin'])
    if (!fetched.ok) {
        return {
            error: ['git fetch origin failed', ...stderrLines(fetched.stderr)],
        }
    }

    const local = await ctx.git(['rev-parse', '--verify', '--quiet', tagRef])
    if (!local.ok) {
        return {
            error: [
                `tag ${tag} does not exist locally — cut the release (/ship) ` +
                'or fetch its tag first',
            ],
        }
    }
    const commit = await ctx.git([
        'rev-parse',
        '--verify',
        '--quiet',
        `${tagRef}^{commit}`,
    ])
    if (!commit.ok) return { error: [`tag ${tag} does not point at a commit`] }

    const remote = await ctx.git(['ls-remote', '--tags', 'origin', tagRef])
    if (!remote.ok) {
        return {
            error: [
                `git ls-remote origin ${tagRef} failed`,
                ...stderrLines(remote.stderr),
            ],
        }
    }
    const remoteSha = remote.stdout
        .split('\n')
        .map((line) => line.split(/\s+/))
        .find(([, ref]) => ref === tagRef)?.[0]
    if (remoteSha === undefined) {
        return { error: [`tag ${tag} is not on origin — push it first`] }
    }
    if (remoteSha !== local.stdout) {
        return {
            error: [
                `local tag ${tag} (${
                    local.stdout.slice(0, 12)
                }) differs from origin's (${remoteSha.slice(0, 12)})`,
            ],
        }
    }

    const onMain = await ctx.git([
        'merge-base',
        '--is-ancestor',
        commit.stdout,
        'refs/remotes/origin/main',
    ])
    if (onMain.code === 1) {
        return { error: [`tag ${tag} is not an ancestor of origin/main`] }
    }
    if (!onMain.ok) {
        return {
            error: [
                `could not compare ${tag} with origin/main`,
                ...stderrLines(onMain.stderr),
            ],
        }
    }

    const config = await ctx.git(['show', `${commit.stdout}:deno.jsonc`])
    const tagged = config.ok ? versionOf(config.stdout) : null
    if (tagged !== version) {
        return {
            error: [
                `tag ${tag} carries version ${tagged ?? 'none'} in deno.jsonc`,
            ],
        }
    }

    const runs = await ctx.options.gh([
        'run',
        'list',
        '--repo',
        SOURCE_REPO,
        '--workflow',
        SECRET_SCAN_WORKFLOW,
        '--branch',
        'main',
        '--event',
        'push',
        '--status',
        'success',
        '--limit',
        String(SCAN_RUNS_SEARCHED),
        '--json',
        'headSha,event,headBranch,conclusion',
    ])
    if (!runs.ok) {
        return {
            error: [
                `gh run list (${SECRET_SCAN_WORKFLOW}) failed`,
                ...stderrLines(runs.stderr),
            ],
        }
    }
    let heads: string[]
    try {
        const parsed = JSON.parse(runs.stdout) as {
            headSha?: unknown
            event?: unknown
            headBranch?: unknown
            conclusion?: unknown
        }[]
        // Re-check what `gh` filtered on: only a successful push to main
        // counts. `--status success` is the one filter that makes a run
        // provenance at all, so it is not left to the flag alone.
        heads = parsed
            .filter((run) =>
                run.event === 'push' && run.headBranch === 'main' &&
                run.conclusion === 'success'
            )
            .map((run) => run.headSha)
            .filter((sha): sha is string =>
                typeof sha === 'string' && OBJECT_ID_RE.test(sha)
            )
    } catch {
        return { error: ['gh run list returned unreadable JSON'] }
    }
    for (const head of heads) {
        // The scanned head must itself be on origin/main, and the tag
        // commit must be that head or one of its ancestors. A head this
        // clone does not hold fails both checks and is skipped.
        const onMain = await ctx.git([
            'merge-base',
            '--is-ancestor',
            head,
            'refs/remotes/origin/main',
        ])
        if (!onMain.ok) continue
        const contains = await ctx.git([
            'merge-base',
            '--is-ancestor',
            commit.stdout,
            head,
        ])
        if (contains.ok) return { commit: commit.stdout }
    }
    return {
        error: [
            `no green ${SECRET_SCAN_WORKFLOW} run (push to main, head on ` +
            `origin/main) contains ${tag} (searched the last ` +
            `${SCAN_RUNS_SEARCHED}) — wait for the scan`,
        ],
    }
}

/**
 * The package directories at the release commit.
 *
 * @param ctx - The run's helpers.
 * @param commit - The release commit.
 * @returns Sorted package names.
 * @throws {Error} When `packages/` cannot be listed at that commit.
 */
async function packageNames(ctx: Context, commit: string): Promise<string[]> {
    const listed = await ctx.git([
        'ls-tree',
        '-d',
        '--name-only',
        `${commit}:packages`,
    ])
    if (!listed.ok) throw new Error(`no packages/ at ${commit}`)
    return listed.stdout
        .split('\n')
        .filter((name) => name.length > 0 && !name.startsWith('.'))
        .sort()
}

/**
 * Collect the state of one package's mirror.
 *
 * @param ctx - The run's helpers.
 * @param name - Package name.
 * @param commit - The release commit the tree is read from.
 * @returns The mirror's state, or why its existence could not be read.
 * @throws {Error} When the package has no tree at the release commit.
 */
async function inspect(
    ctx: Context,
    name: string,
    commit: string,
): Promise<MirrorState | { error: string[] }> {
    const tree = await ctx.git(['rev-parse', `${commit}:packages/${name}`])
    if (!tree.ok) throw new Error(`no tree for packages/${name} at ${commit}`)
    const view = await ctx.options.gh([
        'repo',
        'view',
        `${OWNER}/${name}`,
        '--json',
        'name',
    ])
    if (view.ok) return { name, tree: tree.stdout, exists: true }
    if (REPO_NOT_FOUND_RE.test(view.stderr)) {
        return { name, tree: tree.stdout, exists: false }
    }
    // Fail closed: an auth, network or rate-limit error says nothing about
    // whether the repository exists.
    return {
        error: [
            `gh repo view ${OWNER}/${name} failed`,
            ...stderrLines(view.stderr),
        ],
    }
}

/** The mirror description, so nobody mistakes a mirror for the source. */
function description(name: string): string {
    return `[READ ONLY] @lockness/${name} — subtree mirror. Source, issues ` +
        `and pull requests: ${SOURCE_REPO}`
}

/**
 * Sync one mirror: fetch its head, reuse it or build a release commit on
 * top, and push only the refs that differ, atomically.
 *
 * @param ctx - The run's helpers.
 * @param mirror - The mirror's state.
 * @param version - The release version.
 * @returns Whether it succeeded, and its report lines.
 */
async function syncMirror(
    ctx: Context,
    mirror: MirrorState,
    version: string,
): Promise<{ ok: boolean; lines: string[] }> {
    const { dryRun = false, flatten = false } = ctx.options
    const label = `  ${mirror.name.padEnd(24)}`
    const url = `${ctx.options.mirrorBaseUrl}/${mirror.name}.git`
    const headRef = 'refs/heads/main'
    const tagRef = `refs/tags/v${version}`
    const fail = (why: string, stderr = '') => ({
        ok: false,
        lines: [`❌${label} ${why}`, ...stderrLines(stderr)],
    })

    const listed = await ctx.git(['ls-remote', url, headRef, tagRef])
    if (!listed.ok) return fail('git ls-remote failed', listed.stderr)
    const remote = new Map<string, string>()
    for (const line of listed.stdout.split('\n')) {
        const [sha, ref] = line.split(/\s+/)
        if (sha && ref) remote.set(ref, sha)
    }
    const head = remote.get(headRef) ?? null

    // Fetch the head into a local ref before `commit-tree -p` names it, so
    // the parent is a referenced object — present even in a clone that never
    // held the mirror's history, and kept by `git gc`.
    let reusable = false
    if (head !== null) {
        const fetched = await ctx.git([
            'fetch',
            '--quiet',
            '--no-tags',
            url,
            `+${headRef}:refs/mirrors/${mirror.name}/main`,
        ])
        if (!fetched.ok) {
            return fail('could not fetch the mirror head', fetched.stderr)
        }
        const headTree = await ctx.git(['rev-parse', `${head}^{tree}`])
        const parents = await ctx.git(['rev-parse', `${head}^@`])
        reusable = headTree.ok && headTree.stdout === mirror.tree &&
            (!flatten || (parents.ok && parents.stdout === ''))
    }

    let commit: string | null = reusable ? head : null
    const pushes: string[] = []
    if (commit === null && dryRun) {
        pushes.push(headRef, tagRef)
    } else {
        if (commit === null) {
            const body = `Release v${version}\n\n` +
                `Generated from ${SOURCE_REPO} at v${version}.\n` +
                `This repository is READ ONLY — it is overwritten on every ` +
                `release.\nOpen issues and pull requests against ` +
                `${SOURCE_REPO}.\n`
            const args = ['commit-tree', mirror.tree]
            // `flatten` drops the parent: a single-commit history, for the
            // initial import only. Normally each release appends one commit.
            if (head !== null && !flatten) args.push('-p', head)
            args.push('-m', body)
            const made = await ctx.git(args)
            if (!made.ok) return fail('commit-tree failed', made.stderr)
            commit = made.stdout
        }
        if (remote.get(headRef) !== commit) pushes.push(headRef)
        if (remote.get(tagRef) !== commit) pushes.push(tagRef)
    }

    if (pushes.length === 0) {
        return { ok: true, lines: [`✅${label} already at v${version}`] }
    }
    const kind = pushes.length === 2
        ? 'branch + tag'
        : pushes[0] === headRef
        ? 'branch only'
        : 'tag only'
    if (dryRun) {
        const state = head === null ? 'empty' : head.slice(0, 7)
        return {
            ok: true,
            lines: [`→ ${label} ${state} ⇒ ${kind}, v${version}`],
        }
    }

    // `--force`: a mirror is generated, and every commit says it is
    // overwritten on each release. `--atomic`: branch and tag land together
    // or not at all.
    const pushed = await ctx.git([
        'push',
        '--atomic',
        '--force',
        '--quiet',
        url,
        ...pushes.map((ref) => `${commit}:${ref}`),
    ])
    if (!pushed.ok) return fail(`push (${kind}) refused`, pushed.stderr)

    if (pushes.includes(headRef)) {
        const edited = await ctx.options.gh([
            'repo',
            'edit',
            `${OWNER}/${mirror.name}`,
            '--description',
            description(mirror.name),
        ])
        if (!edited.ok) {
            return fail(
                `v${version} (${kind}) pushed, but the [READ ONLY] ` +
                    'description update failed',
                edited.stderr,
            )
        }
    }
    return { ok: true, lines: [`✅${label} v${version} (${kind})`] }
}

/**
 * Mirror every package at the workspace version, from its release tag.
 *
 * @param options - Root, mirror base URL, `gh` runner and flags.
 * @returns Whether every mirror is at the release, and the report. A refused
 *   provenance check or a failed mirror is `ok: false`, never a throw.
 * @throws {Deno.errors.NotFound} When `<root>/deno.jsonc` does not exist
 *   (any other read error propagates the same way).
 * @throws {SyntaxError} When `deno.jsonc` is not valid JSONC.
 * @throws {Error} When `packages/` cannot be listed at the release commit,
 *   or a package directory has no tree there — both after provenance passed
 *   and before anything is pushed or created.
 * @example
 * ```ts
 * const run = await mirrorPackages({
 *     root: Deno.cwd(),
 *     mirrorBaseUrl: 'https://github.com/locknessland',
 *     gh: ghCli(Deno.cwd()),
 * })
 * if (!run.ok) Deno.exit(1)
 * ```
 */
export async function mirrorPackages(
    options: MirrorOptions,
): Promise<MirrorRun> {
    const lines: string[] = []
    const say = (line: string) => {
        lines.push(line)
        ;(options.log ?? console.log)(line)
    }
    const ctx: Context = {
        options,
        git: (args) => runGit(args, options.root, options.gitEnv),
    }

    const version = versionOf(
        await Deno.readTextFile(join(options.root, 'deno.jsonc')),
    )
    if (version === null) {
        say('❌ no "version" in deno.jsonc')
        return { ok: false, lines }
    }

    const provenance = await checkProvenance(ctx, version)
    if ('error' in provenance) {
        say(`❌ provenance refused for v${version}:`)
        for (const line of provenance.error) say(`   ${line}`)
        return { ok: false, lines }
    }

    const names = await packageNames(ctx, provenance.commit)
    say(
        `🪞 ${names.length} packages · v${version} (${
            provenance.commit.slice(0, 7)
        }) · source ${SOURCE_REPO}`,
    )

    const mirrors: MirrorState[] = []
    for (const name of names) {
        const state = await inspect(ctx, name, provenance.commit)
        if ('error' in state) {
            say(`❌ could not tell whether ${OWNER}/${name} exists:`)
            for (const line of state.error) say(`   ${line}`)
            say('Nothing was pushed or created.')
            return { ok: false, lines }
        }
        mirrors.push(state)
    }

    let ok = true
    const missing = mirrors.filter((m) => !m.exists)
    if (missing.length > 0) {
        say(`${missing.length} mirror(s) do not exist yet:`)
        for (const m of missing) say(`  • ${OWNER}/${m.name}`)
        if (!options.create) {
            say('  Pass --create to create them.')
        } else if (!options.dryRun) {
            for (const m of missing) {
                const created = await options.gh([
                    'repo',
                    'create',
                    `${OWNER}/${m.name}`,
                    '--public',
                    '--description',
                    description(m.name),
                ])
                say(`  ${created.ok ? '✅' : '❌'} ${OWNER}/${m.name}`)
                for (const line of stderrLines(created.stderr)) say(line)
                if (created.ok) m.exists = true
                else ok = false
            }
        }
    }

    let synced = 0
    let failed = 0
    for (const mirror of mirrors) {
        if (!mirror.exists) {
            say(`  ⏭  ${mirror.name.padEnd(24)} no repository`)
            continue
        }
        const result = await syncMirror(ctx, mirror, version)
        for (const line of result.lines) say(line)
        if (result.ok) synced++
        else failed++
    }

    say(
        `${
            options.dryRun
                ? 'Would sync'
                : 'Synced'
        }: ${synced} · failed: ${failed}`,
    )
    return { ok: ok && failed === 0, lines }
}

if (import.meta.main) {
    const root = Deno.cwd()
    const run = await mirrorPackages({
        root,
        mirrorBaseUrl: `https://github.com/${OWNER}`,
        gh: ghCli(root),
        dryRun: Deno.args.includes('--dry-run'),
        create: Deno.args.includes('--create'),
        flatten: Deno.args.includes('--flatten'),
    })
    if (!run.ok) Deno.exit(1)
}
