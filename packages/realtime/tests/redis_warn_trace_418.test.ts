/**
 * @fileoverview #418 — the three catch sites in `drivers/redis.ts` the
 * security-review audit named as still calling `console.warn` directly,
 * traced and (all three) routed through `#guardedWarn`.
 *
 * **Traced call chains** — what calls the enclosing function, and what a
 * throwing sink does to it:
 *
 * - **T1** the malformed-Redis-payload catch in `onMessage`'s `#deliver`.
 *   `#deliver` IS the handler `RedisSubscriber.psubscribe`/`subscribeOne`
 *   calls directly for every delivered message — nothing in this class wraps
 *   that call in a `try`. The port's own JSDoc makes no promise that a
 *   throwing handler is contained (a test passes a fake bus; production
 *   supplies `@lockness/redis`'s `RedisSubscribeConnection`, whose OWN
 *   `#deliver` happens to contain a handler fault, but that is the concrete
 *   adapter's choice, not the port's contract) — and this package's own
 *   `FakeRedis` test double dispatches every subscriber synchronously, inside
 *   its `PUBLISH` fan-out loop, with no containment of its own. An unguarded
 *   throw there escapes that loop (skipping any other subscriber on the same
 *   publish) and surfaces as a synchronous throw out of the `PUBLISH` round
 *   trip itself.
 * - **T2** the malformed-control catch in `#verifyAndDecode` — the
 *   control-topic twin of T1: `onControl`'s `deliver` closure calls
 *   `#verifyAndDecode` directly as the subscriber's handler, the identical
 *   unwrapped call site.
 * - **T3** the ghost-sweep departure-handler catch in `#announceSwept`
 *   (#348 plan §11, S2 — DELIBERATELY drops the handler's own error, never
 *   the WARN's). The `await handler(...)` it wraps sits inside
 *   `#sweepPage`'s loop over one dead instance's owned slots, with no `try`
 *   between here and there — so an unguarded `console.warn` failing rejects
 *   `#announceSwept`, which `#sweepPage` awaits with no `try` of its own,
 *   aborting the loop and skipping every remaining slot on the page (and any
 *   further page) for the SAME dead instance this pass — the #395 "escapes a
 *   loop and skips the rest of it" shape. `#sweepInstance`'s own `try` around
 *   `#sweepOwned` contains the rejection one frame up (it never reaches
 *   `SWEEP_LOG_FAILED`, and never stops another dead instance's sweep), but
 *   only by reporting a DIFFERENT, generic "sweep … failed" line — the
 *   specific departure this site's own WARN would have named is lost, and
 *   the un-swept slots recover only on a later pass.
 *
 * All three escape, so all three are now routed through `#guardedWarn`
 * (#409's #369 shape): a throwing sink writes one marked ERROR line instead
 * of escaping.
 *
 * Red before #418: T1 and T2 fail on `no synchronous throw` (`FakeRedis`'s
 * `PUBLISH` fan-out throws before ever returning a promise to await); T3
 * fails on `no rejection reaches the runtime` after the second, well-formed
 * departure never gets reported — proof that the escape cost real work, not
 * only the log line.
 *
 * @module @lockness/realtime/tests/redis_warn_trace_418
 */

import { assert, assertEquals } from '@std/assert'
import { FakeTime } from '@std/testing/time'
import {
    CONTROL_DECODE_LOG_FAILED,
    MESSAGE_DECODE_LOG_FAILED,
    RedisBroadcastDriver,
    SWEEP_DEPARTURE_LOG_FAILED,
} from '../drivers/redis.ts'
import { FakeRedis } from './fake_redis.ts'
import {
    everyChannelThrows,
    settle,
    watchingEscapes,
} from './escape_watcher.ts'

const START = new Date('2026-09-26T10:00:00Z')
const PREFIX = 'app:rt'
const SECRET = 'deployment-secret-with-enough-entropy'
const CHANNEL = 'presence-room'
const DEAD = 'instance-dead'
const HOLDERS_KEY = (channel: string, id: string | number) =>
    `${PREFIX}__holders:${channel} ${String(id)}`
