/**
 * @fileoverview SSE Channel for managing connected clients.
 *
 * Provides client connection management, heartbeat handling,
 * and message broadcasting for Server-Sent Events.
 *
 * @module @lockness/sse/channel
 */

import {
    deregisterDisposable,
    type DisposableHandle,
    registerDisposable,
} from '@lockness/contract/lifecycle/internal'

import type {
    ClientEntry,
    ClientFilter,
    ResolvedChannelOptions,
    SSEChannelOptions,
    SSEClient,
    SSEEvent,
} from './types.ts'
import { defaultFormatter, type SSEFormatter } from './formatter.ts'

/**
 * Default channel options
 */
const DEFAULT_OPTIONS: ResolvedChannelOptions = {
    heartbeatInterval: 30000,
    headers: {},
    maxClients: Infinity,
}

/**
 * SSE Channel for managing connected clients and broadcasting events
 *
 * Single Responsibility: Manages client connections and message delivery.
 * Does not handle HTTP response creation (see sseHandler).
 *
 * @example
 * ```typescript
 * const channel = new SSEChannel('notifications')
 *
 * // Broadcast to all clients
 * channel.broadcast('alert', { message: 'Hello!' })
 *
 * // Send to specific client
 * channel.send(clientId, 'private', { secret: true })
 *
 * // Get connection stats
 * console.log(`${channel.clientCount} clients connected`)
 * ```
 */
export class SSEChannel {
    /**
     * Withdrawn when the channel closes.
     *
     * **Not optional.** The registry holds a strong reference, and this
     * package's own docs teach a channel per user or per room — a long-lived
     * application creating thousands would grow the registry without bound if a
     * closed channel left its entry behind.
     */
    #handle?: DisposableHandle
    private readonly clients = new Map<string, ClientEntry>()
    private readonly heartbeatIntervals = new Map<
        string,
        ReturnType<typeof setInterval>
    >()
    private readonly encoder = new TextEncoder()
    private readonly formatter: SSEFormatter

    /** Channel name */
    readonly name: string

    /** Resolved channel options */
    readonly options: ResolvedChannelOptions

    /**
     * Create a new SSE channel
     *
     * @param name - Channel name for identification
     * @param options - Channel configuration options
     * @param formatter - Custom event formatter (optional)
     *
     * @example
     * ```typescript
     * // Basic channel
     * const basic = new SSEChannel('updates')
     *
     * // Configured channel
     * const configured = new SSEChannel('live', {
     *     heartbeatInterval: 15000,
     *     maxClients: 500
     * })
     * ```
     */
    constructor(
        name: string,
        options: SSEChannelOptions = {},
        formatter: SSEFormatter = defaultFormatter,
    ) {
        this.name = name
        this.options = { ...DEFAULT_OPTIONS, ...options }
        this.formatter = formatter
    }

    // =========================================================================
    // Client Management
    // =========================================================================

    /**
     * Number of connected clients
     */
    get clientCount(): number {
        return this.clients.size
    }

    /**
     * Get all connected client IDs
     */
    get clientIds(): readonly string[] {
        return Array.from(this.clients.keys())
    }

    /**
     * Check if channel has reached max capacity
     */
    get isFull(): boolean {
        return this.clients.size >= this.options.maxClients
    }

    /**
     * Get client info by ID
     *
     * @param clientId - Client ID to look up
     * @returns Client info or undefined if not found
     */
    getClient(clientId: string): SSEClient | undefined {
        return this.clients.get(clientId)?.info
    }

    /**
     * Check if channel has a specific client
     *
     * @param clientId - Client ID to check
     * @returns True if client exists
     */
    hasClient(clientId: string): boolean {
        return this.clients.has(clientId)
    }

    /**
     * Get all clients matching a filter
     *
     * @param filter - Filter function
     * @returns Array of matching clients
     */
    getClients(filter?: ClientFilter): readonly SSEClient[] {
        const clients = Array.from(this.clients.values()).map((e) => e.info)
        return filter ? clients.filter(filter) : clients
    }

    /**
     * Add a client to the channel
     *
     * @param clientId - Unique client ID
     * @param controller - Stream controller for sending data
     * @param metadata - Optional client metadata
     * @returns True if client was added, false if channel is full
     *
     * @internal This method is for internal use by sseHandler
     */
    addClient(
        clientId: string,
        controller: ReadableStreamDefaultController<Uint8Array>,
        metadata?: Record<string, unknown>,
    ): boolean {
        if (this.isFull) {
            return false
        }

        const clientInfo: SSEClient = {
            id: clientId,
            connectedAt: new Date(),
            metadata,
        }

        this.clients.set(clientId, {
            controller,
            info: clientInfo,
        })

        this.startHeartbeat(clientId)
        return true
    }

    /**
     * Remove a client from the channel
     *
     * @param clientId - Client ID to remove
     *
     * @internal This method is for internal use by sseHandler
     */
    removeClient(clientId: string): void {
        this.stopHeartbeat(clientId)

        const client = this.clients.get(clientId)
        if (client) {
            this.closeController(client.controller)
            this.clients.delete(clientId)
        }
    }

