/**
 * @fileoverview The retry curve, tested directly (#299).
 *
 * It had no test of its own: every client-level test set
 * `retryBaseMs === retryMaxMs`, which pins both the `2 ** (attempts - 1)`
 * growth term and the `min` cap to one value, so line coverage ran the function
 * while nothing asserted what it produced. A review seat named that, and it is
 * the same class as a mutation that cannot execute — code exercised is not code
 * checked.
 *
 * @module @lockness/redis/tests/backoff
 */

import { assert } from '@std/assert'
import { nextDelay } from '../backoff.ts'
import { pinRandom, TOP_DRAW } from './pinned_random.ts'

Deno.test('#299: the delay grows exponentially until the cap, then stops', () => {
    const base = 100
    const max = 1000
    // Full jitter means each call is a draw from [1, ceiling], so the CEILING
    // is what is asserted. It used to be found by sampling — 400 real draws
    // per attempt, then "the highest landed above half" — a verdict resting on
    // luck, however good the odds (#498). The draws are now named: a sweep
    // across the range must never leave it, and the TOP of the range must land
    // on the ceiling itself, which pins the curve exactly rather than to
    // within a factor of two.
    for (
        const [attempts, ceiling] of [[1, 100], [2, 200], [3, 400], [8, 1000]]
    ) {
        for (const draw of [0, 0.25, 0.5, 0.75, TOP_DRAW]) {
            using _random = pinRandom(draw)
            const d = nextDelay(attempts, base, max)
            assert(
                d >= 1 && d <= ceiling,
                `attempt ${attempts} at draw ${draw} produced ${d}, outside ` +
                    `1..${ceiling}`,
            )
        }
        using _top = pinRandom(TOP_DRAW)
        const top = nextDelay(attempts, base, max)
        assert(
            top >= ceiling - 1,
            `attempt ${attempts}'s longest possible delay is ${top}ms, short ` +
                `of its ${ceiling}ms ceiling — the jitter is not spanning the ` +
                'interval, so the curve is not what it claims',
        )
    }
})

Deno.test('#299: the delay is never zero', () => {
    // `Math.floor(Math.random() * ceiling)` is 0 whenever the sample lands in
    // the first 1/ceiling of the interval, and a zero delay is no delay at all
    // — the window would close the instant it opened.
    for (let i = 0; i < 2000; i++) {
        assert(nextDelay(1, 1, 1) >= 1, 'a zero delay is not a backoff')
    }
})

Deno.test('#299: the cap binds regardless of how far the streak runs', () => {
    // 2 ** 39 milliseconds is about 17 years; without the `min` it overflows
    // any sane window and the client stops retrying for the life of the
    // universe rather than the life of the outage.
    for (const attempts of [40, 100]) {
        assert(
            nextDelay(attempts, 250, 30_000) <= 30_000,
            `attempt ${attempts} escaped the cap`,
        )
    }
})
