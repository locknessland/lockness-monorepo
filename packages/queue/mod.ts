/**
 * Lockness Queue System
 *
 * Background job processing with multiple driver support.
 * Inspired by Laravel's queue system.
 *
 * @module @lockness/queue
 */

// =============================================================================
// Types & Interfaces
// =============================================================================

export type {
    DispatchOptions,
    Job,
    JobClass,
    JobPayload,
    QueueConfig,
    QueueDriver,
    SerializedJob,
    WorkerOptions,
} from './types.ts'

// =============================================================================
// Queue Configuration
// =============================================================================

export { configureQueue, getQueueConfig } from './config.ts'

// =============================================================================
// Job Registry & @Queueable Decorator
// =============================================================================

export { getJobClass, Queueable, registerJob } from './registry.ts'

// =============================================================================
// Drivers
// =============================================================================

export { MemoryQueueDriver } from './drivers/memory.ts'
export { DenoKvQueueDriver } from './drivers/deno_kv.ts'

// =============================================================================
// Queue Manager
// =============================================================================

export { setQueueDriver } from './manager.ts'

// =============================================================================
// Job Dispatcher & Helpers
// =============================================================================

export { clearQueue, dispatch, dispatchByName, queueSize } from './dispatch.ts'

// =============================================================================
// Queue Worker
// =============================================================================

export { QueueWorker } from './worker.ts'
