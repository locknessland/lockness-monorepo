/**
 * The worker's terminal seam (#220): a job that exhausts its attempts is
 * dead-lettered (never silently dropped) and its `failed()` hook runs; a job
 * with attempts remaining is re-enqueued, not dead-lettered.
 *
 * This drives a *failing* job all the way through `QueueWorker.processJob`, the
 * integration point the driver-level DLQ tests do not cover.
 *
 * @module @lockness/queue/tests/worker_seam
 */

import { assert, assertEquals } from '@std/assert'
import {
    configureQueue,
    dispatch,
    type Job,
    type JobPayload,
    listFailedJobs,
    queueSize,
    QueueWorker,
    registerJob,
} from '../mod.ts'

class FailingJob implements Job<JobPayload> {
    readonly name = 'seam-failing'
    readonly maxAttempts = 1
    readonly payload: JobPayload
    static failedCalled = false
    constructor(payload: JobPayload) {
        this.payload = payload
    }
    handle(): Promise<void> {
        return Promise.reject(new Error('always fails'))
    }
    failed(): Promise<void> {
        FailingJob.failedCalled = true
        return Promise.resolve()
    }
}

class RetryJob implements Job<JobPayload> {
    readonly name = 'seam-retry'
    readonly maxAttempts = 3
    readonly payload: JobPayload
    constructor(payload: JobPayload) {
        this.payload = payload
    }
    handle(): Promise<void> {
        return Promise.reject(new Error('transient'))
    }
}

Deno.test('worker - a job that exhausts its attempts is dead-lettered and its failed() hook runs', async () => {
    FailingJob.failedCalled = false
    configureQueue({
        driver: 'memory',
        defaultQueue: 'wseam-1',
        retryDelay: 1_000,
    })
    registerJob(FailingJob)
    const id = await dispatch(new FailingJob({ n: 1 }))

    await new QueueWorker({ queues: ['wseam-1'], maxJobs: 1, sleep: 0 }).start()

    const failed = await listFailedJobs('wseam-1')
    assertEquals(
        failed.map((f) => f.id),
        [id],
        'the exhausted job is dead-lettered',
    )
    assert(FailingJob.failedCalled, 'the failed() hook ran on exhaustion')
})

Deno.test('worker - a job with attempts remaining is re-enqueued, not dead-lettered', async () => {
    // A long retryDelay keeps the re-enqueued job in the queue (delayed) rather
    // than immediately re-popped, so we can observe it was NOT dead-lettered.
    configureQueue({
        driver: 'memory',
        defaultQueue: 'wseam-2',
        retryDelay: 60_000,
    })
    registerJob(RetryJob)
    await dispatch(new RetryJob({ n: 2 }))

    await new QueueWorker({ queues: ['wseam-2'], maxJobs: 1, sleep: 0 }).start()

    assertEquals(
        (await listFailedJobs('wseam-2')).length,
        0,
        'a retryable failure must not dead-letter',
    )
    assertEquals(
        await queueSize('wseam-2'),
        1,
        're-enqueued for the next attempt',
    )
})
