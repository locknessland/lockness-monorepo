/**
 * The Scheduler: identity, lifecycle, control and stats.
 *
 * Timing runs under FakeTime, so nothing here waits on real elapsed time. The
 * pending-timer assertions are explicit rather than delegated to Deno.test's
 * sanitizers, which do not fail on a leaked setTimeout.
 */

import { assert, assertEquals, assertThrows } from '@std/assert'
import { FakeTime } from '@std/testing/time'
import {
    MAX_RETRIES,
    Scheduler,
    scheduler,
    setScheduler,
    validateScheduleOptions,
} from '../scheduler.ts'
import { everyMinute, hourly, yearly } from '../presets.ts'
import { MAX_DELAY_MS } from '../timer_registry.ts'

const quiet = { error: () => {}, warn: () => {} }

// ============================================================================
// Identity and uniqueness
// ============================================================================

Deno.test('register - derives ClassName.methodName when no name is given', () => {
    const s = new Scheduler(quiet)
    const name = s.register({
        expression: hourly,
        body: () => {},
        className: 'ReportService',
        methodName: 'monthly',
    })
    assertEquals(name, 'ReportService.monthly')
})

Deno.test('register - an explicit name wins', () => {
    const s = new Scheduler(quiet)
    const name = s.register({
        expression: hourly,
        body: () => {},
        options: { name: 'digest' },
        className: 'ReportService',
        methodName: 'monthly',
    })
    assertEquals(name, 'digest')
})

Deno.test('register - a duplicate name throws rather than replacing', () => {
    const s = new Scheduler(quiet)
    s.register({ expression: hourly, body: () => {}, options: { name: 'dup' } })
    assertThrows(
        () =>
            s.register({
                expression: hourly,
                body: () => {},
                options: { name: 'dup' },
            }),
        Error,
        'already registered',
    )
})

Deno.test('register - identity is resolved here, so an imperative caller cannot bypass it', () => {
    // The decorator derives nothing; this is the one gate both paths cross.
    const s = new Scheduler(quiet)
    const a = s.register({
        expression: hourly,
        body: () => {},
        className: 'A',
        methodName: 'x',
    })
    const b = s.register({
        expression: hourly,
        body: () => {},
        className: 'B',
        methodName: 'x',
    })
    assertEquals([a, b], ['A.x', 'B.x'])
})

// ============================================================================
// Option validation — one decider
// ============================================================================

Deno.test('validateScheduleOptions - rejects a hot-loop retry policy', () => {
    assertThrows(
        () => validateScheduleOptions({ retryDelay: 0 }),
        TypeError,
        'retryDelay',
    )
    assertThrows(() => validateScheduleOptions({ retryDelay: -1 }), TypeError)
})

Deno.test('validateScheduleOptions - bounds retries and timeout', () => {
    assertThrows(
        () => validateScheduleOptions({ retries: -1 }),
        TypeError,
        'retries',
    )
    assertThrows(
        () => validateScheduleOptions({ retries: MAX_RETRIES + 1 }),
        TypeError,
    )
    assertThrows(() => validateScheduleOptions({ retries: 1.5 }), TypeError)
    assertThrows(
        () => validateScheduleOptions({ timeout: 0 }),
        TypeError,
        'timeout',
    )
    validateScheduleOptions({ retries: MAX_RETRIES, timeout: 1, retryDelay: 1 })
})

Deno.test('validateScheduleOptions - bounds the name charset', () => {
    assertThrows(
        () => validateScheduleOptions({ name: 'a b' }),
        TypeError,
        'name',
    )
    assertThrows(() => validateScheduleOptions({ name: '' }), TypeError)
    assertThrows(
        () => validateScheduleOptions({ name: 'x'.repeat(65) }),
        TypeError,
    )
    validateScheduleOptions({ name: 'app.digest:v2-1' })
})

// ============================================================================
// Lifecycle
// ============================================================================

