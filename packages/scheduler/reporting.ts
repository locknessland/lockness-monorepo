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
 * **#410 — CR/LF-safe, on the architect-expert disposition.** An unencoded
 * `\r`/`\n` in `message` or in a string-valued `fields` entry forges a second
 * log line on any of the three channels, so {@link escapeControlChars} covers
 * the C0/C1/DEL subset of `@lockness/contract`'s `safeForLog` table only —
 * same escape spelling (`\xXX`), so a line reads the same way whether it came
 * through this module or through `safeForLog`. Not the full table: no
 * Unicode `Cf`/bidi handling, no DSN redaction. Neither is a new dependency:
 * this package's `allow: []` ceiling has no room for an edge to
 * `@lockness/contract` for either — see this file's own header above.
 *
 * **What this still does not solve** (unchanged from #394, plus two more):
 * a reporter that hangs rather than throws; a Unicode bidi character in a
 * field, which reorders a terminal line but does not forge one; and a
 * non-string field value other than `BigInt` or a circular reference — those
 * still fall to {@link renderLine}'s `JSON.stringify` catch exactly as they
 * did before #410.
 *
 * @module @lockness/scheduler/reporting
 */

import type { SchedulerReporter } from './types.ts'

/** The two report levels a {@link SchedulerReporter} exposes. */
export type ReportLevel = 'warn' | 'error'

/**
 * Escapes the C0 controls, DEL and the C1 range — the one subset of
 * `@lockness/contract`'s `safeForLog` table this module needs, spelled the
 * same way (`\xXX`) so a log line reads identically wherever it was encoded.
 *
 * **Deliberately narrower than `safeForLog`.** No Unicode `Cf`/bidi handling
 * and no DSN redaction: `report()`'s `fields` are scheduler-internal (a task
 * name, a delay in ms), not a request-derived value, so the forgery this
 * closes is CR/LF turning one warning into two log lines — not bidi reordering
 * or a leaked credential. Pulling in `safeForLog` itself is not available
 * either way: `deps.policy.jsonc` sets this package's `allow: []`, and a new
 * edge to `@lockness/contract` is not worth opening for a ten-line idiom (see
 * this file's `@fileoverview` for the #394 precedent this follows).
 *
 * @param value - A message or field value about to reach `console` or
 * `Deno.stderr`.
 * @returns `value` with every C0/C1/DEL codepoint replaced by its `\xXX`
 * escape. Everything else, `value` unchanged.
 */
function escapeControlChars(value: string): string {
    let escaped = ''
    for (const char of value) {
        const code = char.codePointAt(0) ?? 0
        const mustEscape = code < 0x20 || code === 0x7f ||
            (code >= 0x80 && code <= 0x9f)
        escaped += mustEscape
            ? `\\x${code.toString(16).padStart(2, '0')}`
            : char
    }
    return escaped
}

/**
 * Escapes every string-valued entry of `fields`, leaving every other value —
 * a number, a `BigInt`, a circular object — untouched.
 *
 * **Only for the console and stderr channels.** The reporter callback gets
 * `fields` raw and structured: an application's own logger owns encoding for
 * its own sink, and handing it a pre-stringified transcript would cost it the
 * structured value it asked for.
 *
 * **Shallow on purpose.** A string nested inside an object or an array, or
 * a control character in a key, is not escaped here: `console` (via
 * `Deno.inspect`) and `JSON.stringify` in `renderLine` each render it as a
 * literal `\r` / `\n` escape, so no raw line break reaches either channel.
 * That guarantee belongs to those two formatters, not to this function; a
 * channel that interpolated `fields` into a string directly would need this
 * encoder to recurse first.
 *
 * @param fields - The line's structured half.
 * @returns A shallow copy of `fields` with its string values escaped.
 */
function escapeStringFields(
    fields: Record<string, unknown>,
): Record<string, unknown> {
    const escaped: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(fields)) {
        escaped[key] = typeof value === 'string'
            ? escapeControlChars(value)
            : value
    }
    return escaped
}

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
 * **#410 — encoding, and who gets what.** `message` is run through
 * {@link escapeControlChars} unconditionally, once, at the top — before the
 * reporter is even tried — so every channel, including the reporter callback,
 * sees a CR/LF-safe message and a forged warning cannot masquerade as a
 * second log line. `fields` is different: it is escaped (its string values
 * only; a `BigInt`, a number, a nested object pass through untouched) for the
 * `console` and stderr/{@link renderLine} channels, but the reporter receives
 * it raw and structured — the application's own logger owns how it encodes
 * its own sink, and a pre-stringified transcript would cost it the value it
 * asked for.
 *
 * @param reporter - Where the caller would prefer this to land. `undefined`
 * skips straight to `console`.
 * @param level - Which method to call, on the reporter and on `console`.
 * @param message - The line's message half. Encoded before any channel sees
 * it.
 * @param fields - The line's structured half. Raw for `reporter`; encoded
 * (string values only) for `console` and `Deno.stderr`.
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
    message = escapeControlChars(message)
    try {
        if (reporter) {
            reporter[level](message, fields)
            return
        }
    } catch {
        // The reporter threw: fall through to console.
    }
    fields = escapeStringFields(fields)
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