const PRESENCE_KEY = (channel: string) => `${PREFIX}__presence:${channel}`
const OWNED_KEY = (instanceId: string) => `${PREFIX}__owned:${instanceId}`
const INSTANCES_KEY = `${PREFIX}__instances`

/** A roster entry byte-identical to what `HOLD_MEMBER_SCRIPT` writes. */
const entry = (id: string | number) =>
    JSON.stringify({ member: { id }, owner: DEAD })

/** Write a dead instance's hold directly, as `presence_sweep_departure_348.test.ts` does. */
async function plantHold(
    redis: FakeRedis,
    channel: string,
    field: string,
    value: string,
): Promise<void> {
    await redis.command('HSET', HOLDERS_KEY(channel, field), DEAD, value)
    await redis.command('HSET', PRESENCE_KEY(channel), field, value)
    await redis.command('SADD', OWNED_KEY(DEAD), `${channel} ${field}`)
    await redis.command('SADD', INSTANCES_KEY, DEAD)
}

/** A row, armed: what drives it to its sink, and what tears it down. */
interface Armed {
    /** Drive the sink. Runs with every log channel throwing. */
    fire: () => Promise<void>
    /** Tear the fixture down, after the channels are restored. */
    dispose: () => Promise<void>
}

/** One traced site: its name, and how to build a fixture that reaches it. */
interface TraceRow {
    name: string
    /** The marker the row's ERROR line must start with: its own site's. */
    marker: string
    /** Words the line's subject, before any `; sink failure`, must carry. */
    subject: string
    /** Build the fixture. Runs with the real log channels. */
    arm: () => Promise<Armed> | Armed
}

const ROWS: TraceRow[] = [
    {
        name: "T1 the malformed-Redis-payload catch in onMessage's #deliver",
        marker: MESSAGE_DECODE_LOG_FAILED,
        subject: 'realtime: dropped a malformed Redis payload',
        arm: () => {
            const redis = new FakeRedis()
            const driver = new RedisBroadcastDriver(
                { command: redis.command },
                redis.subscriberFor(),
                { prefix: PREFIX },
            )
            driver.onMessage(() => {})
            const topic = `${PREFIX}__event:news`
            return {
                // Not async, and not awaited: `redis.command(...)` dispatches
                // to every subscriber SYNCHRONOUSLY, inside its own call —
                // before it ever returns a promise. An unguarded throw here
                // is a throw out of calling `fire()` itself, exactly like
                // `escaping_sinks_395.test.ts`'s "the publish throws" row.
                fire: () => {
                    void redis.command('PUBLISH', topic, 'not json')
                    return Promise.resolve()
                },
                dispose: () => driver.close(),
            }
        },
    },
    {
        name: 'T2 the malformed-control-payload catch in #verifyAndDecode',
        marker: CONTROL_DECODE_LOG_FAILED,
        subject: 'realtime: dropped a malformed control payload',
        arm: () => {
            const redis = new FakeRedis()
            const driver = new RedisBroadcastDriver(
                { command: redis.command },
                redis.subscriberFor(),
                { prefix: PREFIX, control: { secret: SECRET } },
            )
            driver.onControl(() => {})
            const topic = `${PREFIX}__control`
            return {
                fire: () => {
                    void redis.command('PUBLISH', topic, 'not json')
                    return Promise.resolve()
                },
                dispose: () => driver.close(),
            }
        },
    },
]

