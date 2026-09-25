/**
 * @fileoverview #391 — no marked-fallback sink throws past itself, even when
 * every log channel it has refuses the line.
 *
 * Seven sinks in this package end a chain that has no caller left: the #369
 * shape, `try { console.warn } catch { console.error(MARKER …) }`, or a
 * chain's last `.catch` writing one marked line. Before #391 none of them
 * guarded its own `console.error`, so a log sink that refused the ERROR as
 * well turned the fallback into the very rejection it exists to stop — and on
 * Deno an unhandled rejection terminates the process.
 *
 * **One table, one row per sink.** Each row drives a real path to its sink
 * with `console.warn`, `console.error` AND `Deno.stderr.writeSync` all
 * throwing, then asserts three things:
 *
 * - nothing throws synchronously out of the drive — the deadline's sink runs
 *   in a timer callback, where a throw is an uncaught exception, not a
 *   rejection, and FakeTime's `tickAsync` surfaces it;
 * - no rejection reaches the runtime ({@link watchingEscapes});
 * - the `console.error` stub was called at least once, so the row reached the
 *   fallback rather than passing because nothing failed.
 *
 * Each row's path is chosen so that it is the ONLY path to its sink: the
 * pass-sample row drives the handler's REJECTION, not a synchronous throw,
 * because a synchronous one would be caught again by the revocation chain's
 * own last handler and hide a regression at the pass-sample site.
 *
 * Red on `587bb7ca` (before #391): all seven rows.
 *
 * @module @lockness/realtime/tests/marked_fallback_sinks_391
 */

import { assert, assertEquals } from '@std/assert'
import { FakeTime } from '@std/testing/time'
import { buildEvents } from '../websocket.ts'
import { ChannelManager } from '../manager.ts'
import { MemoryBroadcastDriver } from '../drivers/memory.ts'
import { RedisBroadcastDriver } from '../drivers/redis.ts'
import { EnforcementDeadline } from '../drivers/enforcement_deadline.ts'
import type { BroadcastDriver, ControlMessage } from '../driver.ts'
import type { Connection, WebSocketHooks, WSContext } from '../types.ts'
import { type CommandFn, FakeRedis } from './fake_redis.ts'
import { settle, watchingEscapes } from './escape_watcher.ts'

interface User {
    id: number
}

const START = new Date('2026-09-25T10:00:00Z')
const PREFIX = 'app:rt'
/** The one interval both Redis passes run on, in milliseconds. */
const INTERVAL = 1_000
/** The revocation TTL, in seconds: at least twice the interval (#362). */
const TTL = 10

/** A row, armed: what drives it to its sink, and what tears it down. */
interface Armed {
    /** Drive the sink. Runs with every log channel throwing. */
    fire: () => Promise<void>
    /** Tear the fixture down, after the channels are restored. */
    dispose: () => Promise<void>
}

/** One sink: its name, and how to build a fixture that reaches it. */
interface SinkRow {
    name: string
    /** Build the fixture. Runs with the real log channels. */
    arm: () => Promise<Armed>
}

/**
 * Make `console.warn`, `console.error` and `Deno.stderr.writeSync` all throw,
 * counting the `console.error` attempts. Restored on scope exit.
 */
function everyChannelThrows() {
    const realWarn = console.warn
    const realError = console.error
    const realWrite = Deno.stderr.writeSync
    let errorCalls = 0
    console.warn = () => {
        throw new Error('warn sink down (#391)')
    }
    console.error = () => {
        errorCalls++
        throw new Error('error sink down (#391)')
    }
    Deno.stderr.writeSync = () => {
        throw new Error('stderr down (#391)')
    }
    return {
        errorCalls: () => errorCalls,
        [Symbol.dispose]: () => {
            console.warn = realWarn
            console.error = realError
            Deno.stderr.writeSync = realWrite
        },
    }
}

/** A socket context that accepts every frame and every close. */
const quietSocket = {
    send: () => {},
    close: () => {},
} as unknown as WSContext

/** A `buildEvents` fixture whose application `onMessage` throws. */
function websocketRow(hooks: WebSocketHooks<User>): Promise<Armed> {
    const events = buildEvents<User>({
        ...hooks,
        onMessage: () => {
            throw new Error('app onMessage failed (#391)')
        },
    }, { id: 1 })
    return Promise.resolve({
        fire: () => {
            events.onMessage?.({ data: 'x' } as MessageEvent, quietSocket)
            return Promise.resolve()
        },
        dispose: () => Promise.resolve(),
    })
}

/**
 * A Redis driver under FakeTime, over `command` (the fake's own port unless a
 * row replaces it). Its `fire` advances one interval in short steps, draining
 * the microtask queue after each.
 */
