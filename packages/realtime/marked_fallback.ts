/**
 * @fileoverview The one home of the marked fallback line (#369, #391) —
 * internal to `@lockness/realtime`, never re-exported from `mod.ts`.
 *
 * Several sinks in this package end a chain that has no caller left to hand a
 * failure to: a WARN that could not be written, an `onError` hook that threw,
 * a pass chain's last `.catch`. Each writes ONE marked line instead, and on
 * Deno a throw from that line would be the very unhandled rejection (or
 * uncaught timer exception) it exists to stop — the process terminates. So
 * the line is written here, and this function never throws.
 *
 * **The format is fixed**: the marker is the fixed prefix, so no error text
 * can forge it; every variable part goes through `renderError`, so no error
 * text can break the line or smuggle a control character:
 *
 * ```text
 * <marker> <renderError(subject)>[; <label>: <renderError(failure.error)>]
 * ```
 *
 * **The channels, in order.** `console.error` first, so an application that
 * patched its console still receives the line. If that throws, the same line
 * and a newline go to `Deno.stderr.writeSync`, which bypasses the console
 * entirely. If THAT throws too, nothing is left to write to, and the line is
 * dropped by the one final catch — see the comment there. What this does not
 * solve: a line that reaches neither channel is lost, and a partial write to
 * stderr is not retried.
 *
 * @module @lockness/realtime/marked_fallback
 */

import { renderError } from '@lockness/contract'

/** The second half of a two-part marked line: what ALSO failed, and how. */
export interface MarkedFallbackFailure {
    /** The words before the second rendered error. */
    readonly label: 'hook failure' | 'sink failure'
    /** What the hook or the log sink threw. */
    readonly error: unknown
}

/**
 * Write one marked fallback line, and never throw.
 *
 * @param marker - The fixed prefix; written verbatim, never rendered.
 * @param subject - What the line reports, rendered after the marker.
 * @param failure - The second half, when the line carries two failures.
 * @returns Nothing: it cannot fail, only fail to be seen.
 *
 * @example
 * ```ts
 * writeMarkedFallback(SWEEP_LOG_FAILED, error)
 * writeMarkedFallback(PASS_SAMPLE_LOG_FAILED, failure, {
 *     label: 'sink failure',
 *     error: sink,
 * })
 * ```
 */
export function writeMarkedFallback(
    marker: string,
    subject: unknown,
    failure?: MarkedFallbackFailure,
): void {
    let line = marker
    try {
        line = `${marker} ${renderError(subject)}` +
            (failure === undefined
                ? ''
                : `; ${failure.label}: ${renderError(failure.error)}`)
        console.error(line)
    } catch {
        // The console refused the ERROR line: write it past the console.
        try {
            Deno.stderr.writeSync(new TextEncoder().encode(`${line}\n`))
        } catch {
            // #391 THE LAST RESORT: the console and stderr both refused, so
            // no channel is left to log this on, and a re-throw would reach
            // a caller that has none — an unhandled rejection or an uncaught
            // timer exception, which terminates the process on Deno. Dropping
            // one log line is the lesser harm.
        }
    }
}
