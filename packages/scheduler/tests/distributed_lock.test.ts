/**
 * Distributed scheduler lock (#219) — the `onOneServer` guarantee and the
 * owner-token discipline that makes it safe.
 *
 * @module @lockness/scheduler/tests/distributed_lock
 */

import { assert, assertEquals, assertThrows } from '@std/assert'
import { FakeTime } from '@std/testing/time'
import { MemorySchedulerLock } from '../memory_lock.ts'
import { everyMinute } from '../presets.ts'
import { Scheduler, validateScheduleOptions } from '../scheduler.ts'
import type { SchedulerReporter } from '../types.ts'

const quiet: SchedulerReporter = { warn: () => {}, error: () => {} }

Deno.test('validateScheduleOptions - onOneServer must be a boolean', () => {
    validateScheduleOptions({ onOneServer: true })
    validateScheduleOptions({ onOneServer: false })
    assertThrows(
        () =>
            validateScheduleOptions(
                { onOneServer: 'yes' } as unknown as { onOneServer: boolean },
            ),
        TypeError,
    )
})

Deno.test('onOneServer - two replicas sharing a lock run the task once total', async () => {
    const time = new FakeTime(new Date('2026-03-01T10:00:00Z'))
    try {
        // One backing store, two adapters — two replicas on one Redis.
        const store = new Map()
        const s1 = new Scheduler(quiet, new MemorySchedulerLock({ store }))
        const s2 = new Scheduler(quiet, new MemorySchedulerLock({ store }))
        let ran = 0
        for (const s of [s1, s2]) {
            s.register({
                expression: everyMinute,
                body: () => {
                    ran++
                },
                options: { name: 'nightly', onOneServer: true },
            })
            s.start()
        }
        await time.tickAsync(60_000)
        assertEquals(ran, 1, 'exactly one replica ran the occurrence')
        s1.stop()
        s2.stop()
    } finally {
        time.restore()
    }
})

Deno.test('onOneServer - without a lock installed the task runs in-process as usual', async () => {
    const time = new FakeTime(new Date('2026-03-01T10:00:00Z'))
    try {
        const s = new Scheduler(quiet) // no lock
        let ran = 0
        s.register({
            expression: everyMinute,
            body: () => {
                ran++
            },
            options: { name: 'local', onOneServer: true },
        })
        s.start()
        await time.tickAsync(60_000)
        assertEquals(ran, 1, 'no lock => the flag is inert, task runs')
        s.stop()
    } finally {
        time.restore()
    }
})

Deno.test('MemorySchedulerLock - a second claim on a live key is refused', async () => {
    const store = new Map()
    const a = new MemorySchedulerLock({ store })
    const b = new MemorySchedulerLock({ store })
    const at = new Date('2026-03-01T10:01:00Z')
    assertEquals(await a.acquire('t', at), true)
    assertEquals(await b.acquire('t', at), false, 'the live claim blocks b')
})

Deno.test('MemorySchedulerLock - release is owner-checked: a stale holder cannot delete a live claim', async () => {
    const time = new FakeTime(new Date('2026-03-01T10:00:00Z'))
    try {
        const store = new Map()
        const a = new MemorySchedulerLock({ store, ttlMs: 1_000 })
        const b = new MemorySchedulerLock({ store, ttlMs: 1_000 })
        const at = new Date('2026-03-01T10:01:00Z')

        assertEquals(await a.acquire('t', at), true) // a holds it
        await time.tickAsync(1_500) // a's claim expires
        assertEquals(await b.acquire('t', at), true, 'b re-claims after expiry')

        // a, the stale holder, releases — it must NOT delete b's live claim.
        await a.release('t', at)
        assertEquals(
            await a.acquire('t', at),
            false,
            "b's claim survived a's release",
        )
    } finally {
        time.restore()
    }
})

Deno.test('MemorySchedulerLock - a claim is re-acquirable once its TTL expires', async () => {
    const time = new FakeTime(new Date('2026-03-01T10:00:00Z'))
    try {
        const lock = new MemorySchedulerLock({ ttlMs: 1_000 })
        const at = new Date('2026-03-01T10:01:00Z')
        assertEquals(await lock.acquire('t', at), true)
        assertEquals(await lock.acquire('t', at), false)
        await time.tickAsync(1_500)
        assert(await lock.acquire('t', at), 'TTL expired => re-acquirable')
    } finally {
        time.restore()
    }
})
