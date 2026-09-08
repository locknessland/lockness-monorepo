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

import { type Mutation, runBattery } from '@mutations/harness.ts'

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
        // TWO SITES SINCE #295/FR-023. The latch is normally consumed at
        // the FIRST landed write, so that the revocation fast path does not
        // wait on every hosted channel's frame; the tail only covers an
        // activation that issued nothing. Mutating the tail alone leaves the
        // early site to fire the seam anyway, and the row reported SURVIVED
        // on a guarantee that is still enforced — a false negative, which is
        // worse here than a false positive.
        edits: [
            [
                'if (feedsTheSeam && this.#reconnectIntent) {',
                'if (!feedsTheSeam && this.#reconnectIntent) {',
            ],
            [
                'const asReconnect = this.#reconnectIntent\n            this.#reconnectIntent = false',
                'const asReconnect = false\n            this.#reconnectIntent = false',
            ],
        ],
        // RE-ATTRIBUTED, and the reason is worth keeping. The declared killer
        // was FR-022's "the activation that ENDS an outage", which no longer
        // fails: negating `feedsTheSeam` makes the seam fire LATER — at write 2
        // of a multi-pattern re-issue — rather than never, and FR-022 only
        // requires that it fire. What the mutation actually breaks is the seam
        // firing at all on a single-pattern activation, which is what the
        // on-point `onReconnect` control observes.
        killedBy: 'onReconnect fires once after a reconnect re-issues its',
    },
    {
        // The clear half — the row the first two cannot reach.
        label: 'the intent is never consumed, so every later subscribe on a ' +
            'healthy socket reports a reconnect that is not happening',
        file: SUBSCRIBER,
        // TWO SITES SINCE #295/FR-023. The latch is normally consumed at
        // the FIRST landed write, so that the revocation fast path does not
        // wait on every hosted channel's frame; the tail only covers an
        // activation that issued nothing. Mutating the tail alone leaves the
        // early site to fire the seam anyway, and the row reported SURVIVED
        // on a guarantee that is still enforced — a false negative, which is
        // worse here than a false positive.
        edits: [
            [
                '                    this.#reconnectIntent = false\n                    firedEarly = true',
                '                    firedEarly = true',
            ],
            [
                'const asReconnect = this.#reconnectIntent\n            this.#reconnectIntent = false',
                'const asReconnect = this.#reconnectIntent',
            ],
        ],
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
            'this.#scheduleRetry(wasDelivering || firedEarly, error)',
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
        // TWO SITES SINCE #295/FR-023 — see the rows above. Racing
        // activations now consume the latch at the first landed write, so
        // moving only the tail's clear leaves the early one ordering it
        // correctly and the row proves nothing.
        edits: [
            [
                '                    this.#reconnectIntent = false\n                    firedEarly = true\n                    await this.#fireReconnect()',
                '                    firedEarly = true\n                    await this.#fireReconnect()\n                    this.#reconnectIntent = false',
            ],
            [
                'const asReconnect = this.#reconnectIntent\n            this.#reconnectIntent = false\n            if (asReconnect) await this.#fireReconnect()',
                'const asReconnect = this.#reconnectIntent\n            if (asReconnect) await this.#fireReconnect()\n            this.#reconnectIntent = false',
            ],
        ],
        killedBy: 'fire the seam once, not twice',
    },
    {
        // #307. Recorded as a survivor with its reasoning, rather than left as
        // a gap someone re-discovers — and rather than relabelled onto
        // whichever test happens to fail.
        label:
            'the promotion moved BELOW the early return — a `true` folding ' +
            'into an armed chain is dropped',
        file: SUBSCRIBER,
        edits: [[
            'this.#reconnectIntent ||= isReconnect\n        if (this.#retryTimer !== undefined) return',
            'if (this.#retryTimer !== undefined) return\n        this.#reconnectIntent ||= isReconnect',
        ]],
        killedBy: 'latches toward',
        expectSurvival:
            'UNREACHABLE, not uncovered — and the difference is the whole ' +
            'point of recording it. Losing a fire needs a `false` to arm the ' +
            "chain BEFORE a `true` folds in. Only `#activate`'s catch can " +
            'pass `false`, and since #290 it decides on `wasDelivering`, so a ' +
            '`false` means no read loop is running on that socket — leaving ' +
            'nothing to produce the later `true`, whose only two sources (the ' +
            'read fault, the keepalive stall) both need a live one. Every ' +
            'discard site pairs with a schedule except the ' +
            '`RespCommandTooLargeError` return, which is itself documented as ' +
            'unreachable in practice — an argument that rests entirely on the ' +
            'row below reading `wasDelivering`, so read the two together. ' +
            '#307 asked for a test constructing a ' +
            'muted-write `false`; measured, that path now yields `true`, so ' +
            'the construction the issue prescribes cannot be written. The ' +
            'placement stays: it costs nothing, and the failure it prevents ' +
            'is a reconnect that never fires, which looks exactly like an ' +
            'outage that never happened.',
    },
    {
        // #313. Row 5 pins this line against a flat `true`; this pins the
        // other direction, which is the one that matters more. A flat `false`
        // is exactly the regression that makes #307's losing order reachable
        // again — and it would land in silence, because #307's own survivor
        // row keeps surviving and the battery stays green while the reasoning
        // written in two places quietly stops being true.
        label: 'the failed activation promotes a flat `false` instead of ' +
            'reading wasDelivering',
        file: SUBSCRIBER,
        edits: [[
            'this.#scheduleRetry(wasDelivering || firedEarly, error)',
            'this.#scheduleRetry(false, error)',
        ]],
        killedBy: 'the activation that ENDS an outage',
        expectSurvival:
            'SURVIVES, and the survival is the finding #313 asked for. A ' +
            'failed activation on a delivering socket has just discarded it, ' +
            "so that socket's pending `readReply` rejects and the read loop " +
            'promotes `true` anyway — `wasDelivering` is defence in depth ' +
            'against losing that race, not a fix for an observable loss. The ' +
            'security seat that proposed it said the same: it could not ' +
            'construct a reliable loss either, and called the old flat `false` ' +
            '"correctness by race margin". So this row cannot be killed today ' +
            "for the same reason #307's row cannot. THAT PAIRING IS THE " +
            'POINT: #307 argues the promotion placement is unreachable BECAUSE ' +
            'this line reads `wasDelivering`, so if this ever becomes a flat ' +
            "`false` again, #307's argument is false and its row silently " +
            'stops meaning anything. Neither row can prove the other; together ' +
            'they at least make the dependency visible to whoever edits either.',
    },
]

if (import.meta.main) {
    Deno.exit(
        await runBattery('#290 — the reconnect intent', SUITES, MUTATIONS) > 0
            ? 1
            : 0,
    )
}