Deno.test('start - arms every enabled task and reports the count', () => {
    const time = new FakeTime(new Date('2026-03-01T10:00:00Z'))
    try {
        const s = new Scheduler(quiet)
        s.register({
            expression: hourly,
            body: () => {},
            options: { name: 'a' },
        })
        s.register({
            expression: hourly,
            body: () => {},
            options: { name: 'b' },
        })
        s.register({
            expression: hourly,
            body: () => {},
            options: { name: 'off', enabled: false },
        })

        assertEquals(
            s.start(),
            2,
            'the disabled task is registered but not armed',
        )
        assertEquals(s.getStats().pendingTimers, 2)
        s.stop()
    } finally {
        time.restore()
    }
})

Deno.test('a task fires on its schedule and re-arms', async () => {
    const time = new FakeTime(new Date('2026-03-01T10:00:00Z'))
    try {
        const s = new Scheduler(quiet)
        let ran = 0
        s.register({
            expression: everyMinute,
            body: () => {
                ran++
            },
            options: { name: 'tick' },
        })
        s.start()

        await time.tickAsync(60_000)
        assertEquals(ran, 1)
        await time.tickAsync(60_000)
        assertEquals(ran, 2, 're-armed itself after firing')
        assertEquals(s.getStats().pendingTimers, 1, 'exactly one — invariant 2')
        s.stop()
    } finally {
        time.restore()
    }
})

Deno.test('stop - leaves no pending timer and is terminal', async () => {
    const time = new FakeTime(new Date('2026-03-01T10:00:00Z'))
    try {
        const s = new Scheduler(quiet)
        let ran = 0
        s.register({
            expression: everyMinute,
            body: () => {
                ran++
            },
            options: { name: 'tick' },
        })
        s.start()
        s.stop()

        assertEquals(s.getStats().pendingTimers, 0, 'FR-009')
        await time.tickAsync(600_000)
        assertEquals(ran, 0)
        assertEquals(s.getStats().stopped, true)
        assertThrows(() => s.start(), Error, 'stopped')
        assertThrows(
            () =>
                s.register({
                    expression: hourly,
                    body: () => {},
                    options: { name: 'late' },
                }),
            Error,
            'stopped',
        )
    } finally {
        time.restore()
    }
})

Deno.test('runOnStart - fires at boot and never catches up', async () => {
    // Booting at 10:07 with an hourly schedule: one immediate run, then 11:00.
    const time = new FakeTime(new Date('2026-03-01T10:07:00Z'))
    try {
        const s = new Scheduler(quiet)
        let ran = 0
        s.register({
            expression: hourly,
            body: () => {
                ran++
            },
            options: { name: 'warm', runOnStart: true },
        })
        s.start()

        await time.tickAsync(0)
        assertEquals(ran, 1, 'fired at boot')

        await time.tickAsync(53 * 60_000)
        assertEquals(
            ran,
            2,
            '11:00 — one occurrence, not a backfill of the ones before boot',
        )
        s.stop()
    } finally {
        time.restore()
    }
})

// ============================================================================
// Overlap
// ============================================================================

Deno.test('overlap skip - an occurrence during a run is skipped and counted', async () => {
    const time = new FakeTime(new Date('2026-03-01T10:00:00Z'))
    try {
        const s = new Scheduler(quiet)
        let started = 0
        let release: (() => void) | undefined
        s.register({
            expression: everyMinute,
            body: () => {
                started++
                return new Promise<void>((r) => {
                    release = r
                })
            },
            options: { name: 'slow' },
        })
        s.start()

        await time.tickAsync(60_000)
        assertEquals(started, 1)

        // Second and third occurrences arrive while the first is still in flight.
        await time.tickAsync(60_000)
        await time.tickAsync(60_000)
        assertEquals(started, 1, 'no second concurrent run')
        assertEquals(s.getStats().tasks[0].skippedCount, 2)

        release?.()
        s.stop()
    } finally {
        time.restore()
    }
})

