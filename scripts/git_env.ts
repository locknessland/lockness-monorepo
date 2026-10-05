/**
 * @fileoverview The environment every release/CI script hands to a `git`
 * subprocess.
 *
 * git exports `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE` and more to its
 * hooks, and a shell started from a hook or from another worktree may carry
 * them too. Inherited by a child `git`, they redirect it at another
 * repository, object store, index or config than the `cwd` the script passed
 * explicitly — which is how a test fixture once rewrote the real repository's
 * config. Every `git` call in `scripts/prepush_secret_scan.ts`,
 * `scripts/published_objects.ts` and `scripts/mirror_packages.ts` goes
 * through {@link runGit}, which spawns it with this environment and
 * `clearEnv` — there is no second spawn path to keep in step.
 *
 * Replace refs are disabled too (`GIT_NO_REPLACE_OBJECTS=1`): with a
 * `refs/replace/*` in place, `rev-list` would walk the replacement while
 * `pack-objects` sends the original, so admission and gitleaks would judge a
 * different object than the one that leaves.
 *
 * @module
 */

/**
 * Every repository-local variable git knows — exactly what
 * `git rev-parse --local-env-vars` prints (git 2.54). A child `git` given any
 * of them could read or write somewhere other than its `cwd`. The list is
 * pinned against that command by `scripts/git_env_test.ts`, so a git upgrade
 * that adds one fails the gate instead of silently leaking it.
 */
export const GIT_ENV_LEAK_KEYS: readonly string[] = [
    'GIT_ALTERNATE_OBJECT_DIRECTORIES',
    'GIT_CONFIG',
    'GIT_CONFIG_PARAMETERS',
    'GIT_CONFIG_COUNT',
    'GIT_OBJECT_DIRECTORY',
    'GIT_DIR',
    'GIT_WORK_TREE',
    'GIT_IMPLICIT_WORK_TREE',
    'GIT_GRAFT_FILE',
    'GIT_INDEX_FILE',
    'GIT_NO_REPLACE_OBJECTS',
    'GIT_REPLACE_REF_BASE',
    'GIT_PREFIX',
    'GIT_SHALLOW_FILE',
    'GIT_COMMON_DIR',
]

/**
 * The `GIT_CONFIG_KEY_<n>` / `GIT_CONFIG_VALUE_<n>` pairs `GIT_CONFIG_COUNT`
 * indexes. Inert once the count is gone, removed anyway.
 */
const GIT_CONFIG_PAIR_RE = /^GIT_CONFIG_(KEY|VALUE)_\d+$/

/**
 * An environment with {@link GIT_ENV_LEAK_KEYS} and every
 * `GIT_CONFIG_KEY_<n>` / `GIT_CONFIG_VALUE_<n>` removed, and replace refs
 * disabled (`GIT_NO_REPLACE_OBJECTS=1`).
 *
 * @param base - The environment to start from. Defaults to this process's.
 * @returns A copy of `base` safe to hand to `Deno.Command` with `clearEnv`.
 * @example
 * ```ts
 * new Deno.Command('git', { args, cwd, clearEnv: true, env: sanitizedGitEnv() })
 * ```
 */
export function sanitizedGitEnv(
    base: Record<string, string> = Deno.env.toObject(),
): Record<string, string> {
    const env = { ...base }
    for (const key of GIT_ENV_LEAK_KEYS) delete env[key]
    for (const key of Object.keys(env)) {
        if (GIT_CONFIG_PAIR_RE.test(key)) delete env[key]
    }
    env.GIT_NO_REPLACE_OBJECTS = '1'
    return env
}

/** All-zero placeholder git uses for "this ref does not exist (yet/anymore)". */
export const ZERO_SHA_RE: RegExp = /^0+$/

/**
 * A full object id (SHA-1 or SHA-256), lowercase hex — what git prints for a
 * sha in pre-push stdin and what `gh run list` reports as a `headSha`.
 * Anything else (a short sha, a ref name, an option such as `--all`) is not
 * an object id and is never handed to git as one.
 */
export const OBJECT_ID_RE: RegExp = /^[0-9a-f]{40}([0-9a-f]{24})?$/

/** What a `git` subprocess returned. */
export interface GitOutput {
    /** Whether git exited 0. */
    ok: boolean
    /** git's exit code. */
    code: number
    /** Trimmed stdout. */
    stdout: string
    /** Trimmed stderr. */
    stderr: string
}

/**
 * Run `git` in `cwd` with {@link sanitizedGitEnv} and `clearEnv` — the one
 * way the release/CI scripts spawn git.
 *
 * @param args - Arguments to `git`.
 * @param cwd - The directory git runs in.
 * @param env - The environment to sanitise and hand to git. Defaults to this
 *   process's; tests pass an isolated one (their own `HOME`, no global or
 *   system config).
 * @returns The exit status, and trimmed stdout and stderr.
 * @example
 * ```ts
 * const head = await runGit(['rev-parse', 'HEAD'], repoRoot)
 * if (head.ok) console.log(head.stdout)
 * ```
 */
export async function runGit(
    args: string[],
    cwd: string,
    env: Record<string, string> = Deno.env.toObject(),
): Promise<GitOutput> {
    const run = await new Deno.Command('git', {
        args,
        cwd,
        clearEnv: true,
        env: sanitizedGitEnv(env),
        stdout: 'piped',
        stderr: 'piped',
    }).output()
    const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes).trim()
    return {
        ok: run.success,
        code: run.code,
        stdout: decode(run.stdout),
        stderr: decode(run.stderr),
    }
}
