/**
 * @fileoverview How a thrown error is printed once and mapped to an exit
 * status — for a registered command and for a standalone entry alike (#436).
 *
 * The single home for two decisions:
 *
 * - **What a throw looks like on stderr.** A failure-shaped error (see
 *   `exit_status.ts`) prints `❌ <message>`, its message rendered with
 *   `renderMessage` and its `cause`, when it has one, with `renderError` —
 *   no frames, because the message already explains the failure. Anything else
 *   prints `❌ <label> failed:` and the error rendered with its frames, or raw
 *   behind a banner when `LOCKNESS_CLI_RAW_ERRORS` is on. Each case is exactly
 *   one `console.error` call.
 * - **Where the process status is written.** `applyExitStatus` is the only
 *   `Deno.exitCode` write in the package.
 *
 * `Cli.dispatch`, `Cli.run` and `runEntry` call it, so a command and a
 * standalone tool cannot drift apart on either.
 *
 * Package-internal: not listed in `deno.json` `exports`, and it never imports
 * the barrel, so `@lockness/cli/entry` stays free of the command graph.
 *
 * @internal
 * @module
 */

import { renderError } from '@lockness/contract'
import { renderMessage } from '@lockness/contract/logging/internal'
import {
    isCommandFailure,
    MIN_FAILURE_STATUS,
    toFailureStatus,
} from './exit_status.ts'
import { rawErrorsHint, readRawErrorsSwitch } from './raw_errors.ts'

/**
 * Print `error` once and return the exit status it maps to. **Total: it never
 * throws.**
 *
 * It runs inside a `catch` block, with nothing left above it to catch a second
 * error — so a getter that throws on `message`, `cause` or `exitCode` must not
 * replace the error being reported. An unreadable `message` or `cause` prints
 * a placeholder in its place; anything else that throws while reporting falls
 * back to one line naming `label`, and when even that line cannot be printed
 * the status is still returned. `label` is rendered with `renderMessage` on
 * every branch.
 *
 * @param label - What failed, for the non-failure branch: a command name, or a
 *   standalone tool's name.
 * @param error - Whatever was thrown.
 * @returns The exit status: the failure's `exitCode` clamped to `1`–`255`, or
 *   `1` for anything else. Never `0`.
 *
 * @example
 * ```ts
 * try {
 *     await handler(args)
 *     return 0
 * } catch (error) {
 *     return reportThrown(commandName, error)
 * }
 * ```
 */
export function reportThrown(label: string, error: unknown): number {
    try {
        return isCommandFailure(error)
            ? reportFailure(error)
            : reportUnexpected(label, error)
    } catch {
        // The sentinel is printed, never swallowed: the user still sees that
        // `label` failed, and the status is still a failure.
        printFallback(label)
        return MIN_FAILURE_STATUS
    }
}

/**
 * The one fallback line, guarded on its own: when stderr itself is what
 * broke, there is nowhere left to print, and {@link reportThrown} must still
 * return a failure status rather than throw out of a `catch` block.
 */
function printFallback(label: string): void {
    try {
        console.error(`❌ ${renderMessage(label)} failed: [unreportable error]`)
    } catch {
        // Nothing to log to: stderr is the thing that failed. The non-zero
        // status the caller returns is the report.
    }
}

/**
 * Write a non-zero status to `Deno.exitCode`; leave it as it was for `0`.
 *
 * The status is set, never forced with `Deno.exit()`: the process ends
 * normally, so `finally` blocks still run and buffered output is not cut off.
 *
 * @param status - An exit status, `0` for success.
 *
 * @example
 * ```ts
 * applyExitStatus(await cli.dispatch(Deno.args))
 * ```
 */
export function applyExitStatus(status: number): void {
    if (status !== 0) {
        Deno.exitCode = status
    }
}

/**
 * The failure branch: `❌ <message>`, then ` caused by: <cause>` when the
 * failure carries one, in one `console.error` call.
 *
 * The status is read first, so a getter that throws on `exitCode` reaches the
 * fallback in {@link reportThrown} before anything is printed — never after,
 * which would print twice.
 */
function reportFailure(error: Error & { readonly exitCode: number }): number {
    const status = toFailureStatus(error.exitCode)
    console.error(`❌ ${readMessage(error)}${readCause(error)}`)
    return status
}

/** The rendered message, or a placeholder when reading it throws. */
function readMessage(error: Error): string {
    try {
        return renderMessage(String(error.message))
    } catch {
        // Printed in the message's place, so the line says one was there.
        return '[unreadable message]'
    }
}

/**
 * ` caused by: <rendered cause>`, `''` without a cause, or a placeholder when
 * reading it throws.
 */
function readCause(error: Error): string {
    try {
        const cause = error.cause
        return cause === undefined ? '' : ` caused by: ${renderError(cause)}`
    } catch {
        // Printed in the cause's place, the same sentinel `renderError` uses.
        return ' caused by: [unreadable cause]'
    }
}

/**
 * The non-failure branch: the error rendered with its frames and the raw-switch
 * hint, or raw behind a banner when the switch is on.
 */
function reportUnexpected(label: string, error: unknown): number {
    // Read here and only here, so no other path needs `--allow-env`. Total and
    // prompt-free (#508): nothing it meets can replace `error` or stall the
    // report on a permission prompt.
    const raw = readRawErrorsSwitch()
    if (raw.state === 'on') {
        console.error(
            `⚠️ LOCKNESS_CLI_RAW_ERRORS is on: the error below is unredacted.\n❌ ${
                renderMessage(label)
            } failed:`,
            error,
        )
        return MIN_FAILURE_STATUS
    }
    console.error(
        `❌ ${renderMessage(label)} failed: ${
            renderError(error, { frames: 10 })
        }\n${rawErrorsHint(raw)}`,
    )
    return MIN_FAILURE_STATUS
}
