/**
 * @fileoverview Process-global queue configuration.
 *
 * Holds the single mutable `globalQueueConfig` (kept here and nowhere else so
 * there is exactly one configuration) and the accessors every other module
 * reads it through.
 *
 * @module @lockness/queue/config
 */

import type { QueueConfig } from './types.ts'

const defaultConfig: QueueConfig = {
    driver: 'memory',
    defaultQueue: 'default',
    retryDelay: 3000,
}

let globalQueueConfig: QueueConfig = { ...defaultConfig }

export function configureQueue(config: Partial<QueueConfig>): void {
    globalQueueConfig = { ...globalQueueConfig, ...config }
}

export function getQueueConfig(): QueueConfig {
    return globalQueueConfig
}
