/**
 * @fileoverview The CLI exit contract — how a command reports that it failed.
 *
 * A command handler reports failure by **throwing**. `Cli.dispatch()`
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
 * Recognising the shape is internal to `Cli.dispatch()`: a producer meets the
 * contract by throwing an error of the {@link CommandFailure} shape, and
 * needs nothing else from this package.
 *
 * Its only import is the package-internal `exit_status.ts`, which imports
 * nothing, and it is exported on its own as
 * `@lockness/cli/command-failure`. A package whose runtime code must stay
 * light — `@lockness/drizzle`'s commands are loaded whenever an application
 * boots with a database — imports it from there rather than from the
 * `@lockness/cli` barrel, which pulls in every built-in command.
 *
 * @example
 * ```ts
 * import { CommandFailedError } from '@lockness/cli/command-failure'
 *
 * throw new CommandFailedError('Failed to apply migrations (drizzle-kit migrate exited 1)')
 * ```
 *
 * @module @lockness/cli/command-failure
 */

import { MIN_FAILURE_STATUS, toFailureStatus } from './exit_status.ts'

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
    /**
     * The error that caused the failure. `Cli.dispatch()` and `runEntry`
     * print it after the message, rendered with `renderError` (credentials
     * redacted, no frames), so never repeat its text in the message.
     */
    readonly cause?: unknown
}

/**
 * Thrown by a command handler to report that the command did not do its job.
 *
 * `Cli.dispatch()` prints `❌ <message>` once — no stack, because the
 * message already explains the failure — then the rendered `cause`, when there
 * is one, and exits with {@link exitCode}. The message is one line you wrote;
 * a caught error belongs in `cause`, never in the message.
 * Throw a plain `Error` instead for a failure you did not anticipate; that one
 * is printed with its stack frames, credentials redacted.
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
     * Create a failure to throw from a command handler.
     *
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

/** One step of a multi-step command, run by {@link runSteps}. */
export interface CommandStep {
    /** Names the step in the failure message, e.g. `repository`. */
    readonly label: string
    /** Does the step's work. A throw, synchronous or not, fails the step. */
    readonly run: () => void | Promise<void>
}

/**
 * Run every step of a multi-step command, then fail once naming the steps
 * that failed — finish, then fail (#436, P1).
 *
 * A scaffolder that writes a model, a repository and a factory should not
 * leave the user guessing which files exist after one write fails, nor stop
 * at the first failure and skip files it could have written. So every step
 * runs, in order, whatever the one before it did; then, if any failed, one
 * {@link CommandFailedError} is thrown: `<n> of <m> steps failed: <labels>`,
 * with the first failure as its `cause`, which `Cli.dispatch()` prints
 * rendered after the message. Later failures are named by label only.
 *
 * @param steps - The steps, in the order they run.
 * @returns A promise that resolves when every step passed.
 * @throws {CommandFailedError} When at least one step threw.
 *
 * @example
 * ```ts
 * import { runSteps } from '@lockness/cli/command-failure'
 *
 * await runSteps([
 *     { label: 'model', run: () => writeModel(name) },
 *     { label: 'repository', run: () => writeRepository(name) },
 * ])
 * // throws CommandFailedError('1 of 2 steps failed: repository') if one write throws
 * ```
 */
export async function runSteps(steps: readonly CommandStep[]): Promise<void> {
    const failed: string[] = []
    let firstFailure: unknown
    for (const step of steps) {
        try {
            await step.run()
        } catch (error) {
            // Kept, not swallowed: the first failure becomes the cause of the
            // failure thrown below, and every failed step is named in it.
            if (failed.length === 0) firstFailure = error
            failed.push(step.label)
        }
    }
    if (failed.length === 0) return
    throw new CommandFailedError(
        `${failed.length} of ${steps.length} steps failed: ${
            failed.join(', ')
        }`,
        { cause: firstFailure },
    )
}
