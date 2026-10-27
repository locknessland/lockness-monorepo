/**
 * Distributed scheduler-lock adapters (#219) — RedisSchedulerLock against a
 * RESP-shaped fake, and DenoKvSchedulerLock against an in-memory Deno KV. Both
 * must give once-across-replicas and an owner-checked release.
 *
 * @module @lockness/core/tests/scheduler_locks
 */

import { assert, assertEquals } from '@std/assert'
import {
    DenoKvSchedulerLock,
    type RedisCommandClient,
    RedisSchedulerLock,
} from '../scheduler/locks.ts'

/** A minimal Redis honouring `SET … NX PX` and the release compare-and-delete. */
class FakeRedis implements RedisCommandClient {
    readonly store = new Map<string, { val: string; exp: number }>()
    clock = 1_000_000

    command(
        ...args: string[]
    ): Promise<{ type: string; value?: string | number }> {
        const [cmd, ...rest] = args
        if (cmd === 'SET') {
            const [key, val, flag, , ms] = rest // SET key val NX PX <ms>
            const e = this.store.get(key)
            if (flag === 'NX' && e !== undefined && e.exp > this.clock) {
                return Promise.resolve({ type: 'nil' })
            }
            this.store.set(key, { val, exp: this.clock + Number(ms) })
            return Promise.resolve({ type: 'simple', value: 'OK' })
        }
        if (cmd === 'EVAL') {
            const [, , key, token] = rest // EVAL <script> 1 <key> <token>
            const e = this.store.get(key)
            if (e !== undefined && e.val === token) {
                this.store.delete(key)
                return Promise.resolve({ type: 'integer', value: 1 })
            }
            return Promise.resolve({ type: 'integer', value: 0 })
        }
        return Promise.resolve({ type: 'nil' })
    }
}

const AT = new Date('2026-03-01T10:01:00Z')

Deno.test('RedisSchedulerLock - two replicas on one store claim the occurrence once', async () => {
    const redis = new FakeRedis()
    const a = new RedisSchedulerLock(redis)
    const b = new RedisSchedulerLock(redis)
    assertEquals(await a.acquire('t', AT), true)
    assertEquals(await b.acquire('t', AT), false)
})

Deno.test('RedisSchedulerLock - release is owner-checked (Lua compare-and-delete)', async () => {
    const redis = new FakeRedis()
    const a = new RedisSchedulerLock(redis, 1_000)
    const b = new RedisSchedulerLock(redis, 1_000)

    assertEquals(await a.acquire('t', AT), true)
    redis.clock += 1_500 // a's claim expires
    assertEquals(await b.acquire('t', AT), true, 'b re-claims after expiry')

    // a (stale) releases — its token no longer matches, so b's claim survives.
    await a.release('t', AT)
    assertEquals(
        await b.acquire('t', AT),
        false,
        "b's live claim was not deleted",
    )
})

Deno.test('RedisSchedulerLock - a normal release frees the key for re-acquisition', async () => {
    const redis = new FakeRedis()
    const a = new RedisSchedulerLock(redis)
    assertEquals(await a.acquire('t', AT), true)
    await a.release('t', AT)
    const b = new RedisSchedulerLock(redis)
    assertEquals(await b.acquire('t', AT), true, 'released key is free')
})

Deno.test('DenoKvSchedulerLock - once across replicas + owner-checked release', async () => {
    const kv = await Deno.openKv(':memory:')
    try {
        const a = new DenoKvSchedulerLock(kv)
        const b = new DenoKvSchedulerLock(kv)
        assertEquals(await a.acquire('t', AT), true)
        assertEquals(await b.acquire('t', AT), false, 'live claim blocks b')

        // b (never acquired) releasing must not delete a's claim.
        await b.release('t', AT)
        assertEquals(await b.acquire('t', AT), false, "a's claim survived")

        // a's own release frees it.
        await a.release('t', AT)
        assert(await b.acquire('t', AT), 'released key is re-acquirable')
    } finally {
        kv.close()
    }
})
