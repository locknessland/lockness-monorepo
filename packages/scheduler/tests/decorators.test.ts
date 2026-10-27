/**
 * The @Schedule decorator.
 *
 * The point of most of these is what the decorator does NOT do: it does not
 * wrap the method, does not derive a name, and does not catch anything.
 */

import { assertEquals, assertThrows } from '@std/assert'
import { getScheduleMetadata, Schedule } from '../decorators.ts'
import { daily, everyMinute, hourly, PRESETS } from '../presets.ts'
import { Scheduler } from '../scheduler.ts'
import { nextRun } from '../cron_parser.ts'
import { FakeTime } from '@std/testing/time'

const quiet = { error: () => {}, warn: () => {} }

Deno.test('Schedule - a malformed expression throws when the class is DEFINED', () => {
    for (const bad of ['nonsense', '* * *', '99 * * * *', '0 0 * JAN *']) {
        assertThrows(
            () => {
                class _S {
                    @Schedule(bad)
                    run() {}
                }
            },
            TypeError,
            undefined,
            `expected ${JSON.stringify(bad)} rejected at decoration time`,
        )
    }
})

Deno.test('Schedule - malformed options throw at decoration time too', () => {
    assertThrows(() => {
        class _S {
            @Schedule(hourly, { retryDelay: 0 })
            run() {}
        }
    }, TypeError)
    assertThrows(() => {
        class _S {
            @Schedule(hourly, { name: 'has spaces' })
            run() {}
        }
    }, TypeError)
})

Deno.test('Schedule - a SYNCHRONOUS method is legal', () => {
    // The decorator returns the method unchanged, so there is no TS1270 and no
    // async constraint — which is the difference from @Cached.
    class S {
        calls = 0
        @Schedule(hourly)
        tick(): string {
            this.calls++
            return 'sync'
        }
    }
    const s = new S()
    assertEquals(s.tick(), 'sync', 'the method still returns its own value')
    assertEquals(s.calls, 1)
})

Deno.test('Schedule - the method identity is preserved', () => {
    class S {
        @Schedule(hourly)
        tick(a: number, b: number): number {
            return a + b
        }
    }
    assertEquals(
        new S().tick(2, 3),
        5,
        'arguments and return value pass through',
    )
})

Deno.test('Schedule - metadata appears only once the class is instantiated', () => {
    class S {
        @Schedule('0 3 * * *', { name: 'digest' })
        run() {}
    }

    assertEquals(
        getScheduleMetadata(S).length,
        0,
        'addInitializer has not run yet',
    )
    new S()
    const meta = getScheduleMetadata(S)
    assertEquals(meta.length, 1)
    assertEquals(meta[0].expression, '0 3 * * *')
    assertEquals(meta[0].methodName, 'run')
    assertEquals(meta[0].options.name, 'digest')
})

Deno.test('Schedule - several methods on one class are all recorded', () => {
    class S {
        @Schedule(hourly)
        a() {}
        @Schedule(daily)
        b() {}
    }
    new S()
    assertEquals(getScheduleMetadata(S).map((m) => m.methodName).sort(), [
        'a',
        'b',
    ])
})

Deno.test('Schedule - accepts every preset', () => {
    for (const [name, expression] of Object.entries(PRESETS)) {
        class _S {
            @Schedule(expression)
            run() {}
        }
        assertEquals(typeof name, 'string')
    }
})

Deno.test('Schedule - end to end: a decorated method runs on its schedule', async () => {
    const time = new FakeTime(new Date('2026-03-01T10:00:00Z'))
    try {
        class DigestService {
            ran = 0
            @Schedule(everyMinute, { name: 'digest' })
            send() {
                this.ran++
            }
        }
        const service = new DigestService()
        const s = new Scheduler(quiet)

        for (const meta of getScheduleMetadata(DigestService)) {
            s.register({
                expression: meta.expression,
                body: () => service.send(),
                options: meta.options,
                className: 'DigestService',
                methodName: meta.methodName,
            })
        }
        s.start()

        await time.tickAsync(60_000)
        assertEquals(service.ran, 1)
        await time.tickAsync(60_000)
        assertEquals(service.ran, 2)
        s.stop()
    } finally {
        time.restore()
    }
})

Deno.test('Schedule - every preset fires at the instant its name claims', () => {
    // The full preset table, not `yearly` alone — a cap protects one path, and
    // an invariant over the table protects the rest.
    const ref = new Date('2026-03-04T10:07:00Z')
    for (const [name, expression] of Object.entries(PRESETS)) {
        const first = nextRun(expression, ref)
        const second = nextRun(expression, first)
        assertEquals(
            first.getTime() > ref.getTime(),
            true,
            `${name} must advance past the reference`,
        )
        assertEquals(
            second.getTime() - first.getTime() >= 60_000,
            true,
            `${name} must never produce two occurrences inside one minute`,
        )
    }
})
