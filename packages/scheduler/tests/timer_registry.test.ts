/**
 * The timer registry is the only place in the package that touches setTimeout.
 *
 * Two of these tests exist because of measurements, not theory:
 *  - deno 2.9.6 turns a delay above 2^31-1 ms into 1 ms and warns, so an
 *    un-capped `yearly` task would fire in a tight loop;
 *  - a leaked setTimeout does NOT fail Deno.test, in sync or async form, with
 *    or without --trace-leaks, so `size` is what we assert on.
 */

import { assertEquals } from '@std/assert'
import { FakeTime } from '@std/testing/time'
import { MAX_DELAY_MS, MIN_DELAY_MS, TimerRegistry } from '../timer_registry.ts'

Deno.test('TimerRegistry - arms a timer and fires it at the delay', () => {
    const time = new FakeTime()
    try {
        const r = new TimerRegistry()
        let fired = 0
        r.arm('a', 5_000, () => fired++)

        assertEquals(r.size, 1)
        time.tick(4_999)
        assertEquals(fired, 0)
        time.tick(1)
        assertEquals(fired, 1)
        assertEquals(r.size, 0, 'a fired timer leaves the registry')
    } finally {
        time.restore()
    }
})

Deno.test('TimerRegistry - cancel removes a pending timer without firing it', () => {
    const time = new FakeTime()
    try {
        const r = new TimerRegistry()
        let fired = 0
        r.arm('a', 5_000, () => fired++)
        r.cancel('a')

        assertEquals(r.size, 0)
        time.tick(10_000)
        assertEquals(fired, 0)
    } finally {
        time.restore()
    }
})

Deno.test('TimerRegistry - arming the same key twice replaces the first timer', () => {
    const time = new FakeTime()
    try {
        const r = new TimerRegistry()
        const fired: string[] = []
        r.arm('a', 5_000, () => fired.push('first'))
        r.arm('a', 5_000, () => fired.push('second'))

        assertEquals(r.size, 1, 'one key, one timer — invariant 2')
        time.tick(10_000)
        assertEquals(fired, ['second'])
    } finally {
        time.restore()
    }
})

Deno.test('TimerRegistry - clear() leaves nothing pending', () => {
    const time = new FakeTime()
    try {
        const r = new TimerRegistry()
        let fired = 0
        for (const k of ['a', 'b', 'c']) r.arm(k, 5_000, () => fired++)
        assertEquals(r.size, 3)

        r.clear()
        assertEquals(r.size, 0)
        time.tick(60_000)
        assertEquals(fired, 0, 'no timer survives clear() — FR-009')
    } finally {
        time.restore()
    }
})

Deno.test('TimerRegistry - a delay above the cap re-arms instead of firing', () => {
    const time = new FakeTime()
    try {
        const r = new TimerRegistry()
        let fired = 0
        const yearMs = 365 * 24 * 60 * 60 * 1000
        r.arm('yearly', yearMs, () => fired++)

        // Deno would have turned the raw delay into ~1ms. The cap must not.
        time.tick(1_000)
        assertEquals(fired, 0, 'the overflow bug would have fired here')

        time.tick(MAX_DELAY_MS)
        assertEquals(
            fired,
            0,
            'the cap elapsed, so it re-armed rather than ran',
        )
        assertEquals(r.size, 1, 'still armed')

        time.tick(yearMs)
        assertEquals(fired, 1, 'it fires once the real delay is reached')
    } finally {
        time.restore()
    }
})

Deno.test('TimerRegistry - a delay below the floor is clamped and reported', () => {
    const time = new FakeTime()
    const warnings: string[] = []
    try {
        const r = new TimerRegistry({
            error: () => {},
            warn: (m) => warnings.push(m),
        })
        let fired = 0
        r.arm('a', 5, () => fired++)

        time.tick(999)
        assertEquals(fired, 0, 'clamped up to the floor, not fired at 5ms')
        time.tick(1)
        assertEquals(fired, 1)
        assertEquals(
            warnings.length,
            1,
            'a clamp that fires is a bug — report it',
        )
    } finally {
        time.restore()
    }
})

Deno.test('TimerRegistry - the bounds are the documented constants', () => {
    assertEquals(MIN_DELAY_MS, 1_000)
    assertEquals(MAX_DELAY_MS, 24 * 24 * 60 * 60 * 1000)
    assertEquals(
        MAX_DELAY_MS < 2 ** 31 - 1,
        true,
        'must stay under the 32-bit limit',
    )
})

Deno.test('TimerRegistry - sleep() is owned by the registry and counted', () => {
    const time = new FakeTime()
    try {
        const r = new TimerRegistry()
        let woke = false
        r.sleep('backoff', 30_000).then(() => {
            woke = true
        })

        assertEquals(r.size, 1, 'a wait is a timer like any other')
        time.tick(29_999)
        assertEquals(woke, false)
        time.tick(1)
        assertEquals(r.size, 0)
    } finally {
        time.restore()
    }
})

Deno.test('TimerRegistry - clear() releases a pending sleep rather than stranding it', async () => {
    const time = new FakeTime()
    try {
        const r = new TimerRegistry()
        let woke = false
        const waiting = r.sleep('backoff', 30_000).then(() => {
            woke = true
        })

        r.clear()
        assertEquals(r.size, 0)

        // Resolved, not rejected and not left pending: a caller awaiting its
        // backoff when stop() lands must be released, then decline to continue.
        await waiting
        assertEquals(woke, true)

        time.tick(60_000)
        assertEquals(r.size, 0, 'and nothing fires afterwards')
    } finally {
        time.restore()
    }
})

Deno.test('TimerRegistry - has() distinguishes a pending timer from an absent one', () => {
    const time = new FakeTime()
    try {
        const r = new TimerRegistry()
        assertEquals(r.has('a'), false)
        r.arm('a', 5_000, () => {})
        assertEquals(r.has('a'), true)
        r.cancel('a')
        assertEquals(r.has('a'), false, 'cancelling clears it')
    } finally {
        time.restore()
    }
})

Deno.test('TimerRegistry - setReporter installs a reporter after construction', () => {
    // The Scheduler is built before core has resolved the application's logger,
    // so the reporter has to be installable in place rather than only via the
    // constructor. A clamped delay is the observable that proves it took.
    const time = new FakeTime()
    try {
        const warned: string[] = []
        const r = new TimerRegistry()
        r.setReporter({ error: () => {}, warn: (m) => void warned.push(m) })

        r.arm('a', MIN_DELAY_MS - 1, () => {})

        assertEquals(warned.length, 1, 'the clamp went to the reporter')
        assertEquals(warned[0].includes('clamped'), true)
        r.clear()
    } finally {
        time.restore()
    }
})
