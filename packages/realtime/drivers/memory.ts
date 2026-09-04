/**
 * @fileoverview The in-process broadcast driver — single-process fan-out.
 *
 * `publish` loops the message straight back to the registered `onMessage`
 * handler in the same process; there is no cross-process transport. This is the
 * default and the MVP presence transport (single-process authoritative).
 *
 * @module @lockness/realtime/drivers/memory
 */

import type { BroadcastDriver, BroadcastMessage } from '../driver.ts'

/**
 * A single-process broadcast driver.
 *
 * @example
 * ```ts
 * const manager = new ChannelManager({ driver: new MemoryBroadcastDriver() })
 * ```
 */
export class MemoryBroadcastDriver implements BroadcastDriver {
    private handler?: (message: BroadcastMessage) => void

    /**
     * Loop a message back to the local handler.
     *
     * @param message - The message to broadcast.
     */
    publish(message: BroadcastMessage): void {
        this.handler?.(message)
    }

    /**
     * Register the local delivery handler.
     *
     * @param handler - Called with each published message.
     */
    onMessage(handler: (message: BroadcastMessage) => void): void {
        this.handler = handler
    }
}
