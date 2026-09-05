/**
 * @fileoverview Unit tests for the control-plane replay window (#272).
 *
 * The clock is injected rather than faked globally: the class takes a required
 * `now`, which is the whole point of that seam — a test drives time by moving a
 * variable, with no `FakeTime` and no shared global to restore.
 *
 * @module @lockness/realtime/tests/control_replay_window
 */

import { assertEquals } from '@std/assert'
import { ControlReplayWindow } from '../control_replay_window.ts'

const WINDOW = 30_000

/** A window with a clock the test moves by hand. */
function windowAt(start = 1_000_000, maxEntries?: number) {
    let clock = start
    const seen = new ControlReplayWindow({
        windowMs: WINDOW,
        now: () => clock,
        maxEntries,
    })
    return {
        seen,
        advance: (ms: number) => void (clock += ms),
        get now() {
            return clock
        },
    }
}

Deno.test('FR-002: a frame inside the window is admitted', () => {
    const { seen, now } = windowAt()
    assertEquals(seen.admit('a', 'n1', now), 'ok')
})

Deno.test('FR-002: a frame older than the window is stale', () => {
    const { seen, now } = windowAt()
    assertEquals(seen.admit('a', 'n1', now - WINDOW - 1), 'stale')
})

Deno.test('FR-002: a FUTURE-dated frame is stale too', () => {
    const { seen, now } = windowAt()
    // A one-sided check would let anyone who can push a clock forward extend
    // their own replay window without limit.
    assertEquals(seen.admit('a', 'n1', now + WINDOW + 1), 'stale')
})

Deno.test('FR-002: the window boundary is inclusive on both sides', () => {
    const { seen, now } = windowAt()
    assertEquals(seen.admit('a', 'past', now - WINDOW), 'ok')
    assertEquals(seen.admit('a', 'future', now + WINDOW), 'ok')
})

Deno.test('FR-003: the same (origin, nonce) twice is a duplicate', () => {
    const { seen, now } = windowAt()
    assertEquals(seen.admit('a', 'n1', now), 'ok')
    assertEquals(seen.admit('a', 'n1', now), 'duplicate')
})

Deno.test('FR-001/S1: two origins may use the SAME nonce value', () => {
    // The regression that would silently break legitimate traffic. Keyed on the
    // nonce alone, instance B's first frame is dropped as A's duplicate — and
    // publishing is fire-and-forget, so the loss is silent and permanent.
    // Mutation-verify by keying on `nonce` instead of `${origin} ${nonce}`.
    const { seen, now } = windowAt()
    assertEquals(seen.admit('instance-a', 'shared-nonce', now), 'ok')
    assertEquals(
        seen.admit('instance-b', 'shared-nonce', now),
        'ok',
        'a second instance publishing concurrently is not a replay of the first',
    )
})

Deno.test('FR-004: an entry past the window is pruned, so its nonce is admissible again', () => {
    const w = windowAt()
    assertEquals(w.seen.admit('a', 'n1', w.now), 'ok')
    assertEquals(w.seen.size, 1)

    w.advance(WINDOW + 1)
    // The same (origin, nonce) is admitted again — the old entry was pruned,
    // so it is no longer consulted. Re-issued with a CURRENT timestamp, since
    // the original one is now stale on its own.
    assertEquals(w.seen.admit('a', 'n1', w.now), 'ok')
    assertEquals(
        w.seen.size,
        1,
        'the expired entry went; the new one replaced it',
    )
})

Deno.test('FR-004: pruning is driven by admit, not by a timer', () => {
    const w = windowAt()
    assertEquals(w.seen.admit('a', 'n1', w.now), 'ok')
    w.advance(WINDOW + 1)
    // Nothing ran in between — no timer, no interval. The prune is driven by
    // this call alone, which is why a quiet instance prunes nothing and the
    // guarantee is "never consulted", not "never exists".
    assertEquals(w.seen.size, 1, 'still held while nothing was ingested')
    assertEquals(w.seen.admit('a', 'other', w.now), 'ok')
    assertEquals(w.seen.size, 1, 'the stale entry went only when admit ran')
})

Deno.test('FR-004/SC-005: the store never exceeds its entry cap', () => {
    const { seen, now } = windowAt(1_000_000, 4)
    const realWarn = console.warn
    const warnings: string[] = []
    console.warn = (...args: unknown[]) => void warnings.push(String(args[0]))
    try {
        for (let i = 0; i < 50; i++) seen.admit('a', `n${i}`, now)
        assertEquals(seen.size, 4, 'the cap holds under sustained load')
        assertEquals(
            warnings.filter((w) => w.includes('replay window hit its')).length,
            1,
            'the cap WARN fires once, not once per admission',
        )
    } finally {
        console.warn = realWarn
    }
})

Deno.test('FR-004: at the cap it is the OLDEST entry that goes, not the newest', () => {
    const { seen, now } = windowAt(1_000_000, 2)
    const realWarn = console.warn
    console.warn = () => {}
    try {
        seen.admit('a', 'oldest', now)
        seen.admit('a', 'middle', now)
        seen.admit('a', 'newest', now)
        // Drop-oldest fails open for exactly one forgotten nonce; refuse-new
        // would fail closed and stop the control plane, which the plan rates
        // as the worse outcome.
        assertEquals(
            seen.admit('a', 'oldest', now),
            'ok',
            'the oldest was evicted, so it is admissible again',
        )
        assertEquals(
            seen.admit('a', 'newest', now),
            'duplicate',
            'the newest is still remembered',
        )
    } finally {
        console.warn = realWarn
    }
})
