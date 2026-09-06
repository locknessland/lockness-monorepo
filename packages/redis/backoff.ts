/**
 * @fileoverview The retry curve, as a pure function — the single home for its
 * SHAPE (#299).
 *
 * **The shape is shared; the state is not.** `RedisSubscribeConnection` and
 * `RedisClient` need the same curve and have genuinely different policies: the
 * subscribe path *schedules* a retry and nobody is waiting, while the command
 * path *rejects* immediately because a caller is holding the promise. Sharing
 * the state would put command-path retry policy inside a primitive that
 * `connection.ts` explicitly disclaims it for — "Each consumer owns its own
 * command discipline… this primitive owns only the socket's birth and its
 * self-healing death" — and which both consumers share, so a streak nothing
 * resets would only ever grow.
 *
 * Sharing only the curve is what stops two spellings of one product diverging,
 * which is the outcome where the second one is always the one nobody tunes.
 *
 * @module @lockness/redis/backoff
 */

/**
 * The delay before the next attempt, full-jitter exponential.
 *
 * **Full jitter, not exponential-with-a-fixed-delay.** A fleet of clients that
 * all lost the same broker retries at the same instant otherwise, and the
 * recovering broker meets the whole fleet at once. Randomising across the whole
 * interval spreads them; `Math.random()` is right here and is not a security
 * primitive — this is a thundering-herd control, not a secret.
 *
 * @param attempts - Consecutive failures so far, 1 for the first retry.
 * @param baseMs - The first attempt's ceiling.
 * @param maxMs - The ceiling's own ceiling.
 * @returns A delay of at least 1ms, never longer than `maxMs`.
 * @example
 * ```typescript
 * nextDelay(1, 250, 30_000) // somewhere in 1..250
 * nextDelay(8, 250, 30_000) // somewhere in 1..30000, the cap reached
 * ```
 */
export function nextDelay(
    attempts: number,
    baseMs: number,
    maxMs: number,
): number {
    const ceiling = Math.min(maxMs, baseMs * 2 ** (attempts - 1))
    return Math.max(1, Math.floor(Math.random() * ceiling))
}