for (const row of ROWS) {
    Deno.test(`#418 ${row.name}: every channel throwing, nothing escapes`, async () => {
        await watchingEscapes(async (escaped) => {
            const armed = await row.arm()
            let thrown: unknown = undefined
            let lines: readonly string[] = []
            try {
                using channels = everyChannelThrows()
                try {
                    await armed.fire()
                    await settle()
                } catch (error) {
                    thrown = error
                }
                lines = [...channels.errorLines()]
            } finally {
                await armed.dispose()
            }
            assertEquals(thrown, undefined, 'no synchronous throw')
            assertEquals(escaped, [], 'no rejection reaches the runtime')
            const marked = lines.filter((line) =>
                line.startsWith(`${row.marker} `)
            )
            assert(
                marked.length >= 1,
                `the site's own marked line was attempted: ${
                    JSON.stringify(lines)
                }`,
            )
            assert(
                marked.some((line) =>
                    line.split('; sink failure')[0].includes(row.subject)
                ),
                `its subject carries "${row.subject}": ${
                    JSON.stringify(marked)
                }`,
            )
            assert(
                marked.some((line) => {
                    const [, second] = line.split('; sink failure: ')
                    return second !== undefined &&
                        second.includes('warn sink down')
                }),
                `its second half carries "; sink failure: warn sink down": ${
                    JSON.stringify(marked)
                }`,
            )
        })
    })
}

/**
 * T3 — a separate shape from T1/T2 (an `async` driven fixture over `FakeTime`,
 * not a synchronous `PUBLISH` fan-out), and one extra half T1/T2 have no
 * analogue for: proving the SECOND, well-formed departure on the same page
 * is still reported once the WARN is guarded — the #402 "contained is not
 * the end of the story" check, aimed at #395's own reference shape (a WARN
 * escaping a loop and skipping the rest of it).
 */
Deno.test('#418 T3 the ghost-sweep departure-handler catch in #announceSwept: every channel throwing, the sweep still reaches the next slot', async () => {
    await watchingEscapes(async (escaped) => {
        const time = new FakeTime(START)
        const redis = new FakeRedis()
        const driver = new RedisBroadcastDriver(
            { command: redis.command },
            redis.subscriberFor(),
            {
                prefix: PREFIX,
                presence: {
                    livenessTtlSeconds: 2,
                    heartbeatIntervalMs: 500,
                    reconcileIntervalMs: 1_000,
                },
            },
        )
        const reported: (string | number)[] = []
        driver.onRosterDeparture?.(({ member }) => {
            if (member.id === 'throws') {
                throw new Error('departure handler refused (#418)')
            }
            reported.push(member.id)
        })
        let thrown: unknown = undefined
        let lines: readonly string[] = []
        try {
            // The throwing slot FIRST, so "the sweep still reaches the next
            // slot" is proven by the well-formed one released right after it,
            // on the SAME page of the SAME dead instance's sweep.
            await plantHold(redis, CHANNEL, 'throws', entry('throws'))
            await plantHold(redis, CHANNEL, '8', entry(8))
            // The driver holds something of its own, so its reconcile pass
            // runs at all.
            await driver.holdMember('presence-other', { id: 9 })
            using channels = everyChannelThrows()
            try {
                await time.tickAsync(3_500)
                await settle()
            } catch (error) {
                thrown = error
            }
            lines = [...channels.errorLines()]
        } finally {
            await driver.close()
            time.restore()
            redis.assertNoRejections()
        }
        assertEquals(thrown, undefined, 'no synchronous throw')
        assertEquals(escaped, [], 'no rejection reaches the runtime')
        const marked = lines.filter((line) =>
            line.startsWith(`${SWEEP_DEPARTURE_LOG_FAILED} `)
        )
        assert(
            marked.length >= 1,
            `the site's own marked line was attempted: ${
                JSON.stringify(lines)
            }`,
        )
        assert(
            marked.some((line) =>
                line.split('; sink failure')[0].includes(
                    'the roster departure handler failed',
                )
            ),
            `its subject names the departure-handler failure: ${
                JSON.stringify(marked)
            }`,
        )
        assertEquals(
            reported,
            [8],
            'the well-formed departure right after the throwing one is ' +
                "still reported — the WARN's own sink failure did not " +
                'also cost #sweepPage the rest of its page',
        )
    })
})
