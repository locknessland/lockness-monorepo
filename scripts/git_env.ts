/**
 * @fileoverview The environment every release/CI script hands to a `git`
 * subprocess.
 *
 * git exports `GIT_DIR`, `GIT_WORK_TREE` and `GIT_INDEX_FILE` to its hooks,
 * and a shell started from a hook or from another worktree may carry them
 * too. Inherited by a child `git`, they redirect it at that repository
 * instead of the `cwd` the script passed explicitly — which is how a test
 * fixture once rewrote the real repository's config. Every `git` call in
 * `scripts/prepush_secret_scan.ts`, `scripts/published_objects.ts` and
 * `scripts/mirror_packages.ts` runs with this environment and `clearEnv`.
 *
 * @module
 */

/**
 * Variables that would redirect a child `git` away from its `cwd`: the
 * repository, its work tree, and its index.
 */
export const GIT_ENV_LEAK_KEYS: readonly string[] = [
    'GIT_DIR',
    'GIT_WORK_TREE',
    'GIT_INDEX_FILE',
]

/**
 * An environment with {@link GIT_ENV_LEAK_KEYS} removed.
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
    return env
}
