/**
 * @fileoverview The lockfile refresh every version bump ends with.
 *
 * `deno.lock` records each workspace member's `@lockness/*` range, so a bump
 * that rewrites the manifests leaves it naming the previous version. Left out of
 * the release commit, the first deno command on the tagged tree rewrites it, and
 * `deno publish` refuses the dirty checkout. v0.4.0's first publish failed that
 * way.
 *
 * Both bump paths call {@link refreshLockfile} after they write:
 * `scripts/bump-native.ts` (`deno task bump`) and `scripts/bump.ts`
 * (`deno task bump:legacy`). This module is the one home of the command, the
 * dry-run notice, and the failure and recovery message, so the two paths cannot
 * drift apart again (#429).
 *
 * @module scripts/lockfile
 *
 * @example
 * ```ts
 * import { refreshLockfile } from './lockfile.ts'
 *
 * const code = await refreshLockfile({ dryRun: false })
 * if (code !== 0) Deno.exit(code)
 * ```
 */

/** The `deno` arguments that regenerate `deno.lock` from the manifests. */
export const LOCKFILE_REFRESH_ARGS: readonly string[] = ['install']

/**
 * Runs `deno` with the given arguments and resolves to its exit code.
 *
 * @param args - Arguments passed to the `deno` executable.
 * @returns The subprocess exit code (0 on success).
 */
export type DenoRunner = (args: readonly string[]) => Promise<number>

/** Options for {@link refreshLockfile}. */
export interface RefreshLockfileOptions {
    /** When true, say the lockfile would be refreshed and run nothing. */
    dryRun?: boolean
    /** Replaces the `deno` subprocess. Tests inject one; callers do not. */
    run?: DenoRunner
}

/**
 * Run `deno` in the current working directory, inheriting its output.
 *
 * @param args - Arguments passed to the `deno` executable.
 * @returns The subprocess exit code.
 */
async function runDeno(args: readonly string[]): Promise<number> {
    const { code } = await new Deno.Command(Deno.execPath(), {
        args: [...args],
        stdout: 'inherit',
        stderr: 'inherit',
    }).output()
    return code
}

/**
 * The message printed when the refresh fails after a bump has been written.
 *
 * It names what is and is not applied, how to recover, and why re-running the
 * bump is wrong: an increment bump run twice takes two steps.
 *
 * @param code - The exit code `deno install` returned.
 * @returns The failure and recovery message.
 *
 * @example
 * ```ts
 * console.error(lockfileRefreshFailure(1))
 * ```
 */
export function lockfileRefreshFailure(code: number): string {
    return `deno install exited with code ${code}; deno.lock was not ` +
        'refreshed, and a release commit without it cannot be published. ' +
        'The version bump IS applied: run `deno install` once it can ' +
        'succeed, then commit. Do not re-run the bump, or it takes a second ' +
        'step.'
}

/**
 * Regenerate `deno.lock` so it records the bumped `@lockness/*` ranges.
 *
 * Call it after the manifests are written. In a dry run it prints that the
 * lockfile would be refreshed and runs nothing. On failure it prints
 * {@link lockfileRefreshFailure} and returns the non-zero code, which the
 * caller passes to `Deno.exit`.
 *
 * @param options - Dry-run switch and an optional runner override.
 * @returns 0 when the lockfile was refreshed (or a dry run), else the
 * `deno install` exit code.
 *
 * @example
 * ```ts
 * const code = await refreshLockfile({ dryRun: args['dry-run'] === true })
 * if (code !== 0) Deno.exit(code)
 * ```
 */
export async function refreshLockfile(
    options: RefreshLockfileOptions = {},
): Promise<number> {
    if (options.dryRun === true) {
        console.log('   deno.lock would be refreshed (deno install)')
        return 0
    }
    const code = await (options.run ?? runDeno)(LOCKFILE_REFRESH_ARGS)
    if (code !== 0) {
        console.error(lockfileRefreshFailure(code))
        return code
    }
    console.log('   deno.lock refreshed')
    return 0
}
