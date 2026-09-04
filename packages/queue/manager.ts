/**
 * @fileoverview Queue driver manager.
 *
 * Holds the single active driver instance, constructing it lazily from the
 * configured driver name. `getDriver` is internal to the package; only
 * `setQueueDriver` is part of the public surface.
 *
 * @module @lockness/queue/manager
 */

import type { QueueDriver } from './types.ts'
import { getQueueConfig } from './config.ts'
import { MemoryQueueDriver } from './drivers/memory.ts'
import { DenoKvQueueDriver } from './drivers/deno_kv.ts'

let queueDriver: QueueDriver | null = null

export function getDriver(): QueueDriver {
    if (!queueDriver) {
        const config = getQueueConfig()
        switch (config.driver) {
            case 'deno-kv':
                queueDriver = new DenoKvQueueDriver(config.kvPath)
                break
            case 'memory':
            default:
                queueDriver = new MemoryQueueDriver()
                break
        }
    }
    return queueDriver
}

/**
 * Set a custom queue driver
 */
export function setQueueDriver(driver: QueueDriver): void {
    queueDriver = driver
}
