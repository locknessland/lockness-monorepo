/**
 * @lockness/sse - Server-Sent Events for Lockness
 *
 * A comprehensive SSE (Server-Sent Events) implementation for real-time
 * server-to-client communication. Provides channel management, client
 * tracking, message broadcasting, and automatic heartbeat handling.
 *
 * @example Basic Usage
 * ```typescript
 * import { SSEChannel, sseHandler } from '@lockness/sse'
 *
 * // Create a channel
 * const notifications = new SSEChannel('notifications')
 *
 * // In your controller
 * @Get('/events/notifications')
 * stream() {
 *     return sseHandler(notifications)
 * }
 *
 * // Broadcast to all connected clients
 * notifications.broadcast('new-message', { text: 'Hello!' })
 * ```
 *
 * @example Channel Manager
 * ```typescript
 * import { ChannelManager } from '@lockness/sse'
 *
 * const manager = new ChannelManager()
 * const channel = manager.getOrCreate('room-123')
 *
 * // Broadcast to all channels
 * manager.broadcastAll('system', { message: 'Maintenance in 10 minutes' })
 * ```
 *
 * @example Custom Stream
 * ```typescript
 * import { createSSEStream, createCustomSSEHandler } from '@lockness/sse'
 *
 * // Full control with custom handler
 * return createCustomSSEHandler(async ({ send, close }) => {
 *     for (let i = 0; i < 10; i++) {
 *         await send('count', { value: i })
 *         await delay(1000)
 *     }
 *     close()
 * })
 * ```
 *
 * @module @lockness/sse
 */

// =============================================================================
// Type Exports
// =============================================================================

export type {
    ClientFilter,
    ResolvedChannelOptions,
    SSEChannelOptions,
    SSEClient,
    SSEEvent,
    SSEHandlerOptions,
    StreamHandler,
} from './types.ts'

// =============================================================================
// Class Exports
// =============================================================================

export { SSEChannel } from './channel.ts'
export { ChannelManager } from './manager.ts'
export type { ChannelManagerStats, ChannelStats } from './manager.ts'
export { defaultFormatter, SSEFormatter } from './formatter.ts'

// =============================================================================
// Function Exports
// =============================================================================

export {
    createCustomSSEHandler,
    createSSEStream,
    sseHandler,
} from './handler.ts'
export type { SSEStreamHelpers } from './handler.ts'
