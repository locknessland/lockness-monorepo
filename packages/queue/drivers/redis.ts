/**
 * @fileoverview Durable Redis queue driver (#220).
 *
 * A queue is a Redis **sorted set** keyed by `availableAt`, so a delayed or
 * retried job is simply a member with a future score; `pop` claims the earliest
 * due member with an atomic Lua `ZRANGEBYSCORE … ZREM`, so two workers never
 * take the same job. The dead-letter store is a Redis **hash** keyed by job id,
 * holding the whole job plus its failure — durable across restarts, and the
 * source `queue:retry` re-enqueues from.
 *
 * The driver owns no connection itself: it takes a `RedisCommandClient` (the
 * `@lockness/redis` `RedisClient` satisfies it), so a test can drive it against
 * an in-memory RESP double and the composition root owns the real socket.
 *
 * @module @lockness/queue/drivers/redis
 */

import type { DeadLetterEntry, QueueDriver, SerializedJob } from '../types.ts'

/** One parsed RESP reply — the structural slice this driver reads. */
interface CommandReply {
    readonly type: string
    readonly value?: string | number | readonly CommandReply[]
}

/**
 * The minimal Redis client surface this driver needs. `@lockness/redis`'s
 * `RedisClient` satisfies it; a test passes a fake.
 */
export interface RedisCommandClient {
    command(...args: string[]): Promise<CommandReply>
}

/** Shared prefix for every queue sorted-set key. */
const QUEUE_PREFIX = 'lockness:queue:'

/** The queue sorted-set key. */
function queueKey(name: string): string {
    return `${QUEUE_PREFIX}${name}`
}

/** The single dead-letter hash key. */
const DLQ_KEY = 'lockness:queue:dlq'

/** Atomic claim: take the earliest member whose score (availableAt) is due. */
const POP_SCRIPT =
    "local due = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[1], 'LIMIT', 0, 1); " +
    'if #due == 0 then return nil end; ' +
    "redis.call('ZREM', KEYS[1], due[1]); return due[1]"

/**
 * Atomic retry: read the dead-letter entry, re-enqueue its job at score `now`
 * with a fresh attempt count, and drop the dead-letter copy — all in one server
 * round-trip so a crash can never leave the job both queued and dead-lettered.
 *
 * `KEYS[1]` is the dead-letter hash; `ARGV[1]` the job id, `ARGV[2]` the new
 * `availableAt` score, `ARGV[3]` the queue key prefix. Returns `1` on a revive
 * and `0` when the id is absent (so nothing is enqueued).
 */
const RETRY_SCRIPT = "local raw = redis.call('HGET', KEYS[1], ARGV[1]); " +
    'if not raw then return 0 end; ' +
    'local job = cjson.decode(raw).job; ' +
    'job.attempts = 0; ' +
    'job.availableAt = tonumber(ARGV[2]); ' +
    "redis.call('ZADD', ARGV[3] .. job.queue, ARGV[2], cjson.encode(job)); " +
    "redis.call('HDEL', KEYS[1], ARGV[1]); return 1"

/** A durable {@link QueueDriver} over Redis. */
export class RedisQueueDriver implements QueueDriver {
    readonly #client: RedisCommandClient

    constructor(client: RedisCommandClient) {
        this.#client = client
    }

    async push(job: SerializedJob): Promise<void> {
        await this.#client.command(
            'ZADD',
            queueKey(job.queue),
            String(job.availableAt),
            JSON.stringify(job),
        )
    }

    async pop(queueName: string): Promise<SerializedJob | null> {
        const reply = await this.#client.command(
            'EVAL',
            POP_SCRIPT,
            '1',
            queueKey(queueName),
            String(Date.now()),
        )
        if (reply.type !== 'bulk' || typeof reply.value !== 'string') {
            return null
        }
        return JSON.parse(reply.value) as SerializedJob
    }

    async complete(_job: SerializedJob): Promise<void> {
        // The job was removed from the sorted set atomically in pop().
        await Promise.resolve()
    }

    async fail(job: SerializedJob, _error: Error): Promise<void> {
        // The worker set attempts + availableAt and decided a retry remains; the
        // driver just re-adds it at its new score. Exhaustion goes to deadLetter.
        await this.push(job)
    }

    async deadLetter(job: SerializedJob, error: Error): Promise<void> {
        await this.#client.command(
            'HSET',
            DLQ_KEY,
            job.id,
            JSON.stringify({ job, error: error.name, failedAt: Date.now() }),
        )
    }

    async listFailed(queueName?: string): Promise<DeadLetterEntry[]> {
        const reply = await this.#client.command('HVALS', DLQ_KEY)
        const values: readonly CommandReply[] = reply.type === 'array' &&
                Array.isArray(reply.value)
            ? reply.value
            : []
        const out: DeadLetterEntry[] = []
        for (const v of values) {
            if (v.type !== 'bulk' || typeof v.value !== 'string') continue
            const { job, error, failedAt } = JSON.parse(v.value) as {
                job: SerializedJob
                error: string
                failedAt: number
            }
            if (queueName !== undefined && job.queue !== queueName) continue
            out.push({
                id: job.id,
                name: job.name,
                queue: job.queue,
                attempts: job.attempts,
                failedAt,
                error,
            })
        }
        return out
    }

    async retryFailed(id: string): Promise<boolean> {
        const reply = await this.#client.command(
            'EVAL',
            RETRY_SCRIPT,
            '1',
            DLQ_KEY,
            id,
            String(Date.now()),
            QUEUE_PREFIX,
        )
        return reply.type === 'integer' && reply.value === 1
    }

    async size(queueName: string): Promise<number> {
        const reply = await this.#client.command('ZCARD', queueKey(queueName))
        return reply.type === 'integer' && typeof reply.value === 'number'
            ? reply.value
            : 0
    }

    async clear(queueName: string): Promise<void> {
        await this.#client.command('DEL', queueKey(queueName))
    }
}
