/**
 * @fileoverview Type definitions for @lockness/sse package.
 *
 * Provides all interfaces and types for SSE functionality.
 *
 * @module @lockness/sse/types
 */

// =============================================================================
// Event Types
// =============================================================================

/**
 * SSE Event data structure
 *
 * @example
 * ```typescript
 * const event: SSEEvent = {
 *     event: 'notification',
 *     data: { message: 'Hello!' },
 *     id: '12345',
 *     retry: 5000
 * }
 * ```
 */
export interface SSEEvent {
    /** Event type/name (maps to 'event:' field) */
    readonly event?: string
    /** Event data (maps to 'data:' field) - will be JSON stringified if object */
    readonly data: unknown
    /** Optional event ID (maps to 'id:' field) */
    readonly id?: string
    /** Retry interval in ms (maps to 'retry:' field) */
    readonly retry?: number
}

// =============================================================================
// Client Types
// =============================================================================

/**
 * Connected client information
 *
 * @example
 * ```typescript
 * const client: SSEClient = {
 *     id: 'abc-123',
 *     connectedAt: new Date(),
 *     metadata: { userId: 42, role: 'admin' }
 * }
 * ```
 */
export interface SSEClient {
    /** Unique client ID */
    readonly id: string
    /** Client connection timestamp */
    readonly connectedAt: Date
    /** Custom metadata attached to the client */
    readonly metadata?: Record<string, unknown>
}

/**
 * Internal client entry with controller
 * @internal
 */
export interface ClientEntry {
    /** Stream controller for sending data */
    readonly controller: ReadableStreamDefaultController<Uint8Array>
    /** Client information */
    readonly info: SSEClient
}

// =============================================================================
// Channel Types
// =============================================================================

/**
 * SSE Channel configuration options
 *
 * @example
 * ```typescript
 * const options: SSEChannelOptions = {
 *     heartbeatInterval: 15000,
 *     maxClients: 1000,
 *     headers: { 'X-Custom': 'value' }
 * }
 * ```
 */
export interface SSEChannelOptions {
    /** Heartbeat interval in ms (default: 30000, 0 to disable) */
    readonly heartbeatInterval?: number
    /** Custom headers for SSE response */
    readonly headers?: Record<string, string>
    /** Max clients per channel (default: unlimited) */
    readonly maxClients?: number
}

/**
 * Resolved channel options with all required fields
 */
export interface ResolvedChannelOptions {
    /** Heartbeat interval in ms */
    readonly heartbeatInterval: number
    /** Custom headers for SSE response */
    readonly headers: Record<string, string>
    /** Max clients per channel */
    readonly maxClients: number
}

// =============================================================================
// Handler Types
// =============================================================================

/**
 * Options for SSE handler
 *
 * @example
 * ```typescript
 * const options: SSEHandlerOptions = {
 *     clientId: 'custom-id',
 *     metadata: { userId: 123 },
 *     headers: { 'X-Custom': 'value' },
 *     onConnect: (client) => console.log(`Connected: ${client.id}`),
 *     onDisconnect: (client) => console.log(`Disconnected: ${client.id}`)
 * }
 * ```
 */
export interface SSEHandlerOptions {
    /** Custom client ID (default: crypto.randomUUID()) */
    readonly clientId?: string
    /** Client metadata */
    readonly metadata?: Record<string, unknown>
    /** Additional response headers */
    readonly headers?: Record<string, string>
    /** Callback when client connects */
    readonly onConnect?: (client: SSEClient) => void | Promise<void>
    /** Callback when client disconnects */
    readonly onDisconnect?: (client: SSEClient) => void | Promise<void>
}

/**
 * Stream handler function signature for low-level stream control
 */
export type StreamHandler = (
    controller: ReadableStreamDefaultController<Uint8Array>,
) => Promise<void> | void

// =============================================================================
// Filter Types
// =============================================================================

/**
 * Client filter function for selective broadcasting
 */
export type ClientFilter = (client: SSEClient) => boolean
