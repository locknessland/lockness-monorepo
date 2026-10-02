/**
 * @fileoverview Pin `Math.random` for one test's scope (#498).
 *
 * Both retry paths draw their delay with full jitter — `nextDelay` in
 * `backoff.ts` and the inline copy in `subscriber.ts` — so any assertion that
 * depends on WHEN a window closes or a retry fires depends on a draw the test
 * does not control. #498 was one: a 1ms draw let a refusal window expire
 * mid-loop and CI saw a third dial. Pinning the draw turns "holds for most
 * draws" into "holds for this draw", and lets a test name the draw it needs —
 * the minimum when it proves a bound, the maximum when it needs a retry to stay
 * pending.
 *
 * **The binding owns the restore**, for the reason `liveWarnings` in
 * `subscriber.test.ts` gives (#287): a handback the caller must remember to
 * call is a handback a throwing test forgets, and every later test in the file
 * then runs against a constant `Math.random`. `using` restores it on scope
 * exit, return or throw.
 *
 * @module @lockness/redis/tests/pinned_random
 */

/**
 * The largest double below 1 — the top of `Math.random()`'s range, which is
 * half-open. `Math.floor(TOP_DRAW * ceiling)` is `ceiling - 1` for any integer
 * ceiling above 1, the longest delay either retry path can produce.
 */
export const TOP_DRAW = 1 - Number.EPSILON / 2

/**
 * Replace `Math.random` with a fixed draw, or a fixed cycle of draws, until the
 * returned binding is disposed.
 *
 * @param draws - One draw to return every time, or several to cycle through in
 *   order. Each must be in `[0, 1)`, as a real draw is.
 * @returns A disposable that restores the real `Math.random`, plus `calls` —
 *   how many draws were taken, so a test can pin the premise that the code
 *   under test actually reached the stub.
 * @throws {RangeError} If no draw is given or one lies outside `[0, 1)`.
 * @example
 * ```typescript
 * using random = pinRandom(0) // every delay is the 1ms floor
 * // ... drive the subject ...
 * assert(random.calls() > 0, 'the jitter was drawn')
 * ```
 */
export function pinRandom(
    ...draws: number[]
): { calls: () => number; [Symbol.dispose]: () => void } {
    if (draws.length === 0) {
        throw new RangeError('pinRandom: at least one draw is required')
    }
    for (const draw of draws) {
        if (!(draw >= 0 && draw < 1)) {
            throw new RangeError(
                `pinRandom: a draw must lie in [0, 1), got ${draw}`,
            )
        }
    }
    const real = Math.random
    let taken = 0
    Math.random = () => draws[taken++ % draws.length]
    return {
        calls: () => taken,
        [Symbol.dispose]: () => void (Math.random = real),
    }
}
