/**
 * @fileoverview The CLI exit contract — how a command reports that it failed.
 *
 * A command handler reports failure by **throwing**. {@link Cli.dispatch}
 * prints the failure once and maps it to the process exit status, so a script
 * or CI job that branches on the status never reads a failed command as a
 * success (#428).
 *
 * The contract is recognised by **shape, not by class**: any `Error` carrying
 * an integer `exitCode` is an expected failure. A package whose dependency
 * policy forbids importing `@lockness/cli` meets the contract with a local
 * subclass of `Error`, and the check survives two copies of this package
 * being loaded side by side.
 *
 * This module imports nothing, so a package can reach it without pulling in
 * the command registry.
 *
 * @module @lockness/cli/command_failure
 */

/** Lowest exit status that signals failure. */
const MIN_FAILURE_STATUS = 1

/** Highest exit status a POSIX process can report. */
const MAX_EXIT_STATUS = 255

/**
 * An error that satisfies the exit contract: an `Error` with an integer
 * `exitCode`.
 */
export type CommandFailure = Error & { readonly exitCode: number }

/** Options accepted by {@link CommandFailedError}. */
export interface CommandFailedErrorOptions {
    /**
     * The process exit status to report, `1`–`255`. Anything else (including
     * `0`, which would claim success) is reported as `1`. Defaults to `1`.
     */
    readonly exitCode?: number
    /** The underlying error, kept for programmatic callers. */
    readonly cause?: unknown
}

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
export function isCommandFailure(error: unknown): error is CommandFailure {
    return error instanceof Error &&
        Number.isInteger((error as { exitCode?: unknown }).exitCode)
}

/**
 * Thrown by a command handler to report that the command did not do its job.
 *
 * {@link Cli.dispatch} prints `❌ <message>` once — no stack, because the
 * message already explains the failure — and exits with {@link exitCode}.
 * Throw a plain `Error` instead for a failure you did not anticipate; that one
 * is printed with its stack.
 *
 * @example
 * ```ts
 * import { CommandFailedError } from '@lockness/cli'
 *
 * cli.register('deploy', async () => {
 *     const code = await runMigrations()
 *     if (code !== 0) {
 *         throw new CommandFailedError(`Migrations failed (exited ${code})`)
 *     }
 * })
 * ```
 */
export class CommandFailedError extends Error {
    /** The process exit status to report, always `1`–`255`. */
    readonly exitCode: number

    /**
     * @param message - What failed, shown to the user as `❌ <message>`.
     * @param options - The exit status (default `1`) and an optional cause.
     */
    constructor(message: string, options: CommandFailedErrorOptions = {}) {
        super(
            message,
            options.cause === undefined ? undefined : { cause: options.cause },
        )
        this.name = 'CommandFailedError'
        this.exitCode = toFailureStatus(options.exitCode ?? MIN_FAILURE_STATUS)
    }
}
