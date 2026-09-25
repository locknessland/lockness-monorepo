/**
 * @fileoverview #372's mutation battery — the one write path on
 * `RedisSubscribeConnection` that used to leave a failed frame's socket alone.
 *
 * `unsubscribeOne` retired its pattern and enqueued `PUNSUBSCRIBE` /
 * `UNSUBSCRIBE`, but on a rejected write it neither discarded the socket nor
 * scheduled a retry — the one writer on this connection that did not, where
 * `#activate`'s catch and the keepalive `PING`'s catch already do. A write
 * TIMEOUT in particular leaves the read loop healthy, so nothing else ever
 * reconnects, and the un-discarded generation can carry a partial frame that
 * desyncs every later write for every other hosted channel on the same
 * socket — the exact violation `packages/redis/AGENTS.md`'s "a desync
 * discards the socket and reconnects" invariant exists to rule out.
 *
 * Four rows, because that is four separate claims: the discard runs, the
 * retry is scheduled, the outage is reported as a reconnect when the socket
 * was delivering (so `onReconnect` still fires once healed), and a rejection
 * from a write already superseded by its own reconnect (`ABANDONED_WRITE`)
 * must not re-discard, or arm a spurious retry against, the LIVE replacement
 * generation.
 *
 * Runs under `@lockness/contract`'s shared harness: green baseline before
 * anything is mutated, an atomic per-file lock, anchors matched exactly once,
 * a non-compiling mutant reported DEAD, and every kill attributed to the test
 * that claims it.
 *
 * ```bash
 * deno run -A packages/redis/tests/mutations/unsubscribe_discard_372.ts
 * ```
 *
 * @module @lockness/redis/tests/mutations/unsubscribe_discard_372
 */

import { type Mutation, runBattery } from '@mutations/harness.ts'

const SUBSCRIBER = new URL('../../subscriber.ts', import.meta.url)
const SUITES = [
    new URL('../subscriber.test.ts', import.meta.url).pathname,
]

const MUTATIONS: Mutation[] = [
    {
        // The discard half. Without it, the retry timer's `connect()` hands
        // back the SAME cached (broken) socket — its generation already
        // matches, so the activation issues nothing and never re-dials.
        label: 'the socket is never discarded, so the retry it schedules ' +
            'reconnects to nothing',
        file: SUBSCRIBER,
        edits: [[
            '                    this.#discardSocket(conn)\n' +
            '                    this.#scheduleRetry(wasDelivering, error)',
            '                    this.#scheduleRetry(wasDelivering, error)',
        ]],
        killedBy: 'discards the socket and reconnects without re-subscribing',
    },
    {
        // The retry half — the row the discard alone cannot reach. Without a
        // scheduled retry, discarding the socket only stops the read loop; no
        // later reconnect is ever armed by this path.
        label: 'the socket is discarded but no retry is ever scheduled, so ' +
            'the connection goes deaf until an unrelated call re-activates it',
        file: SUBSCRIBER,
        edits: [[
            '                    this.#discardSocket(conn)\n' +
            '                    this.#scheduleRetry(wasDelivering, error)',
            '                    this.#discardSocket(conn)',
        ]],
        killedBy: 'discards the socket and reconnects without re-subscribing',
    },
    {
        // `wasDelivering` decides whether THIS call reports the outage it is
        // opening as a reconnect. Forcing it to `false` cannot be observed
        // here for the same reason #313 already recorded for `#activate`'s
        // identical line: `#discardSocket` closes the real socket, which
        // faults the read loop's own pending `readReply` — and that fault's
        // catch calls `#scheduleRetry(true, ..., 'read fault')`, which
        // promotes `#reconnectIntent` on its own, independent of what THIS
        // call passed. `#scheduleRetry` latches monotonically (#290/#307),
        // so a second promotion to `true` cannot be undone by the first
        // call's `false`. `wasDelivering` is defence in depth against losing
        // that second promotion, not a fix for an observable loss — the same
        // finding, on the same line, one call site over.
        label: 'wasDelivering is forced to false, so a socket that was ' +
            'actively delivering never reports its own recovery as one',
        file: SUBSCRIBER,
        edits: [[
            '                    const wasDelivering = this.loopConn === conn',
            '                    const wasDelivering = false',
        ]],
        killedBy: 'still fires onReconnect once healed',
        expectSurvival:
            'SURVIVES, for the reason #313 already recorded one call site ' +
            "over: discarding the socket faults the read loop's own " +
            "pending read, and that fault's `#scheduleRetry(true, ...)` " +
            'promotes the latch regardless of what this call passed. ' +
            'Measured, not assumed — running this battery with the mutation ' +
            'applied prints SURVIVED here, exactly as #313 predicts.',
    },
    {
        // The `ABANDONED_WRITE` guard. Removing it makes a write already
        // superseded by its own reconnect re-run discard/scheduleRetry
        // against a socket identity it does not own — a spurious retry timer
        // armed against a generation that is already live and healthy.
        label: 'the generation-identity guard is removed, so a write ' +
            'abandoned by its own reconnect still discards/retries against ' +
            'the LIVE replacement generation',
        file: SUBSCRIBER,
        edits: [[
            'if (this.#generation?.conn === conn) {\n' +
            '                    // Read BEFORE the discard, which nulls `loopConn` when it',
            '{\n' +
            '                    // Read BEFORE the discard, which nulls `loopConn` when it',
        ]],
        killedBy: 'does not re-discard a live replacement generation',
    },
]

if (import.meta.main) {
    Deno.exit(
        await runBattery(
                '#372 — unsubscribeOne discards and reconnects on a failed write',
                SUITES,
                MUTATIONS,
            ) > 0
            ? 1
            : 0,
    )
}
