/**
 * @fileoverview Distributed {@link SchedulerLock} adapters (#219).
 *
 * The concrete locks live at the composition root, never inside
 * `@lockness/scheduler` (which imports nothing and must not drag a Redis client
 * into every in-process-cron application). Core builds one of these from the
 * deployment's configuration and injects it via `scheduler().setLock(...)`.
 *
 * Both adapters implement the same owner-token discipline the security audit
 * (#219 SEC-F1) requires: `acquire` writes a unique per-claim token, and
 * `release` deletes the key **only when the stored token is still this holder's**
 * — a compare-and-delete — so a claim that expired and was re-acquired by another
 * replica is never deleted out from under it. The token lives in the adapter's
 * own instance state, so the port stays `acquire(): Promise<boolean>` (SEC-F3).
 *
 * The guarantee is at-most-once **within the TTL**: size `ttlMs` above a guarded
 * task's worst-case runtime (SEC-F2).
 *
 * @module @lockness/core/scheduler/locks
 * @since 0.2.1
 */

import type { SchedulerLock } from '@lockness/scheduler'

/** Default claim lifetime: long enough to cover a typical cron task. */
const DEFAULT_TTL_MS = 300_000

/** The key a task+occurrence claims, shared by both adapters. */
function lockKey(task: string, occurrence: Date): string {
    return `lockness:scheduler:lock:${task}:${occurrence.toISOString()}`
}

/** One parsed RESP reply — the structural slice these adapters read. */
interface CommandReply {
    readonly type: string
    readonly value?: string | number
}

/**
 * The minimal Redis client surface the lock needs: one serialized `command`.
 * `@lockness/redis`'s `RedisClient` satisfies it structurally, and a test can
 * pass a fake.
 */
export interface RedisCommandClient {
    command(...args: string[]): Promise<CommandReply>
}

/**
 * A {@link SchedulerLock} backed by Redis `SET key <token> NX PX` (atomic claim
 * with a TTL) and an owner-checked Lua compare-and-delete on release.
 */
export class RedisSchedulerLock implements SchedulerLock {
    readonly #client: RedisCommandClient
    readonly #ttlMs: number
    /** This holder's tokens, so release can prove ownership. */
    readonly #owned = new Map<string, string>()

    /** Owner-checked delete: remove the key only if it still holds our token. */
    static readonly RELEASE_SCRIPT =
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end"

    constructor(client: RedisCommandClient, ttlMs: number = DEFAULT_TTL_MS) {
        this.#client = client
        this.#ttlMs = ttlMs
    }

    async acquire(task: string, occurrence: Date): Promise<boolean> {
        const key = lockKey(task, occurrence)
        const token = crypto.randomUUID()
        const reply = await this.#client.command(
            'SET',
            key,
            token,
            'NX',
            'PX',
            String(this.#ttlMs),
        )
        // A successful `SET NX` replies `+OK`; a key already held replies nil.
        const acquired = reply.type === 'simple' && reply.value === 'OK'
        if (acquired) this.#owned.set(key, token)
        return acquired
    }

    async release(task: string, occurrence: Date): Promise<void> {
        const key = lockKey(task, occurrence)
        const token = this.#owned.get(key)
        this.#owned.delete(key)
        if (token === undefined) return
        await this.#client.command(
            'EVAL',
            RedisSchedulerLock.RELEASE_SCRIPT,
            '1',
            key,
            token,
        )
    }
}

/** The slice of `Deno.Kv` the KV lock uses (so a test can supply a real one). */
type KvHandle = Pick<Deno.Kv, 'get' | 'atomic'>

/**
 * A dependency-free {@link SchedulerLock} backed by Deno KV, for deployments
 * that run on KV without a Redis (e.g. Deno Deploy). `acquire` is an atomic
 * check-and-set guarded on the key's absence with `expireIn` as the TTL;
 * `release` is an atomic owner-checked delete.
 */
export class DenoKvSchedulerLock implements SchedulerLock {
    readonly #kv: KvHandle
    readonly #ttlMs: number
    readonly #owned = new Map<string, string>()

    constructor(kv: KvHandle, ttlMs: number = DEFAULT_TTL_MS) {
        this.#kv = kv
        this.#ttlMs = ttlMs
    }

    async acquire(task: string, occurrence: Date): Promise<boolean> {
        const keyStr = lockKey(task, occurrence)
        const key = [
            'lockness',
            'scheduler',
            'lock',
            task,
            occurrence.toISOString(),
        ]
        const token = crypto.randomUUID()
        // Set only if the key does not exist (versionstamp null), with a TTL.
        const res = await this.#kv.atomic()
            .check({ key, versionstamp: null })
            .set(key, token, { expireIn: this.#ttlMs })
            .commit()
        if (res.ok) this.#owned.set(keyStr, token)
        return res.ok
    }

    async release(task: string, occurrence: Date): Promise<void> {
        const keyStr = lockKey(task, occurrence)
        const key = [
            'lockness',
            'scheduler',
            'lock',
            task,
            occurrence.toISOString(),
        ]
        const token = this.#owned.get(keyStr)
        this.#owned.delete(keyStr)
        if (token === undefined) return
        const current = await this.#kv.get<string>(key)
        // Owner-checked: delete only if it still holds our token, and do it
        // atomically against the version we just read so we never delete a
        // value written between the read and the delete.
        if (current.value === token) {
            await this.#kv.atomic().check(current).delete(key).commit()
        }
    }
}
