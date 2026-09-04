/**
 * @fileoverview Deno KV queue driver.
 *
 * Persists jobs in a Deno KV store, keyed by availability time for ordering.
 * Owns the KV handle and registers it with the lifecycle drain so a stopped
 * worker releases the store it was reading from.
 *
 * @module @lockness/queue/drivers/deno_kv
 */

import {
    deregisterDisposable,
    type DisposableHandle,
    registerDisposable,
} from '@lockness/contract/lifecycle/internal'
import type { QueueDriver, SerializedJob } from '../types.ts'
import { getQueueConfig } from '../config.ts'

export class DenoKvQueueDriver implements QueueDriver {
    private kv: Deno.Kv | null = null
    private kvPath?: string
    /**
     * The in-flight (or resolved) open, memoised so two callers racing the cold
     * path share ONE `Deno.openKv` (#140). Keying off the resolved `kv` field
     * instead leaves an `await` between the guard and the assignment, and the
     * first of two racers leaks its handle unreferenced.
     */
    #kvPromise: Promise<Deno.Kv> | undefined
    #handle?: DisposableHandle

    constructor(kvPath?: string) {
        this.kvPath = kvPath
    }

    private getKv(): Promise<Deno.Kv> {
        if (this.#kvPromise) return this.#kvPromise
        const promise: Promise<Deno.Kv> = this.#openKv(
            () => this.#kvPromise === promise,
        )
        this.#kvPromise = promise
        return promise
    }

    async #openKv(isCurrent: () => boolean): Promise<Deno.Kv> {
        let kv: Deno.Kv
        try {
            kv = await Deno.openKv(this.kvPath)
        } catch (error) {
            // Don't memoise a failed open — a later call must be free to retry.
            if (isCurrent()) this.#kvPromise = undefined
            throw error
        }
        if (!isCurrent()) {
            // A close() (or a newer open) supervened while we were opening.
            // Release the handle we just opened rather than orphaning it or
            // clobbering the driver's current one.
            kv.close()
            return kv
        }
        this.kv = kv
        // Announced once the handle exists, not in the constructor: a
        // driver built and never used owns nothing.
        this.#handle ??= registerDisposable({
            name: 'queue:deno-kv',
            dispose: () => this.close(),
            priority: 60,
        })
        return kv
    }

    /**
     * Release the Deno KV handle.
     *
     * **#136 never named this resource** — it described the queue's leak as
     * `QueueWorker.stop()` alone. The driver opens a KV handle of its own and
     * `kv.close` appeared nowhere in this package, so a stopped worker had not
     * released the store it was reading from.
     *
     * @example
     * ```typescript
     * await driver.close()
     * ```
     */
    async close(): Promise<void> {
        // Await an open still in flight so exactly one handle is created and
        // then closed; a concurrent close() during the cold path must not leave
        // the opened handle dangling. Defuse a failed open — the getKv caller
        // already saw that rejection; there is simply nothing to release.
        const opening = this.#kvPromise
        this.#kvPromise = undefined
        if (opening) await opening.catch(() => undefined)

        if (this.#handle) {
            deregisterDisposable(this.#handle)
            this.#handle = undefined
        }
        if (this.kv) {
            // Deno.Kv.close() throws if called twice; the null-guard plus the
            // cleared promise make a second close() a safe no-op.
            this.kv.close()
            this.kv = null
        }
    }

    async push(job: SerializedJob): Promise<void> {
        const kv = await this.getKv()
        // Use timestamp + id for ordering
        const key = ['queue', job.queue, job.availableAt, job.id]
        await kv.set(key, job)
    }

    async pop(queueName: string): Promise<SerializedJob | null> {
        const kv = await this.getKv()
        const now = Date.now()

        // List jobs in queue ordered by availableAt
        const iter = kv.list<SerializedJob>({
            prefix: ['queue', queueName],
        })

        for await (const entry of iter) {
            const job = entry.value
            if (job.availableAt <= now) {
                // Try to atomically delete and return
                const result = await kv.atomic()
                    .check(entry)
                    .delete(entry.key)
                    .commit()

                if (result.ok) {
                    return job
                }
                // Someone else got it, continue
            }
        }

        return null
    }

    async complete(_job: SerializedJob): Promise<void> {
        // Job already removed in pop()
    }

    async fail(job: SerializedJob, _error: Error): Promise<void> {
        if (job.attempts < job.maxAttempts) {
            job.attempts++
            job.availableAt = Date.now() + getQueueConfig().retryDelay
            await this.push(job)
        }
    }

    async size(queueName: string): Promise<number> {
        const kv = await this.getKv()
        let count = 0
        const iter = kv.list({ prefix: ['queue', queueName] })
        for await (const _ of iter) {
            count++
        }
        return count
    }

    async clear(queueName: string): Promise<void> {
        const kv = await this.getKv()
        const iter = kv.list({ prefix: ['queue', queueName] })
        for await (const entry of iter) {
            await kv.delete(entry.key)
        }
    }
}
