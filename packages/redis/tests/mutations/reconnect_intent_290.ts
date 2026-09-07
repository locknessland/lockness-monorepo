/**
 * @fileoverview #290's mutation battery — who owns the reconnect intent.
 *
 * The seam's identity used to be a property of the CALLER: `#scheduleRetry`
 * recorded it and the retry timer consumed it on the way into `#activate`. So
 * an ordinary `psubscribe()` that happened to be the call re-dialling a healed
 * broker restored delivery carrying `false` — the seam fired only when the
 * pending retry got round to it, up to `retryMaxMs` (30s) later. It is now a
 * property of the OUTAGE: read at activation time, cleared only by an
 * activation that succeeds.
 *
 * **Two rows exist because that is two claims, not one.** Reading the latch and
 * clearing it are separate edits, and a battery that only mutated the read
 * would leave "fires forever after one outage" uncovered.
 *
 * Runs under `@lockness/contract`'s shared harness: green baseline before
 * anything is mutated, an atomic per-file lock, anchors matched exactly once, a
 * non-compiling mutant reported DEAD, and every kill attributed to the test
 * that claims it.
 *
 * ```bash
 * deno run -A packages/redis/tests/mutations/reconnect_intent_290.ts
 * ```
 *
 * @module @lockness/redis/tests/mutations/reconnect_intent_290
 */

import {
    type Mutation,
    runBattery,
} from '../../../contract/tests/mutations/harness.ts'

const SUBSCRIBER = new URL('../../subscriber.ts', import.meta.url)
const SUITES = [
    new URL('../subscriber.test.ts', import.meta.url).pathname,
]

const MUTATIONS: Mutation[] = [
    {
        // Where the intent used to be consumed. Any consumer other than a
        // SUCCEEDING activation loses the seam outright — the retry chain then
        // heals the outage carrying an intent it has already thrown away.
        //
        // It is deliberately NOT a faithful restoration of #290. The shipped
        // defect also had `#activate` take the answer from its caller, so the
        // retry path still fired and only a `psubscribe` that healed the broker
        // went quiet; row 2 is that half. One combined row was tried first and
        // the harness reported it MISATTRIBUTED — killed by an unrelated
        // re-dial test rather than by FR-022 — so the two claims stay apart. A
        // row whose kill lands on the wrong test proves nothing.
        label: 'the intent is consumed by the retry timer instead of by the ' +
            'activation that succeeds',
        file: SUBSCRIBER,
        edits: [[
            '            void this.#activate([...this.patterns.keys()])\n        }, delay)',
            '            this.#reconnectIntent = false\n' +
            '            void this.#activate([...this.patterns.keys()])\n        }, delay)',
        ]],
        killedBy: 'a multi-attempt recovery fires the seam EXACTLY once',
    },
    {
        // The read half of the fix.
        label: 'the activation stops reading the latch and never reports a ' +
            'reconnect at all',
        file: SUBSCRIBER,
        edits: [[
            'const asReconnect = this.#reconnectIntent\n            this.#reconnectIntent = false',
            'const asReconnect = false\n            this.#reconnectIntent = false',
        ]],
        killedBy: 'the activation that ENDS an outage',
    },
    {
        // The clear half — the row the first two cannot reach.
        label: 'the intent is never consumed, so every later subscribe on a ' +
            'healthy socket reports a reconnect that is not happening',
        file: SUBSCRIBER,
        edits: [[
            'const asReconnect = this.#reconnectIntent\n            this.#reconnectIntent = false',
            'const asReconnect = this.#reconnectIntent',
        ]],
        killedBy: 'consumed ONCE',
    },
    {
        // Monotonicity: still owed after the latch moved.
        label: 'the latch demoted rather than promoted — a `psubscribe` ' +
            'failure lowers a chain a read fault already raised',
        file: SUBSCRIBER,
        edits: [[
            'this.#reconnectIntent ||= isReconnect',
            'this.#reconnectIntent = isReconnect',
        ]],
        killedBy: 'latches toward',
    },
    {
        // The other direction: promoting where nothing was ever delivered.
        label: 'a FAILED activation promotes the intent, so a retried first ' +
            'connect reconciles a connection that never had state to lose',
        file: SUBSCRIBER,
        edits: [[
            'this.#scheduleRetry(wasDelivering, error)',
            'this.#scheduleRetry(true, error)',
        ]],
        killedBy: 'a retried FIRST connect fires nothing',
    },
    {
        // The consume-once half. Two activations share one single-flight socket
        // during an outage; clearing after the handler is awaited lets the
        // second read an intent the first is still firing on.
        label: 'the intent is cleared AFTER the handler is awaited, so two ' +
            'activations racing one outage each report the recovery',
        file: SUBSCRIBER,
        edits: [[
            'const asReconnect = this.#reconnectIntent\n            this.#reconnectIntent = false\n            if (asReconnect) await this.#fireReconnect()',
            'const asReconnect = this.#reconnectIntent\n            if (asReconnect) await this.#fireReconnect()\n            this.#reconnectIntent = false',
        ]],
        killedBy: 'fire the seam once, not twice',
    },
]

if (import.meta.main) {
    Deno.exit(
        await runBattery('#290 — the reconnect intent', SUITES, MUTATIONS) > 0
            ? 1
            : 0,
    )
}
