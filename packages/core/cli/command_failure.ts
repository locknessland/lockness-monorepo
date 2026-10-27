/**
 * @fileoverview Core's one local failure class for its CLI commands (#436).
 *
 * A command reports failure by throwing an `Error` with an integer
 * `exitCode`: `@lockness/cli`'s `Cli.dispatch()` recognises that shape, prints
 * `❌ <message>` once (then the rendered `cause`) and exits non-zero. Core may
 * not import `@lockness/cli` at runtime (`deps.policy.jsonc`), so it matches
 * the shape with this local class instead of importing `CommandFailedError`.
 *
 * Internal: this module is not in core's `exports`, and nothing public
 * re-exports it. A conformance test (`packages/core/tests/command_failure.test.ts`)
 * runs it through the real `Cli.dispatch`.
 *
 * @module @lockness/core/cli/command_failure
 * @internal
 */

/**
 * Thrown by a core command (`compile`) to report that it did not do its job.
 *
 * The message is one line you wrote; a caught error goes in `cause`, never in
 * the message — the dispatcher prints the cause after it, rendered with its
 * credentials redacted. Always exits `1`.
 *
 * @example
 * ```ts
 * throw new CoreCommandFailure('Failed to generate routes', { cause: error })
 * ```
 */
export class CoreCommandFailure extends Error {
    /** The process exit status `Cli.dispatch()` reports for this failure. */
    readonly exitCode = 1
    override readonly name = 'CoreCommandFailure'
}