Deno.test('overlap allow - concurrent runs are permitted when asked for explicitly', async () => {
    const time = new FakeTime(new Date('2026-03-01T10:00:00Z'))
    try {
        const s = new Scheduler(quiet)
        let started = 0
        const releases: Array<() => void> = []
        s.register({
            expression: everyMinute,
            body: () => {
                started++
                return new Promise<void>((r) => releases.push(r))
            },
            options: { name: 'parallel', overlap: 'allow' },
        })
        s.start()

        await time.tickAsync(60_000)
        await time.tickAsync(60_000)
        assertEquals(started, 2)
        assertEquals(s.getStats().tasks[0].skippedCount, 0)

        for (const r of releases) r()
        s.stop()
    } finally {
        time.restore()
    }
})

// ============================================================================
// Control
// ============================================================================

Deno.test('pause / resume - pausing clears the timer, resuming restores the cadence', async () => {
    const time = new FakeTime(new Date('2026-03-01T10:00:00Z'))
    try {
        const s = new Scheduler(quiet)
        let ran = 0
        s.register({
            expression: everyMinute,
            body: () => {
                ran++
            },
            options: { name: 'tick' },
        })
        s.start()

        s.pause('tick')
        assertEquals(s.getStats().pendingTimers, 0)
        await time.tickAsync(300_000)
        assertEquals(ran, 0)

        s.resume('tick')
        assertEquals(s.getStats().pendingTimers, 1)
        await time.tickAsync(60_000)
        assertEquals(ran, 1)
        s.stop()
    } finally {
        time.restore()
    }
})

Deno.test('runNow - runs a paused task without resuming it', async () => {
    const time = new FakeTime(new Date('2026-03-01T10:00:00Z'))
    try {
        const s = new Scheduler(quiet)
        let ran = 0
        s.register({
            expression: everyMinute,
            body: () => {
                ran++
            },
            options: { name: 'tick' },
        })
        s.start()
        s.pause('tick')

        await s.runNow('tick')
        assertEquals(ran, 1)
        assertEquals(s.getStats().tasks[0].paused, true, 'still paused')
        assertEquals(s.getStats().pendingTimers, 0)
        s.stop()
    } finally {
        time.restore()
    }
})

Deno.test('resume - throws on a task declared enabled:false', () => {
    const s = new Scheduler(quiet)
    s.register({
        expression: hourly,
        body: () => {},
        options: { name: 'off', enabled: false },
    })
    assertThrows(() => s.resume('off'), Error, 'terminal')
})

Deno.test('pause / resume / runNow - an unknown name throws WITHOUT enumerating the others', async () => {
    const s = new Scheduler(quiet)
    s.register({
        expression: hourly,
        body: () => {},
        options: { name: 'known' },
    })
    s.register({
        expression: hourly,
        body: () => {},
        options: { name: 'secret-task' },
    })

    // The message must not list what IS registered. These methods are documented
    // as operator capabilities an application mounts on a route, so one typo'd
    // request would otherwise hand the caller a map of internal task names.
    const err = assertThrows(() => s.pause('typo'), Error) as Error
    assertEquals(err.message.includes('secret-task'), false, 'no enumeration')
    assertEquals(err.message.includes('known'), false, 'none of them')

    assertThrows(() => s.resume('typo'), Error)
    let threw = false
    try {
        await s.runNow('typo')
    } catch {
        threw = true
    }
    assertEquals(threw, true, 'a swallowed typo leaves a task paused forever')
})

Deno.test('pause / resume / runNow - a malformed name is rejected and not echoed back', () => {
    // The lookup path is request-derived in practice, so an un-patterned string
    // must not reach an error message — that is how log injection gets in.
    const s = new Scheduler(quiet)
    s.register({
        expression: hourly,
        body: () => {},
        options: { name: 'known' },
    })

    const injection = 'x\nlevel=error msg="forged"'
    const err = assertThrows(() => s.pause(injection), TypeError) as Error
    assertEquals(
        err.message.includes('forged'),
        false,
        'the input is not echoed',
    )
    assertEquals(err.message.includes('A task name must match'), true)
})

