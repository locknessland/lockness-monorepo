/**
 * @fileoverview #315's mutation battery — the anchoring suite names its
 * subscriptions by identity, not by glob shape.
 *
 * `prefix_anchoring.test.ts` told its two subscriptions apart with
 * `pattern.endsWith('*')` at four sites. That separates them *today* and is a
 * property of neither: the driver opens a control topic (`${prefix}__control`,
 * glob-free) and an event glob (`${prefix}__event:*`), and only the second
 * happens to carry a star. If it ever stops, `filter(endsWith('*'))` returns
 * `[]`, SC-002's US2 loop runs zero times, and the suite goes green **having
 * stopped checking the thing it exists to check** — that routing alone can
 * never hand a control frame to `onMessage`, where `#verifyAndDecode` is not.
 *
 * **`killedBy` is what makes this battery a differential and not a formality.**
 * Both rows below also break `FR-001`'s exact-set pin, so both were RED before
 * #315 too — a plain kill would prove nothing here. What changed is *which*
 * test kills them. Each row names `SC-002`, and the harness requires that test
 * to be among the failures, so the same two rows run against the pre-#315,
 * shape-bound file report MISATTRIBUTED rather than KILLED. Measured, with the
 * four sites reverted to `endsWith('*')` and quoted from that run:
 *
 * - row 1 failed `FR-001`, `SC-001`, `FR-002` (both) — **`SC-002` passed**
 * - row 2 failed `FR-001`, `SC-001`, `SC-005` — **`SC-002` passed**
 *
 * On this file's tree both are KILLED, which is exactly the statement that
 * `SC-002` now fails on each. That one test moving from pass to fail is the
 * whole of #315: it is the test whose US2 loop was running zero times.
 *
 * Row 1 is also the shape the issue asked for — an event subscription that is
 * glob-free and still anchored under the prefix — and it is the dangerous one:
 * every event frame would then arrive on a seam with no MAC check.
 *
 * ```bash
 * deno run -A packages/realtime/tests/mutations/subscription_identity_315.ts
 * ```
 *
 * @module @lockness/realtime/tests/mutations/subscription_identity_315
 */

import { type Mutation, runBattery } from '@mutations/harness.ts'

const DRIVER = new URL('../../drivers/redis.ts', import.meta.url)
const SUITES = [
    new URL('../prefix_anchoring.test.ts', import.meta.url).pathname,
]

const MUTATIONS: Mutation[] = [
    {
        label:
            'the event subscription is opened on the control topic — glob-free, ' +
            'still anchored',
        file: DRIVER,
        edits: [[
            '        const pattern = `${marker}*`',
            '        const pattern = this.controlTopic',
        ]],
        killedBy: 'SC-002: no accepted prefix can reach another',
    },
    {
        label:
            'a THIRD subscription, anchored under the prefix but in neither family',
        file: DRIVER,
        edits: [[
            '        this.subscriber.psubscribe(pattern, (topic, payload) => {',
            '        this.subscriber.psubscribe(`${this.controlTopic}:legacy`, () => {})\n' +
            '        this.subscriber.psubscribe(pattern, (topic, payload) => {',
        ]],
        killedBy: 'SC-002: no accepted prefix can reach another',
    },
]

if (import.meta.main) {
    Deno.exit(
        await runBattery(
                '#315 — subscriptions named by identity',
                SUITES,
                MUTATIONS,
            ) > 0
            ? 1
            : 0,
    )
}
