/**
 * @fileoverview In-memory queue driver.
 *
 * A process-local `Map` of named queues. The default driver, and the one the
 * tests exercise; holds no external resources.
 *
 * @module @lockness/queue/drivers/memory
 */

import type { QueueDriver, SerializedJob } from '../types.ts'
import { getQueueConfig } from '../config.ts'

const memoryQueues = new Map<string, SerializedJob[]>()

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
        if (job.attempts < job.maxAttempts) {
            // Requeue with delay
            job.attempts++
            job.availableAt = Date.now() + getQueueConfig().retryDelay
            const queue = this.getQueue(job.queue)
            queue.push(job)
        }
        return Promise.resolve()
    }

    size(queueName: string): Promise<number> {
        return Promise.resolve(this.getQueue(queueName).length)
    }

    clear(queueName: string): Promise<void> {
        memoryQueues.set(queueName, [])
        return Promise.resolve()
    }
}