// ============================================================================
// Stats
// ============================================================================

Deno.test('getStats - never returns an Error instance', async () => {
    const s = new Scheduler(quiet)
    s.register({
        expression: hourly,
        body: () => {
            const e = new Error('SELECT * FROM users WHERE email = $1')
            throw e
        },
        options: { name: 'leaky' },
    })
    await s.runNow('leaky')

    const stats = s.getStats().tasks[0]
    assertEquals(stats.lastError instanceof Error, false)
    assertEquals(stats.lastError, {
        name: 'Error',
        message: 'SELECT * FROM users WHERE email = $1',
    })
    assertEquals(
        Object.keys(stats.lastError ?? {}),
        ['name', 'message'],
        'no stack, no cause',
    )
    assertEquals(stats.failureCount, 1)
})

Deno.test('a failing task does not stop the others', async () => {
    const time = new FakeTime(new Date('2026-03-01T10:00:00Z'))
    try {
        const s = new Scheduler(quiet)
        let good = 0
        s.register({
            expression: everyMinute,
            body: () => {
                throw new Error('boom')
            },
            options: { name: 'bad' },
        })
        s.register({
            expression: everyMinute,
            body: () => {
                good++
            },
            options: { name: 'good1' },
        })
        s.register({
            expression: everyMinute,
            body: () => {
                good++
            },
            options: { name: 'good2' },
        })
        s.start()

        await time.tickAsync(60_000)
        await time.tickAsync(60_000)
        assertEquals(good, 4, 'both healthy tasks kept their schedules')
        assertEquals(
            s.getStats().pendingTimers,
            3,
            'the failing task re-armed too',
        )
        s.stop()
    } finally {
        time.restore()
    }
})

Deno.test('scheduler() - is a shared instance, replaceable for tests', () => {
    const custom = new Scheduler(quiet)
    setScheduler(custom)
    assertEquals(scheduler(), custom)
    setScheduler(undefined)
    assertEquals(scheduler() === custom, false)
    setScheduler(undefined)
})

// ============================================================================
// Timer ownership — invariant 3
// ============================================================================

Deno.test('stop - a retry backoff timer does not survive stop()', async () => {
    // Invariant 3: every pending timer is in the scheduler's registry, so there
    // is no timer it cannot cancel. The retry backoff is the one that got away:
    // runTask's `sleep` parameter defaults to a raw setTimeout owned by nobody.
    const time = new FakeTime(new Date('2026-03-01T10:00:00Z'))
    try {
        const s = new Scheduler(quiet)
        let attempts = 0
        s.register({
            expression: everyMinute,
            body: () => {
                attempts++
                throw new Error('always fails')
            },
            options: { name: 'flaky', retries: 3, retryDelay: 30_000 },
        })
        s.start()

        await time.tickAsync(60_000)
        assertEquals(
            attempts,
            1,
            'first attempt ran; a retry is now backing off',
        )

        s.stop()
        assertEquals(
            s.getStats().pendingTimers,
            0,
            'pendingTimers must account for the retry backoff too',
        )

        await time.tickAsync(300_000)
        assertEquals(
            attempts,
            1,
            'no attempt may execute after stop() — the backoff timer was cancelled',
        )
    } finally {
        time.restore()
    }
})

Deno.test('stop - an in-flight run leaves nothing pending behind it', async () => {
    const time = new FakeTime(new Date('2026-03-01T10:00:00Z'))
    try {
        const s = new Scheduler(quiet)
        let release: (() => void) | undefined
        let finished = 0
        s.register({
            expression: everyMinute,
            body: () =>
                new Promise<void>((r) => {
                    release = () => {
                        finished++
                        r()
                    }
                }),
            options: { name: 'slow', timeout: 600_000 },
        })
        s.start()

        await time.tickAsync(60_000)
        s.stop()
        assertEquals(
            s.getStats().pendingTimers,
            0,
            'including the timeout guard',
        )

        release?.()
        await time.tickAsync(0)
        assertEquals(finished, 1)
        assertEquals(
            s.getStats().pendingTimers,
            0,
            'a run completing after stop() must not re-arm',
        )
    } finally {
        time.restore()
    }
})

