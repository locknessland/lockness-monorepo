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
 * `scripts/published_objects.ts` and `scripts/mirror_packages.ts` runs with
 * this environment and `clearEnv`.
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
