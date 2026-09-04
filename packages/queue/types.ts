/**
 * @fileoverview Public type vocabulary for the Lockness queue system.
 *
 * The job, driver and configuration contracts shared across the package. Kept
 * dependency-free so drivers, the registry, the worker and the dispatch
 * helpers can all import from here without a cycle.
 *
 * @module @lockness/queue/types
 */

export interface JobPayload {
    [key: string]: unknown
}

export interface SerializedJob {
    id: string
    name: string
    payload: JobPayload
    attempts: number
    maxAttempts: number
    delay: number
    queue: string
    createdAt: number
    availableAt: number
}

export interface Job<T extends JobPayload = JobPayload> {
    /** Unique job name (used for dispatching) */
    name: string
    /** Maximum retry attempts */
    maxAttempts?: number
    /** Job payload data */
    payload: T
    /** Handle the job */
    handle(payload: T): Promise<void>
    /** Called when job fails after all retries */
    failed?(payload: T, error: Error): Promise<void>
}

export type JobClass<T extends JobPayload = JobPayload> = new (
    payload: T,
) => Job<T>

export interface QueueConfig {
    /** Default queue driver */
    driver: 'memory' | 'deno-kv'
    /** Default queue name */
    defaultQueue: string
    /** Deno KV path (optional) */
    kvPath?: string
    /** Job retry delay in ms */
    retryDelay: number
}

export interface QueueDriver {
    /** Push a job to the queue */
    push(job: SerializedJob): Promise<void>
    /** Pop the next available job */
    pop(queue: string): Promise<SerializedJob | null>
    /** Mark job as completed */
    complete(job: SerializedJob): Promise<void>
    /** Mark job as failed and requeue if retries left */
    fail(job: SerializedJob, error: Error): Promise<void>
    /** Get queue size */
    size(queue: string): Promise<number>
    /** Clear all jobs from queue */
    clear(queue: string): Promise<void>
}

export interface DispatchOptions {
    /** Queue name */
    queue?: string
    /** Delay in milliseconds before job is available */
    delay?: number
}

export interface WorkerOptions {
    /** Queue(s) to process */
    queues?: string[]
    /** Sleep time in ms when no jobs available */
    sleep?: number
    /** Maximum jobs to process (0 = unlimited) */
    maxJobs?: number
    /** Stop after queue is empty */
    stopWhenEmpty?: boolean
}
