/**
 * @fileoverview Retry backoff — the single home of "when may the next attempt
 * run" (#220).
 *
 * The delay used to be computed inside each driver's `fail()`, copied verbatim
 * across the memory and Deno-KV drivers; a Redis driver made three. Backoff is
 * queue *policy*, not driver storage, so it lives here and every driver merely
 * persists the `availableAt` the worker computed.
 *
 * @module @lockness/queue/backoff
 * @since 0.2.1
 */

import type { QueueConfig } from './types.ts'

/**
 * The instant a job's next attempt becomes available.
 *
 * @param attempt - The attempt number that just failed (1-based).
 * @param config - The queue config carrying `retryDelay` and `backoff`.
 * @param now - The current epoch-ms (injectable for tests). Defaults to `Date.now()`.
 * @returns An epoch-ms timestamp for `SerializedJob.availableAt`.
 *
 * @example
 * ```ts
 * job.availableAt = computeNextAvailable(job.attempts, getQueueConfig())
 * ```
 */
export function computeNextAvailable(
    attempt: number,
    config: QueueConfig,
    now: number = Date.now(),
): number {
    const base = config.retryDelay
    if (config.backoff === 'exponential') {
        // retryDelay * 2^(attempt-1): 1×, 2×, 4×, … Guard the exponent so a
        // large attempt count cannot overflow into a non-finite delay.
        const factor = 2 ** Math.max(0, attempt - 1)
        return now + base * factor
    }
    return now + base
}