Deno.test('a yearly task arms a capped timer and does not fire early', async () => {
    // The overflow path end to end, through the Scheduler rather than the
    // registry alone: deno turns a raw year-long delay into 1ms.
    const time = new FakeTime(new Date('2026-03-01T10:00:00Z'))
    try {
        const s = new Scheduler(quiet)
        let ran = 0
        s.register({
            expression: yearly,
            body: () => {
                ran++
            },
            options: { name: 'annual' },
        })
        s.start()

        await time.tickAsync(60_000)
        assertEquals(ran, 0, 'the overflow bug would have fired here')

        await time.tickAsync(MAX_DELAY_MS)
        assertEquals(
            ran,
            0,
            'one capped leg elapsed; it re-armed rather than ran',
        )
        assertEquals(s.getStats().pendingTimers, 1)

        // 2027-01-01 is ~306 days out; tick well past it.
        await time.tickAsync(320 * 24 * 60 * 60 * 1000)
        assertEquals(ran, 1, 'fires once the real delay is reached')

        s.stop()
        assertEquals(s.getStats().pendingTimers, 0)
    } finally {
        time.restore()
    }
})

Deno.test('retryDelay is actually honoured, measured in elapsed time', async () => {
    // The regression guard S1 needed and did not have. The previous tests
    // asserted a resolver flag and a final attempt count, both of which a
    // sleep() that resolved immediately still satisfied — so a backoff that had
    // silently become a no-op passed clean, firing every attempt in one tick.
    //
    // Hourly, not every-minute: the whole chain (two 30s backoffs) has to fit
    // inside one period, or the second occurrence abandons it half way and this
    // measures the abandonment instead of the delay. That interaction has its
    // own test — 'a retry chain is abandoned when the next occurrence arrives'.
    const time = new FakeTime(new Date('2026-03-01T10:00:00Z'))
    try {
        const s = new Scheduler(quiet)
        let attempts = 0
        s.register({
            expression: hourly,
            body: () => {
                attempts++
                throw new Error('always fails')
            },
            options: { name: 'flaky', retries: 2, retryDelay: 30_000 },
        })
        s.start()

        await time.tickAsync(60 * 60_000)
        assertEquals(
            attempts,
            1,
            'first attempt only — the backoff has not elapsed',
        )

        await time.tickAsync(29_999)
        assertEquals(attempts, 1, 'still waiting out retryDelay')

        await time.tickAsync(1)
        assertEquals(attempts, 2, 'second attempt lands exactly on the delay')

        await time.tickAsync(30_000)
        assertEquals(attempts, 3, 'third and last')

        await time.tickAsync(30_000)
        assertEquals(attempts, 3, 'retries are exhausted, not looping')

        s.stop()
    } finally {
        time.restore()
    }
})

Deno.test('a task named like a retry key does not cancel another task schedule', () => {
    // NAME_PATTERN permits ':', so un-namespaced timer keys would let a task
    // called "retry:foo" and the backoff of task "foo" share one registry slot.
    const time = new FakeTime(new Date('2026-03-01T10:00:00Z'))
    try {
        const s = new Scheduler(quiet)
        s.register({
            expression: hourly,
            body: () => {},
            options: { name: 'foo' },
        })
        s.register({
            expression: hourly,
            body: () => {},
            options: { name: 'retry:foo' },
        })
        s.start()

        assertEquals(s.getStats().pendingTimers, 2, 'both keep their own timer')
        s.stop()
    } finally {
        time.restore()
    }
})

