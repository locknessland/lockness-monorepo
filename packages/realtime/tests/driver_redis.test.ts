/**
 * @fileoverview Tests for cross-process fan-out — SC-004 + SC-004a (S6).
 *
 * A broadcast published by one instance reaches an authorized subscriber on a
 * second instance; the receiving instance re-applies its LOCAL authorization,
 * so a locally-unauthorized connection receives nothing. Proven with a fake
 * Redis pub/sub bus — no live socket.
 *
 * @module @lockness/realtime/tests/driver_redis
 */

import { assert, assertEquals } from '@std/assert'
import { ChannelManager } from '../manager.ts'
import { RedisBroadcastDriver } from '../drivers/redis.ts'
import type { Connection } from '../types.ts'

interface User {
    id: number
}

/** A fake Redis pub/sub bus shared by driver instances. */
class FakeRedisBus {
    private readonly subscribers: Array<
        { pattern: string; handler: (topic: string, payload: string) => void }
    > = []
    /** The command client each driver publishes through. */
    readonly command = (...args: string[]): Promise<unknown> => {
        if (args[0] === 'PUBLISH') {
            const [, topic, payload] = args
            for (const s of this.subscribers) {
                if (topic.startsWith(s.pattern.replace(/\*$/, ''))) {
                    s.handler(topic, payload)
                }
            }
        }
        return Promise.resolve(0)
    }
    subscriberFor() {
        return {
            psubscribe: (
                pattern: string,
                handler: (topic: string, payload: string) => void,
            ) => {
                this.subscribers.push({ pattern, handler })
            },
        }
    }
}

function fakeConn(id: string, identity: User | null): Connection<User> {
    const sent: string[] = []
    return {
        id,
        identity,
        metadata: {},
        send: (d) => void sent.push(d as string),
        close: () => {},
        get _sent() {
            return sent
        },
    } as Connection<User> & { readonly _sent: string[] }
}
const sentOf = (c: Connection<User>) =>
    (c as unknown as { _sent: string[] })._sent

function instance(bus: FakeRedisBus, authorize: (id: User | null) => boolean) {
    const driver = new RedisBroadcastDriver(
        { command: bus.command },
        bus.subscriberFor(),
        { prefix: 'app:rt' },
    )
    return new ChannelManager<User>({ driver, authorize })
}

Deno.test('SC-004: a broadcast on instance A reaches an authorized subscriber on instance B', async () => {
    const bus = new FakeRedisBus()
    const a = instance(bus, () => true)
    const b = instance(bus, () => true)

    const subA = fakeConn('a1', { id: 1 })
    const subB = fakeConn('b1', { id: 2 })
    await a.subscribe(subA, 'private-room')
    await b.subscribe(subB, 'private-room')

    a.broadcast('private-room', 'msg', { text: 'hello' })

    // Both instances' subscribers received it (cross-process fan-out).
    assertEquals(sentOf(subA).length, 1)
    assertEquals(sentOf(subB).length, 1)
    assertEquals(JSON.parse(sentOf(subB)[0]).channel, 'private-room')
})

Deno.test('SC-004a: the receiving instance re-applies local authorization (S6)', async () => {
    const bus = new FakeRedisBus()
    const a = instance(bus, () => true)
    // Instance B denies everyone, so no local subscription exists on B.
    const b = instance(bus, () => false)

    const subA = fakeConn('a1', { id: 1 })
    const notOnB = fakeConn('b1', { id: 2 })
    await a.subscribe(subA, 'private-room')
    const okB = await b.subscribe(notOnB, 'private-room') // denied on B
    assertEquals(okB.ok, false)

    a.broadcast('private-room', 'secret', { s: 1 })

    assertEquals(sentOf(subA).length, 1) // A's authorized subscriber gets it
    assertEquals(sentOf(notOnB).length, 0) // B has no authorized local subscriber
})

Deno.test('cross-channel isolation: a broadcast to X is not delivered to a Y subscriber', async () => {
    const bus = new FakeRedisBus()
    const a = instance(bus, () => true)
    const onY = fakeConn('y', { id: 3 })
    await a.subscribe(onY, 'private-y')
    a.broadcast('private-x', 'e', {})
    assertEquals(sentOf(onY).length, 0)
})

Deno.test('S3 ingest: a Redis message with an out-of-charset event name is dropped', () => {
    const bus = new FakeRedisBus()
    const driver = new RedisBroadcastDriver(
        { command: bus.command },
        bus.subscriberFor(),
        { prefix: 'app:rt' },
    )
    const got: unknown[] = []
    driver.onMessage((m) => got.push(m))
    // A peer publishes a poisoned event name — it must not reach local fan-out.
    bus.command(
        'PUBLISH',
        'app:rt:news',
        JSON.stringify({ event: 'bad name!<x>', data: 1 }),
    )
    assertEquals(got.length, 0)
})

Deno.test('publish sends PUBLISH with the reserved prefix and JSON payload', async () => {
    const bus = new FakeRedisBus()
    const calls: string[][] = []
    const driver = new RedisBroadcastDriver(
        { command: (...a) => (calls.push(a), Promise.resolve(0)) },
        bus.subscriberFor(),
        { prefix: 'app:rt' },
    )
    await driver.publish({ channel: 'news', event: 'e', data: { n: 1 } })
    assertEquals(calls[0][0], 'PUBLISH')
    assertEquals(calls[0][1], 'app:rt:news')
    assert(calls[0][2].includes('"event":"e"'))
})
