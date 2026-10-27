/**
 * @fileoverview How `Cli.dispatch()` recognises a command failure and maps it
 * to a process exit status.
 *
 * Package-internal: this module is not listed in `deno.json` `exports`, so no
 * exports entry reaches it. A producer meets the exit contract through the
 * public `CommandFailure` shape of `@lockness/cli/command-failure`; only the
 * dispatcher recognises it (#440(h)).
 *
 * It imports nothing, so `command_failure.ts`, which a package's commands load
 * at app boot, stays free of the barrel's command graph.
 *
 * @internal
 * @module
 */

/** Lowest exit status that signals failure. */
export const MIN_FAILURE_STATUS = 1

/** Highest exit status a POSIX process can report. */
const MAX_EXIT_STATUS = 255

/**
 * Map a candidate exit code to a failure status: an integer in `1`–`255` is
 * kept, anything else becomes `1`.
 *
 * A failure must never report `0`, and a code outside the range a process can
 * return would be truncated by the operating system (`256` reads as `0`).
 *
 * @param code - The candidate exit code.
 * @returns A failure status in `1`–`255`.
 *
 * @example
 * ```ts
 * toFailureStatus(3)   // 3
 * toFailureStatus(0)   // 1
 * toFailureStatus(256) // 1
 * ```
 */
export function toFailureStatus(code: number): number {
    return Number.isInteger(code) && code >= MIN_FAILURE_STATUS &&
            code <= MAX_EXIT_STATUS
        ? code
        : MIN_FAILURE_STATUS
}

/**
 * Whether `error` satisfies the exit contract — an `Error` with an integer
 * `exitCode`.
 *
 * Checked by shape rather than `instanceof CommandFailedError`, so a local
 * subclass in a package that cannot import `@lockness/cli` is recognised too.
 * The return type is written structurally, equal to the public
 * `CommandFailure`, so this module stays free of imports.
 *
 * @param error - Anything a handler threw.
 * @returns `true` when `error` is an expected, already-explained failure.
 *
 * @example
 * ```ts
 * isCommandFailure(new CommandFailedError('x'))                     // true
 * isCommandFailure(Object.assign(new Error('x'), { exitCode: 2 }))  // true
 * isCommandFailure(new Error('x'))                                  // false
 * ```
 */
export function isCommandFailure(
    error: unknown,
): error is Error & { readonly exitCode: number } {
    return error instanceof Error &&
        Number.isInteger((error as { exitCode?: unknown }).exitCode)
}
