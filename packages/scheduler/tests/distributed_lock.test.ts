/**
 * Distributed scheduler lock (#219) — the `onOneServer` guarantee and the
 * owner-token discipline that makes it safe.
 *
 * @module @lockness/scheduler/tests/distributed_lock
 */

import {
    assert,
    assertEquals,
    assertStringIncludes,
    assertThrows,
} from '@std/assert'
import { stub } from '@std/testing/mock'
import { FakeTime } from '@std/testing/time'
import { MemorySchedulerLock } from '../memory_lock.ts'
import { everyMinute } from '../presets.ts'
import { Scheduler, validateScheduleOptions } from '../scheduler.ts'
import type { SchedulerLock, SchedulerReporter } from '../types.ts'

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

/** A reporter that keeps every warning, so a test can read what was said. */
function recordingReporter(): {
    reporter: SchedulerReporter
    warnings: Array<{ message: string; fields: Record<string, unknown> }>
} {
    const warnings: Array<
        { message: string; fields: Record<string, unknown> }
    > = []
    return {
        reporter: {
            warn: (message, fields) => void warnings.push({ message, fields }),
            error: () => {},
        },
        warnings,
    }
}

Deno.test('onOneServer - an unreachable lock store skips the occurrence, and says so', async () => {
    // Skipping is the split-brain-safe answer; saying so is what keeps a
    // fleet-wide miss from reading as an ordinary lost race.
    const { reporter, warnings } = recordingReporter()
    const down: SchedulerLock = {
        acquire: () => Promise.reject(new Error('lock store down')),
        release: () => Promise.resolve(),
    }
    const s = new Scheduler(reporter, down)
    let ran = 0
    s.register({
        expression: everyMinute,
        body: () => {
            ran++
        },
        options: { name: 'nightly', onOneServer: true },
    })

    await s.runNow('nightly')

    assertEquals(ran, 0, 'no replica may run an occurrence it could not claim')
    assertEquals(s.getStats().tasks[0].runCount, 0)
    assertEquals(warnings.length, 1)
    assertStringIncludes(warnings[0].message, 'lock store is unreachable')
    assertEquals(warnings[0].fields, {
        task: 'nightly',
        error: 'lock store down',
    })
})

Deno.test('onOneServer - a failed release does not mask the outcome, and is reported once', async () => {
    // The release is best-effort (the lock's TTL is the backstop), so a release
    // that threw out of the run would turn a successful task into a rejected
    // one. Best-effort is not silent, though: a release that keeps failing
    // leaves every claim to expire on its TTL, and nobody would know why.
    const time = new FakeTime(new Date('2026-03-01T10:00:42.500Z'))
    try {
        const { reporter, warnings } = recordingReporter()
        let releases = 0
        const flaky: SchedulerLock = {
            acquire: () => Promise.resolve(true),
            release: () => {
                releases++
                return Promise.reject(new Error('release lost'))
            },
        }
        const s = new Scheduler(reporter, flaky)
        let ran = 0
        s.register({
            expression: everyMinute,
            body: () => {
                ran++
            },
            options: { name: 'nightly', onOneServer: true },
        })

        await s.runNow('nightly')

        assertEquals(ran, 1)
        assertEquals(releases, 1, 'the claimed occurrence was released')
        const [stats] = s.getStats().tasks
        assertEquals(stats.runCount, 1)
        assertEquals(stats.failureCount, 0, 'a lost release is not a failure')
        assertEquals(stats.lastError, null)
        assertEquals(warnings.length, 1, 'exactly one warning, not zero')
        assertStringIncludes(warnings[0].message, 'release')
        assertEquals(warnings[0].fields, {
            task: 'nightly',
            occurrence: '2026-03-01T10:00:00.000Z',
            error: 'Error',
            message: 'release lost',
        })
    } finally {
        time.restore()
    }
})

Deno.test('onOneServer - a failed release with no reporter falls back to console.warn', async () => {
    // Without a reporter the scheduler used to say nothing at all — on this
    // path and on the three other warnings it emits. A rejection that is not
    // an Error is flattened, never passed through raw.
    const warn = stub(console, 'warn')
    try {
        const s = new Scheduler(undefined, {
            acquire: () => Promise.resolve(true),
            release: () => Promise.reject('not an error'),
        })
        s.register({
            expression: everyMinute,
            body: () => {},
            options: { name: 'nightly', onOneServer: true },
        })

        await s.runNow('nightly')

        assertEquals(warn.calls.length, 1)
        const [message, fields] = warn.calls[0].args as [
            string,
            Record<string, unknown>,
        ]
        assertStringIncludes(message, 'release')
        assertEquals(fields.task, 'nightly')
        assertEquals(fields.error, 'Error')
        assertEquals(fields.message, 'not an error')
    } finally {
        warn.restore()
    }
})

Deno.test('setLock - a lock installed after registration governs the tasks already registered', async () => {
    // `@lockness/core` installs the lock at boot, after `@Schedule` has
    // registered tasks — so the lock must apply to them, not only to later ones.
    // The clock sits mid-minute, so the occurrence key has to be FLOORED to be
    // right; on a minute boundary an unfloored key would pass too.
    const time = new FakeTime(new Date('2026-03-01T10:07:42.345Z'))
    try {
        const s = new Scheduler(quiet)
        let ran = 0
        s.register({
            expression: everyMinute,
            body: () => {
                ran++
            },
            options: { name: 'nightly', onOneServer: true },
        })
        assertEquals(s.hasLock, false)

        const claims: Array<{ task: string; occurrence: Date }> = []
        s.setLock({
            // Another replica always holds the occurrence.
            acquire: (task, occurrence) => {
                claims.push({ task, occurrence })
                return Promise.resolve(false)
            },
            release: () => Promise.resolve(),
        })
        assertEquals(s.hasLock, true)

        await s.runNow('nightly')

        assertEquals(ran, 0, 'a lost claim means this replica does not run it')
        assertEquals(claims.length, 1)
        assertEquals(claims[0].task, 'nightly')
        assertEquals(
            claims[0].occurrence.toISOString(),
            '2026-03-01T10:07:00.000Z',
            'the occurrence key is the wall-clock minute every replica agrees on',
        )
    } finally {
        time.restore()
    }
})
