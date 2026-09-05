/**
 * @fileoverview SC-008 — the control-plane forgery matrix (FR-015/FR-019).
 *
 * The reserved control topic is isolation-by-convention only; anyone with bus
 * `PUBLISH` can put a well-formed frame on it. Authenticity is the sole gate: a
 * frame whose MAC is absent, forged, or signed with the wrong secret — and a
 * frame whose routing names are out of charset — is dropped on ingest and NEVER
 * actioned. This proves the matrix end-to-end by publishing raw frames directly
 * onto the bus (bypassing `publishControl`, exactly as an attacker would) and
 * asserting neither the driver `onControl` seam nor the manager ever obeys them:
 * no forged evict closes a socket, no spoofed `presence-join` injects a member.
 *
 * @module @lockness/realtime/tests/control_auth
 */

import { assertEquals } from '@std/assert'
import { ChannelManager } from '../manager.ts'
import { RedisBroadcastDriver } from '../drivers/redis.ts'
import type { ControlMessage } from '../driver.ts'
import type { PresenceMember } from '../channel.ts'
import type { Connection } from '../types.ts'
import { FakeRedis } from './fake_redis.ts'

const CONTROL_TOPIC = 'app:rt__control'

interface User {
    id: number
    name: string
}

interface Spy {
    readonly _frames: Record<string, unknown>[]
    readonly _closed: number
}

function fakeConn(id: string, identity: User | null): Connection<User> {
    const frames: Array<Record<string, unknown>> = []
    let closed = 0
    return {
        id,
        identity,
        metadata: {},
        send: (d) => void frames.push(JSON.parse(d as string)),
        close: () => void closed++,
        get _frames() {
            return frames
        },
        get _closed() {
            return closed
        },
    } as Connection<User> & Spy
}
const closedOf = (c: Connection<User>) => (c as unknown as Spy)._closed

const authorize = (id: User | null): PresenceMember | false =>
    id ? { id: id.id, info: { name: id.name } } : false

function driver(
    redis: FakeRedis,
    secret = 'deployment-secret-with-enough-entropy',
) {
    return new RedisBroadcastDriver(
        { command: redis.command },
        redis.subscriberFor(),
        { prefix: 'app:rt', control: { secret } },
    )
}

/** Publish a raw wire frame directly onto the control topic, as an attacker would. */
function forge(
    redis: FakeRedis,
    wire: Record<string, unknown>,
): Promise<unknown> {
    return redis.command('PUBLISH', CONTROL_TOPIC, JSON.stringify(wire))
}

Deno.test('SC-008: an absent-MAC control frame is dropped and never obeyed', async () => {
    const redis = new FakeRedis()
    const b = driver(redis)
    try {
        const got: ControlMessage[] = []
        b.onControl((c) => got.push(c))
        await forge(redis, { kind: 'evict', target: 'victim', origin: 'atk' })
        assertEquals(got.length, 0)
    } finally {
        await b.close()
    }
})

Deno.test('SC-008: a forged-MAC evict is dropped and never obeyed', async () => {
    const redis = new FakeRedis()
    const b = driver(redis)
    try {
        const got: ControlMessage[] = []
        b.onControl((c) => got.push(c))
        await forge(redis, {
            kind: 'evict',
            target: 'victim',
            origin: 'atk',
            mac: 'deadbeef'.repeat(8),
        })
        assertEquals(got.length, 0)
    } finally {
        await b.close()
    }
})

Deno.test('SC-008: a spoofed presence-join member is dropped and never obeyed', async () => {
    const redis = new FakeRedis()
    const b = driver(redis)
    try {
        const got: ControlMessage[] = []
        b.onControl((c) => got.push(c))
        await forge(redis, {
            kind: 'presence-join',
            target: 'ghost',
            channel: 'presence-lobby',
            member: { id: 999, info: { name: 'Impostor' } },
            origin: 'atk',
            mac: 'f'.repeat(64),
        })
        assertEquals(got.length, 0)
    } finally {
        await b.close()
    }
})

Deno.test('SC-008: end-to-end — a forged evict on the bus never closes an owned socket', async () => {
    const redis = new FakeRedis()
    const b = driver(redis)
    const manager = new ChannelManager<User>({ driver: b, authorize })
    try {
        const x = fakeConn('x', { id: 1, name: 'Xavier' })
        await manager.subscribe(x, 'presence-lobby')

        // A forged evict for X's socket, published straight onto the bus.
        await forge(redis, {
            kind: 'evict',
            target: 'x',
            origin: 'atk',
            mac: '0'.repeat(64),
        })
        await Promise.resolve()

        assertEquals(closedOf(x), 0, 'a forged evict must never close a socket')
        assertEquals(
            (await b.listMembers('presence-lobby')).some((m) => m.id === 1),
            true,
            'a forged evict must never drop a roster member',
        )
    } finally {
        await b.close()
    }
})

Deno.test('SC-008/FR-019: a validly-signed evict with an out-of-charset target is dropped', async () => {
    const redis = new FakeRedis()
    const b = driver(redis)
    try {
        const got: ControlMessage[] = []
        b.onControl((c) => got.push(c))
        // Signed by a legitimate sender, but the target id is out of charset —
        // the ingest name check drops it even though the MAC verifies.
        await driver(redis).publishControl({
            kind: 'evict',
            target: 'bad target!<script>',
        })
        assertEquals(got.length, 0)
    } finally {
        await b.close()
    }
})
