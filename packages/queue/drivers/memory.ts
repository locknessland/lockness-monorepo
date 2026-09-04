/**
 * @fileoverview In-memory queue driver.
 *
 * A process-local `Map` of named queues plus a process-local dead-letter store.
 * The default driver, and the one the tests exercise; holds no external
 * resources.
 *
 * @module @lockness/queue/drivers/memory
 */

import type { DeadLetterEntry, QueueDriver, SerializedJob } from '../types.ts'

const memoryQueues = new Map<string, SerializedJob[]>()

/** One dead-lettered job, held whole (the projection is built on listing). */
interface DeadEntry {
    readonly job: SerializedJob
    readonly error: string
    readonly failedAt: number
}

/** The process-local dead-letter store, keyed by job id. */
const memoryDeadLetters = new Map<string, DeadEntry>()

export class MemoryQueueDriver implements QueueDriver {
    private getQueue(name: string): SerializedJob[] {
        if (!memoryQueues.has(name)) {
            memoryQueues.set(name, [])
        }
        return memoryQueues.get(name)!
    }

    push(job: SerializedJob): Promise<void> {
        const queue = this.getQueue(job.queue)
        queue.push(job)
        return Promise.resolve()
    }

    pop(queueName: string): Promise<SerializedJob | null> {
        const queue = this.getQueue(queueName)
        const now = Date.now()

        // Find first available job (not delayed)
        const index = queue.findIndex((j) => j.availableAt <= now)
        if (index === -1) return Promise.resolve(null)

        return Promise.resolve(queue.splice(index, 1)[0])
    }

    async complete(_job: SerializedJob): Promise<void> {
        // Job already removed from queue in pop()
        await Promise.resolve()
    }

    fail(job: SerializedJob, _error: Error): Promise<void> {
        // The worker has already set attempts + availableAt and decided a retry
        // remains; the driver just re-persists it. Exhaustion goes to
        // deadLetter, never a silent drop.
        this.getQueue(job.queue).push(job)
        return Promise.resolve()
    }

    deadLetter(job: SerializedJob, error: Error): Promise<void> {
        memoryDeadLetters.set(job.id, {
            job,
            error: error.name,
            failedAt: Date.now(),
        })
        return Promise.resolve()
    }

    listFailed(queueName?: string): Promise<DeadLetterEntry[]> {
        const out: DeadLetterEntry[] = []
        for (const entry of memoryDeadLetters.values()) {
            if (queueName !== undefined && entry.job.queue !== queueName) {
                continue
            }
            out.push({
                id: entry.job.id,
                name: entry.job.name,
                queue: entry.job.queue,
                attempts: entry.job.attempts,
                failedAt: entry.failedAt,
                error: entry.error,
            })
        }
        return Promise.resolve(out)
    }

    retryFailed(id: string): Promise<boolean> {
        const entry = memoryDeadLetters.get(id)
        if (entry === undefined) return Promise.resolve(false)
        memoryDeadLetters.delete(id)
        const job = { ...entry.job, attempts: 0, availableAt: Date.now() }
        this.getQueue(job.queue).push(job)
        return Promise.resolve(true)
    }

    size(queueName: string): Promise<number> {
        return Promise.resolve(this.getQueue(queueName).length)
    }

    clear(queueName: string): Promise<void> {
        memoryQueues.set(queueName, [])
        return Promise.resolve()
    }
}