    // =========================================================================
    // Message Sending
    // =========================================================================

    /**
     * Send event to a specific client
     *
     * @param clientId - Target client ID
     * @param event - Event name
     * @param data - Event data
     * @returns True if message was sent
     *
     * @example
     * ```typescript
     * channel.send('client-123', 'private-message', { text: 'Hello!' })
     * ```
     */
    send(clientId: string, event: string, data: unknown): boolean {
        return this.sendEvent(clientId, { event, data })
    }

    /**
     * Send full event object to a specific client
     *
     * @param clientId - Target client ID
     * @param event - Full SSE event object
     * @returns True if message was sent
     */
    sendEvent(clientId: string, event: SSEEvent): boolean {
        const message = this.formatter.format(event)
        return this.sendRaw(clientId, message)
    }

    /**
     * Broadcast event to all connected clients
     *
     * @param event - Event name
     * @param data - Event data
     * @returns Number of clients that received the message
     *
     * @example
     * ```typescript
     * const count = channel.broadcast('update', { version: 2 })
     * console.log(`Sent to ${count} clients`)
     * ```
     */
    broadcast(event: string, data: unknown): number {
        return this.broadcastEvent({ event, data })
    }

    /**
     * Broadcast full event object to all connected clients
     *
     * @param event - Full SSE event object
     * @returns Number of clients that received the message
     */
    broadcastEvent(event: SSEEvent): number {
        const message = this.formatter.format(event)
        return this.broadcastRaw(message)
    }

    /**
     * Broadcast to clients matching a filter
     *
     * @param filter - Function to filter clients
     * @param event - Event name
     * @param data - Event data
     * @returns Number of clients that received the message
     *
     * @example
     * ```typescript
     * // Broadcast only to admin users
     * channel.broadcastTo(
     *     (client) => client.metadata?.role === 'admin',
     *     'admin-alert',
     *     { message: 'System update' }
     * )
     * ```
     */
    broadcastTo(filter: ClientFilter, event: string, data: unknown): number {
        const message = this.formatter.format({ event, data })
        let sent = 0

        for (const [clientId, entry] of this.clients.entries()) {
            if (filter(entry.info) && this.sendRaw(clientId, message)) {
                sent++
            }
        }

        return sent
    }

    // =========================================================================
    // Lifecycle
    // =========================================================================

    /**
     * Close all client connections and cleanup resources
     *
     * @example
     * ```typescript
     * // Graceful shutdown
     * channel.broadcast('shutdown', { reason: 'Server restarting' })
     * channel.close()
     * ```
     */
    close(): void {
        if (this.#handle) {
            deregisterDisposable(this.#handle)
            this.#handle = undefined
        }
        for (const clientId of this.clients.keys()) {
            this.removeClient(clientId)
        }
    }

    // =========================================================================
    // Private Methods
    // =========================================================================

    /**
     * Send raw string to a client
     */
    private sendRaw(clientId: string, message: string): boolean {
        const client = this.clients.get(clientId)
        if (!client) return false

        try {
            client.controller.enqueue(this.encoder.encode(message))
            return true
        } catch {
            // Client disconnected, clean up
            this.removeClient(clientId)
            return false
        }
    }

    /**
     * Broadcast raw string to all clients
     */
    private broadcastRaw(message: string): number {
        let sent = 0
        for (const clientId of this.clients.keys()) {
            if (this.sendRaw(clientId, message)) {
                sent++
            }
        }
        return sent
    }

    /**
     * Start heartbeat for a client
     */
    private startHeartbeat(clientId: string): void {
        if (this.options.heartbeatInterval <= 0) return

        const intervalId = setInterval(() => {
            const heartbeat = this.formatter.formatHeartbeat()
            this.sendRaw(clientId, heartbeat)
        }, this.options.heartbeatInterval)

        this.heartbeatIntervals.set(clientId, intervalId)

        // Announced on the FIRST armed interval, not in the constructor: a
        // channel with `heartbeatInterval: 0` takes the early return above and
        // holds nothing to release.
        //
        // PREDRAIN, and that placement is the whole point. `server.shutdown()`
        // does not resolve while a streaming response is open, and an armed
        // heartbeat is what keeps it open — so a teardown behind the server
        // drain would sit behind the very thing it exists to release, the
        // deadline would expire, and no hook would run at all.
        this.#handle ??= registerDisposable({
            name: `sse:${this.name}`,
            dispose: () => this.close(),
            priority: -100,
        })
    }

    /**
     * Stop heartbeat for a client
     */
    private stopHeartbeat(clientId: string): void {
        const intervalId = this.heartbeatIntervals.get(clientId)
        if (intervalId !== undefined) {
            clearInterval(intervalId)
            this.heartbeatIntervals.delete(clientId)
        }
    }

    /**
     * Safely close a stream controller
     */
    private closeController(
        controller: ReadableStreamDefaultController<Uint8Array>,
    ): void {
        try {
            controller.close()
        } catch {
            // Already closed, ignore
        }
    }
}
