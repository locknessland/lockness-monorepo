/**
 * @fileoverview The one home of turning an unknown caught value into
 * something safe — internal to `@lockness/scheduler`, never re-exported from
 * `mod.ts`.
 *
 * `scheduler.ts`'s two lock-failure catches and `task_runner.ts`'s retry loop
 * and `guard()` each used to normalise a caught value with their own copy of
 * `caught instanceof Error ? caught : new Error(String(caught))`. #389
 * hardened only the first of those (the version that also demotes to a plain
 * `{ name, message }` pair, for a log line) against a hostile rejection — a
 * revoked Proxy, or an `Error` whose `name`/`message` are throwing getters —
 * and the other two were left to drift. This module is the one place that
 * pattern is written, so a future hardening pass has one function to change,
 * not three.
 *
 * **The scheduler's `deps.policy.jsonc` is `allow: []`.** This stays an
 * internal module of `@lockness/scheduler` for that reason — it cannot move to
 * `@lockness/contract` or any other package.
 *
 * @module @lockness/scheduler/errors
 */

/**
 * Normalize an unknown caught value to a genuine `Error`.
 *
 * `task_runner.ts` hands the result straight into `TaskFailure.error`, a
 * public field typed `Error` (an application's `onError` callback may call
 * `.stack` or check `instanceof Error` on it) — so an already-`Error` value is
 * returned as-is, never rebuilt, and anything else is wrapped in a fresh one.
 *
 * **Not total on its own.** `caught instanceof Error` runs a Proxy's
 * `getPrototypeOf` trap and throws on a revoked one, and `String(caught)`
 * throws on a value with no usable `toString`. Neither call is guarded here —
 * {@link normalizeError} is the guarded caller for the one site that reads a
 * rejection value it does not control and cannot let escape.
 *
 * @param caught - Whatever a `catch` bound.
 * @returns `caught` itself when it is already an `Error`; otherwise a new
 * `Error` whose message is `String(caught)`.
 *
 * @example
 * ```ts
 * toError('not an error') // Error: not an error
 * toError(new TypeError('boom')) // the same TypeError instance
 * ```
 */
export function toError(caught: unknown): Error {
    return caught instanceof Error ? caught : new Error(String(caught))
}

/** What {@link normalizeError} logs for a rejection value `String()` cannot render. */
const UNPRINTABLE = '<unprintable>'

/**
 * An error reduced to its name and message, the way a report's fields log one.
 *
 * A lock adapter may reject with anything, and the raw object must never reach
 * a log line: a driver error's stack or `cause` can carry a connection string.
 *
 * **Total — it never throws.** It runs inside a `catch` in the run's `finally`,
 * and on the cron path the run is `void`ed, so a throw here is an unhandled
 * rejection that kills the process. Every read of the value is hostile input:
 * {@link toError}'s own `instanceof` and `String()` calls can throw, and an
 * `Error`'s `name` and `message` may be throwing getters or non-strings. All of
 * it sits in one `try`, and anything unexpected becomes the
 * {@link UNPRINTABLE} placeholder.
 *
 * @param caught - Whatever a `catch` bound.
 * @returns A safe `{ name, message }` pair, never the raw value.
 *
 * @example
 * ```ts
 * normalizeError(new Error('kv down')) // { name: 'Error', message: 'kv down' }
 * normalizeError('not an error') // { name: 'Error', message: 'not an error' }
 * ```
 */
export function normalizeError(
    caught: unknown,
): { name: string; message: string } {
    try {
        const error = toError(caught)
        const { name, message } = error
        if (typeof name === 'string' && typeof message === 'string') {
            return { name, message }
        }
        return { name: 'Error', message: UNPRINTABLE }
    } catch (_hostile) {
        // Not swallowed: the placeholder IS the report of this failure, and it
        // reaches the log line the caller is about to write.
        return { name: 'Error', message: UNPRINTABLE }
    }
}