function redisRow(
    wire: (driver: RedisBroadcastDriver) => Promise<void> | void,
    port: (redis: FakeRedis) => CommandFn = (redis) => redis.command,
): Promise<Armed> {
    const time = new FakeTime(START)
    const redis = new FakeRedis()
    const driver = new RedisBroadcastDriver(
        { command: port(redis) },
        redis.subscriberFor(),
        {
            prefix: PREFIX,
            revocationTtlSeconds: TTL,
            presence: { reconcileIntervalMs: INTERVAL },
        },
    )
    return Promise.resolve(wire(driver)).then(() => ({
        fire: async () => {
            for (let left = INTERVAL; left > 0; left -= 250) {
                await time.tickAsync(250)
                await time.runMicrotasks()
            }
        },
        dispose: async () => {
            try {
                await driver.close()
            } finally {
                time.restore()
            }
        },
    }))
}

/**
 * A manager owning one subscribed socket, over a driver whose control seam
 * the row holds and whose `unwatchChannel` rejects, so an `evict` has a
 * teardown failure to WARN about (the #376 fixture).
 */
async function managerRow(): Promise<Armed> {
    const memory = new MemoryBroadcastDriver()
    let deliver: ((control: ControlMessage) => void) | undefined
    const driver: BroadcastDriver = {
        publish: (message) => memory.publish(message),
        onMessage: (handler) => memory.onMessage(handler),
        watchChannel: () => Promise.resolve(),
        unwatchChannel: () =>
            Promise.reject(new Error('broker unwatch failed')),
        onControl(handler) {
            deliver = handler
        },
        publishControl: () => Promise.resolve(),
        markRevocation: () => Promise.resolve(),
        listRevocations: () => Promise.resolve([]),
        clearRevocation: () => Promise.reject(new Error('broker clear failed')),
    }
    const manager = new ChannelManager<User>({
        driver,
        authorize: () => true,
    })
    const victim = {
        id: 'c1',
        identity: { id: 1 },
        metadata: {},
        send: () => {},
        close: () => {},
    } as unknown as Connection<User>
    assertEquals((await manager.subscribe(victim, 'private-room')).ok, true)
    assert(deliver !== undefined, 'the control seam was registered')
    const send = deliver
    return {
        fire: () => {
            send({ kind: 'evict', target: 'c1' })
            return Promise.resolve()
        },
        dispose: () => Promise.resolve(),
    }
}

const SINKS: SinkRow[] = [
    {
        name: "websocket reportError's #369 marked line (onError throws)",
        arm: () =>
            websocketRow({
                onError: () => {
                    throw new Error('app onError failed (#391)')
                },
            }),
    },
    {
        name: "websocket reportError's default line (no onError)",
        arm: () => websocketRow({}),
    },
    {
        name: 'redis revocation-pass chain (REVOCATION_LOG_FAILED)',
        arm: () =>
            redisRow((driver) =>
                driver.onRevocationReconcile(() => {
                    throw new Error('re-check down (#391)')
                })
            ),
    },
    {
        name: 'redis ghost-sweep chain (SWEEP_LOG_FAILED)',
        // The instance-set read is refused, so the sweep WARNs; the WARN
        // throws, so the pass rejects into the chain's last handler.
        arm: () =>
            redisRow(
                async (driver) => {
                    await driver.holdMember('presence-other', { id: 9 })
                },
                (redis) => (...args) =>
                    args[0] === 'SMEMBERS'
                        ? Promise.reject(new Error('refused (#391)'))
                        : redis.command(...args),
            ),
    },
    {
        name:
            "redis #warnPassSample (PASS_SAMPLE_LOG_FAILED, handler's rejection)",
        arm: () =>
            redisRow((driver) => {
                driver.onRevocationReconcile(async () => {
                    await driver.listRevocations()
                })
                driver.onPassComplete(() =>
                    Promise.reject(new Error('handler down (#391)'))
                )
            }),
    },
    {
        name:
            "enforcement deadline #write (REVOCATION_LOG_FAILED, the fire's WARN)",
        arm: () => {
            const time = new FakeTime(START)
            const deadline = new EnforcementDeadline({
                ttlMs: TTL * 1000,
                now: () => 0,
                inFlight: () => undefined,
            })
            return Promise.resolve({
                // An overdue arm decides MISSED now and writes it on a 0 ms
                // timer: the sink runs inside that timer's callback.
                fire: async () => {
                    deadline.arm(0)
                    await time.tickAsync(0)
                },
                dispose: () => {
                    deadline.close()
                    time.restore()
                    return Promise.resolve()
                },
            })
        },
    },
    {
        name: 'manager #dispatchRevocation (REVOCATION_APPLY_LOG_FAILED)',
        arm: managerRow,
    },
]

for (const [index, row] of SINKS.entries()) {
    Deno.test(`#391 S${index + 1} ${row.name}: every channel throwing, nothing escapes`, async () => {
        await watchingEscapes(async (escaped) => {
            const armed = await row.arm()
            let thrown: unknown = undefined
            let errorCalls = 0
            try {
                using channels = everyChannelThrows()
                try {
                    await armed.fire()
                    await settle()
                } catch (error) {
                    thrown = error
                }
                errorCalls = channels.errorCalls()
            } finally {
                await armed.dispose()
            }
            assertEquals(thrown, undefined, 'no synchronous throw')
            assertEquals(escaped, [], 'no rejection reaches the runtime')
            assert(
                errorCalls >= 1,
                'the console.error stub was reached: the fallback ran',
            )
        })
    })
}
