/**
 * @fileoverview SSE stream creation and HTTP handler.
 *
 * Provides utilities for creating SSE streams and handling
 * HTTP requests for Server-Sent Events endpoints.
 *
 * @module @lockness/sse/handler
 */

import type { SSEHandlerOptions, StreamHandler } from './types.ts'
import type { SSEChannel } from './channel.ts'

/**
 * Default SSE response headers
 */
const SSE_HEADERS: Record<string, string> = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable nginx buffering
}

/**
 * Create an SSE stream as a Response object
 *
 * Low-level utility for creating custom SSE endpoints.
 * For most use cases, prefer `sseHandler` instead.
 *
 * Single Responsibility: Stream creation only.
 * Does not manage channels or clients.
 *
 * @param handler - Async function that receives the stream controller
 * @param headers - Additional headers to include
 * @returns HTTP Response with SSE stream
 *
 * @example
 * ```typescript
 * // Simple countdown timer
 * const response = createSSEStream(async (controller) => {
 *     const encoder = new TextEncoder()
 *
 *     for (let i = 10; i >= 0; i--) {
 *         controller.enqueue(encoder.encode(`data: ${i}\n\n`))
 *         await new Promise(r => setTimeout(r, 1000))
 *     }
 *
 *     controller.close()
 * })
 * ```
 */
export function createSSEStream(
    handler: StreamHandler,
    headers: Record<string, string> = {},
): Response {
    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            try {
                await handler(controller)
            } catch (error) {
                console.error('[SSE] Stream error:', error)
                try {
                    controller.close()
                } catch {
                    // Already closed
                }
            }
        },
    })

    return new Response(stream, {
        headers: { ...SSE_HEADERS, ...headers },
    })
}

/**
 * Create an SSE handler for a channel
 *
 * Handles HTTP request/response, client ID generation, and connection lifecycle.
 * Integrates with SSEChannel for client management.
 *
 * @param channel - The SSE channel to connect clients to
 * @param options - Handler options
 * @returns HTTP Response with SSE stream
 *
 * @example
 * ```typescript
 * // Basic usage
 * const channel = new SSEChannel('notifications')
 *
 * app.get('/events', (ctx) => {
 *     return sseHandler(channel)
 * })
 * ```
 *
 * @example
 * ```typescript
 * // With authentication and metadata
 * app.get('/events', (ctx) => {
 *     const userId = ctx.get('userId')
 *
 *     return sseHandler(channel, {
 *         clientId: `user-${userId}`,
 *         metadata: { userId, role: 'admin' },
 *         onConnect: (client) => {
 *             console.log(`Client ${client.id} connected`)
 *         },
 *         onDisconnect: (client) => {
 *             console.log(`Client ${client.id} disconnected`)
 *         }
 *     })
 * })
 * ```
 *
 * @example
 * ```typescript
 * // Send initial data on connect
 * app.get('/events', async (ctx) => {
 *     return sseHandler(channel, {
 *         onConnect: async (client) => {
 *             // Fetch and send initial state
 *             const initialData = await fetchInitialState()
 *             channel.send(client.id, 'init', initialData)
 *         }
 *     })
 * })
 * ```
 */
export function sseHandler(
    channel: SSEChannel,
    options: SSEHandlerOptions = {},
): Response {
    const {
        clientId = generateClientId(),
        metadata,
        headers = {},
        onConnect,
        onDisconnect,
    } = options

    // Check capacity
    if (channel.isFull) {
        return new Response('Channel at capacity', {
            status: 503,
            headers: { 'Retry-After': '30' },
        })
    }

    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            // Add client to channel
            const added = channel.addClient(clientId, controller, metadata)
            if (!added) {
                controller.close()
                return
            }

            // Call connect callback
            const clientInfo = channel.getClient(clientId)
            if (clientInfo && onConnect) {
                Promise.resolve(onConnect(clientInfo)).catch((err) => {
                    console.error('[SSE] onConnect error:', err)
                })
            }
        },
        cancel() {
            // Get client info before removal for callback
            const clientInfo = channel.getClient(clientId)

            // Remove client from channel
            channel.removeClient(clientId)

            // Call disconnect callback
            if (clientInfo && onDisconnect) {
                Promise.resolve(onDisconnect(clientInfo)).catch((err) => {
                    console.error('[SSE] onDisconnect error:', err)
                })
            }
        },
    })

    return new Response(stream, {
        headers: { ...SSE_HEADERS, ...channel.options.headers, ...headers },
    })
}

// =============================================================================
// Utilities
// =============================================================================

/**
 * Generate a unique client ID
 *
 * Uses crypto.randomUUID for guaranteed uniqueness.
 *
 * @returns Unique client ID
 */
function generateClientId(): string {
    return crypto.randomUUID()
}

/**
 * Create an SSE handler with custom logic (no channel)
 *
 * For advanced use cases where you need full control over the stream.
 *
 * @param handler - Function to handle the stream
 * @param options - Response options
 * @returns HTTP Response with SSE stream
 *
 * @example
 * ```typescript
 * // Custom streaming endpoint
 * app.get('/stream', (ctx) => {
 *     return createCustomSSEHandler(async ({ send, close }) => {
 *         for (let i = 0; i < 10; i++) {
 *             await send('count', { value: i })
 *             await new Promise(r => setTimeout(r, 1000))
 *         }
 *         close()
 *     })
 * })
 * ```
 */
export function createCustomSSEHandler(
    handler: (helpers: SSEStreamHelpers) => Promise<void>,
    options: { headers?: Record<string, string> } = {},
): Response {
    const encoder = new TextEncoder()

    return createSSEStream(async (controller) => {
        const helpers: SSEStreamHelpers = {
            send: (event: string, data: unknown, id?: string) => {
                let message = ''
                if (id) message += `id: ${id}\n`
                message += `event: ${event}\n`
                message += `data: ${JSON.stringify(data)}\n\n`
                controller.enqueue(encoder.encode(message))
                return Promise.resolve()
            },
            sendRaw: (message: string) => {
                controller.enqueue(encoder.encode(message))
                return Promise.resolve()
            },
            close: () => {
                controller.close()
            },
        }

        await handler(helpers)
    }, options.headers)
}

/**
 * Helper functions for custom SSE handlers
 */
export interface SSEStreamHelpers {
    /**
     * Send an event with data
     *
     * @param event - Event name
     * @param data - Event data (will be JSON serialized)
     * @param id - Optional event ID
     */
    send: (event: string, data: unknown, id?: string) => Promise<void>

    /**
     * Send a raw SSE message
     *
     * @param message - Raw SSE-formatted message
     */
    sendRaw: (message: string) => Promise<void>

    /**
     * Close the stream
     */
    close: () => void
}
