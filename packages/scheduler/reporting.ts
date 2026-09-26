/**
 * @fileoverview The one home of the scheduler's reporter guard (#394) —
 * internal to `@lockness/scheduler`, never re-exported from `mod.ts`.
 *
 * `Scheduler#warn`, `TimerRegistry#warn`, and `task_runner.ts`'s `guard()` and
 * `report()` each used to read `reporter ?? console` unguarded. An
 * application's own reporter throwing on a WARN or an ERROR call then had
 * nowhere to go: on the cron path (`void this.#run(name)` in `scheduler.ts`)
 * that throw becomes an unhandled rejection, and on
 * `TimerRegistry#arm`'s synchronous clamp warning — fired directly out of
 * `register()`, outside any promise — it is an uncaught exception. Either one
 * terminates the process on Deno.
 *
 * **The channels, tried in order.** The reporter first, so an installed
 * application logger is preferred. If it throws (or is absent), `console`
 * next, so the line still reaches wherever `console` writes on this platform.
 * If THAT throws too, the same line goes to `Deno.stderr.writeSync`, past the
 * console entirely. If all three fail, the line is dropped — see the comment
 * at the last catch.
 *
 * **Reimplemented here, not shared with `@lockness/realtime`'s
 * `marked_fallback.ts`.** The same three-channel never-throw shape (#391), but
 * this package's call is `(message, fields)`, not realtime's
 * `(marker, subject, failure)`, and `@lockness/scheduler`'s dependency ceiling
 * (`deps.policy.jsonc`, `allow: []`) has no room for a new edge to
 * `@lockness/contract` for a ten-line idiom that would not even fit this call
 * shape unchanged. See the architect-expert disposition on #394 for the
 * rejected alternatives and what this does not solve (a reporter that hangs
 * rather than throws).
 *
 * @module @lockness/scheduler/reporting
 */

import type { SchedulerReporter } from './types.ts'

/** The two report levels a {@link SchedulerReporter} exposes. */
export type ReportLevel = 'warn' | 'error'

/**
 * Render a fallback line for the stderr channel, and never throw.
 *
 * `fields` is caller-supplied and may carry a value `JSON.stringify` refuses
 * (a circular reference, a `BigInt`) — that must not cost the message itself.
 *
 * @param message - The line's message half.
 * @param fields - The line's structured half.
 * @returns The rendered line, or `message` alone if `fields` could not be
 * rendered.
 */
function renderLine(
    message: string,
    fields: Record<string, unknown>,
): string {
    try {
        return `${message} ${JSON.stringify(fields)}`
    } catch {
        return message
    }
}

/**
 * Report through `reporter`, then `console`, then `Deno.stderr`, and never
 * throw.
 *
 * Tries `reporter?.[level]` first. Absent or throwing, it falls to
 * `console[level]`. Throwing too, it falls to `Deno.stderr.writeSync`.
 * Throwing even that, the message is dropped — there is no channel left that
 * has not already refused it, and a caller sitting inside a `finally` (or,
 * for {@link TimerRegistry}'s clamp warning, entirely outside a promise) has
 * no handler to receive a re-throw.
 *
 * @param reporter - Where the caller would prefer this to land. `undefined`
 * skips straight to `console`.
 * @param level - Which method to call, on the reporter and on `console`.
 * @param message - The line's message half.
 * @param fields - The line's structured half.
 * @returns Nothing: it cannot fail, only fail to be seen.
 *
 * @example
 * ```ts
 * report(reporter, 'warn', 'Scheduler clamped a delay up to the minimum.', {
 *     task: key,
 *     requestedMs: delayMs,
 *     clampedToMs: MIN_DELAY_MS,
 * })
 * ```
 */
export function report(
    reporter: SchedulerReporter | undefined,
    level: ReportLevel,
    message: string,
    fields: Record<string, unknown>,
): void {
    try {
        if (reporter) {
            reporter[level](message, fields)
            return
        }
    } catch {
        // The reporter threw: fall through to console.
    }
    try {
        console[level](`⚠️  ${message}`, fields)
        return
    } catch {
        // The console refused too: write past it.
    }
    try {
        Deno.stderr.writeSync(
            new TextEncoder().encode(`${renderLine(message, fields)}\n`),
        )
    } catch {
        // #394 THE LAST RESORT: the reporter, the console and stderr all
        // refused, so no channel is left to log this on, and a re-throw would
        // reach a caller that has none — an unhandled rejection on the cron
        // path, or an uncaught exception on TimerRegistry's synchronous clamp
        // path. Dropping one log line is the lesser harm.
    }
}