// ============================================================================
// A retry chain does not outlive its own occurrence — #132
// ============================================================================

Deno.test('a retry chain is abandoned when the next occurrence arrives', async () => {
    // A backoff longer than the schedule's period used to let a retry chain
    // outlive the occurrence that started it and overlap the run it was meant
    // to precede. stop() abandoned it; the next occurrence did not.
    const time = new FakeTime(new Date('2026-03-01T10:00:00Z'))
    try {
        const warned: string[] = []
        const s = new Scheduler({
            error: () => {},
            warn: (message) => void warned.push(message),
        })
        let attempts = 0
        s.register({
            expression: everyMinute,
            // Only the first execution fails, so a later attempt can only be
            // the abandoned chain's retry — which is what this is looking for.
            body: () => {
                attempts++
                if (attempts === 1) throw new Error('the first run fails')
            },
            // 90s of backoff against a 60s period: the chain would reach its
            // second attempt at t+150s, a full occurrence after its own.
            options: { name: 'flaky', retries: 5, retryDelay: 90_000 },
        })
        s.start()

        await time.tickAsync(60_000)
        // One more drain: the backoff is armed a microtask after the timer
        // callback returns, not inside it.
        await time.tickAsync(0)
        assertEquals(
            attempts,
            1,
            'occurrence 1 ran and its retry is backing off',
        )
        assertEquals(
            s.getStats().pendingTimers,
            2,
            'the schedule and the backoff',
        )

        await time.tickAsync(60_000)
        assertEquals(
            attempts,
            2,
            'occurrence 2 ran — abandoning the chain must not cost the occurrence too',
        )
        assertEquals(
            s.getStats().pendingTimers,
            1,
            'only the schedule remains; the backoff was cancelled, not left to elapse',
        )
        assert(
            warned.some((m) => m.includes('retry chain abandoned')),
            'the abandonment is reported at warn level, not dropped silently',
        )

        // t+150s is where occurrence 1's second attempt would have landed.
        await time.tickAsync(30_000)
        assertEquals(
            attempts,
            2,
            'the abandoned backoff never fired: no retry outlived its own occurrence',
        )

        s.stop()
    } finally {
        time.restore()
    }
})

Deno.test('a retry chain within its own period is left alone', () => {
    // The guard for the fix above: abandoning must key on the occurrence, not
    // simply on time passing.
    const s = new Scheduler(quiet)
    s.register({
        expression: hourly,
        body: () => {
            throw new Error('fails')
        },
        options: { name: 'flaky', retries: 2, retryDelay: 1_000 },
    })
    // Registered but never started: no occurrence can arrive, so nothing is
    // abandoned and the task is simply armed-free.
    assertEquals(s.getStats().pendingTimers, 0)
    s.stop()
})

// ============================================================================
// The reporter is installable in place — #132
// ============================================================================

Deno.test('setReporter - installs a reporter without replacing the instance', () => {
    const s = new Scheduler()
    assertEquals(s.hasReporter, false, 'none by default')

    s.register({
        expression: hourly,
        body: () => {},
        options: { name: 'registered-before-boot' },
    })

    const seen: string[] = []
    s.setReporter({ error: (m) => void seen.push(m), warn: () => {} })

    assertEquals(s.hasReporter, true)
    assertEquals(
        s.getStats().tasks.map((t) => t.name),
        ['registered-before-boot'],
        'installing a reporter must not cost the tasks already registered',
    )
})

Deno.test('setReporter - a failure reaches the reporter installed after the fact', async () => {
    const s = new Scheduler()
    s.register({
        expression: hourly,
        body: () => {
            throw new Error('boom')
        },
        options: { name: 'failing' },
    })

    const errors: string[] = []
    s.setReporter({ error: (m) => void errors.push(m), warn: () => {} })

    await s.runNow('failing')
    assert(
        errors.some((m) => m.includes('Scheduled task failed')),
        'the late-installed reporter receives failures',
    )
    s.stop()
})
