/**
 * @fileoverview Channel manager for multiple SSE channels.
 *
 * Provides centralized management of SSE channels with
 * automatic channel creation, retrieval, and cleanup.
 *
 * @module @lockness/sse/manager
 */

import type { SSEChannelOptions } from './types.ts'
import { SSEChannel } from './channel.ts'

/**
 * Manages multiple SSE channels
 *
 * Single Responsibility: Centralized channel registry and lifecycle management.
 * Does not handle individual client connections (delegated to SSEChannel).
 *
 * @example
 * ```typescript
 * const manager = new ChannelManager()
 *
 * // Get or create channels
 * const notifications = manager.getOrCreate('notifications')
 * const chat = manager.getOrCreate('chat', { heartbeatInterval: 15000 })
 *
 * // Broadcast to specific channel
 * notifications.broadcast('alert', { message: 'Hello!' })
 *
 * // Get stats
 * console.log(`Total clients: ${manager.totalClients}`)
 *
 * // Cleanup
 * manager.removeEmpty()
 * ```
 */
export class ChannelManager {
    private readonly channels = new Map<string, SSEChannel>()
    private readonly defaultOptions: SSEChannelOptions

    /**
     * Create a new channel manager
     *
     * @param defaultOptions - Default options for new channels
     *
     * @example
     * ```typescript
     * // With default options
     * const manager = new ChannelManager({
     *     heartbeatInterval: 20000,
     *     maxClients: 1000
     * })
     * ```
     */
    constructor(defaultOptions: SSEChannelOptions = {}) {
        this.defaultOptions = defaultOptions
    }

    // =========================================================================
    // Channel Access
    // =========================================================================

    /**
     * Number of managed channels
     */
    get channelCount(): number {
        return this.channels.size
    }

    /**
     * Total clients across all channels
     */
    get totalClients(): number {
        let total = 0
        for (const channel of this.channels.values()) {
            total += channel.clientCount
        }
        return total
    }

    /**
     * Get all channel names
     */
    get channelNames(): readonly string[] {
        return Array.from(this.channels.keys())
    }

    /**
     * Get an existing channel by name
     *
     * @param name - Channel name
     * @returns Channel or undefined if not found
     *
     * @example
     * ```typescript
     * const channel = manager.get('notifications')
     * if (channel) {
     *     channel.broadcast('update', data)
     * }
     * ```
     */
    get(name: string): SSEChannel | undefined {
        return this.channels.get(name)
    }

    /**
     * Get a channel, creating it if it doesn't exist
     *
     * @param name - Channel name
     * @param options - Options to use if creating (merged with defaults)
     * @returns The channel
     *
     * @example
     * ```typescript
     * const channel = manager.getOrCreate('room-123', {
     *     maxClients: 50
     * })
     * ```
     */
    getOrCreate(name: string, options?: SSEChannelOptions): SSEChannel {
        let channel = this.channels.get(name)

        if (!channel) {
            channel = new SSEChannel(name, {
                ...this.defaultOptions,
                ...options,
            })
            this.channels.set(name, channel)
        }

        return channel
    }

    /**
     * Check if a channel exists
     *
     * @param name - Channel name
     * @returns True if channel exists
     */
    has(name: string): boolean {
        return this.channels.has(name)
    }

    // =========================================================================
    // Channel Management
    // =========================================================================

    /**
     * Create a new channel (fails if already exists)
     *
     * @param name - Channel name
     * @param options - Channel options
     * @returns The created channel
     * @throws Error if channel already exists
     *
     * @example
     * ```typescript
     * try {
     *     const channel = manager.create('unique-channel')
     * } catch (error) {
     *     console.error('Channel already exists')
     * }
     * ```
     */
    create(name: string, options?: SSEChannelOptions): SSEChannel {
        if (this.channels.has(name)) {
            throw new Error(`Channel "${name}" already exists`)
        }

        const channel = new SSEChannel(name, {
            ...this.defaultOptions,
            ...options,
        })
        this.channels.set(name, channel)
        return channel
    }

    /**
     * Remove a channel by name
     *
     * This will close all client connections in the channel.
     *
     * @param name - Channel name
     * @returns True if channel was removed
     *
     * @example
     * ```typescript
     * // Graceful removal
     * const channel = manager.get('temp-channel')
     * if (channel) {
     *     channel.broadcast('closing', { reason: 'Channel removed' })
     * }
     * manager.remove('temp-channel')
     * ```
     */
    remove(name: string): boolean {
        const channel = this.channels.get(name)
        if (!channel) return false

        channel.close()
        return this.channels.delete(name)
    }

    /**
     * Remove all empty channels (no connected clients)
     *
     * Useful for periodic cleanup.
     *
     * @returns Number of channels removed
     *
     * @example
     * ```typescript
     * // Periodic cleanup
     * setInterval(() => {
     *     const removed = manager.removeEmpty()
     *     console.log(`Cleaned up ${removed} empty channels`)
     * }, 60000)
     * ```
     */
    removeEmpty(): number {
        let removed = 0

        for (const [name, channel] of this.channels.entries()) {
            if (channel.clientCount === 0) {
                channel.close()
                this.channels.delete(name)
                removed++
            }
        }

        return removed
    }

    // =========================================================================
    // Broadcasting
    // =========================================================================

    /**
     * Broadcast event to all channels
     *
     * @param event - Event name
     * @param data - Event data
     * @returns Total number of clients that received the message
     *
     * @example
     * ```typescript
     * // System-wide announcement
     * const count = manager.broadcastAll('system', {
     *     message: 'Scheduled maintenance in 10 minutes'
     * })
     * console.log(`Notified ${count} clients`)
     * ```
     */
    broadcastAll(event: string, data: unknown): number {
        let total = 0
        for (const channel of this.channels.values()) {
            total += channel.broadcast(event, data)
        }
        return total
    }

    // =========================================================================
    // Lifecycle
    // =========================================================================

    /**
     * Close all channels and release resources
     *
     * @example
     * ```typescript
     * // Graceful shutdown
     * manager.broadcastAll('shutdown', { reason: 'Server restarting' })
     * manager.closeAll()
     * ```
     */
    closeAll(): void {
        for (const channel of this.channels.values()) {
            channel.close()
        }
        this.channels.clear()
    }

    /**
     * Get statistics about all channels
     *
     * @returns Channel statistics
     *
     * @example
     * ```typescript
     * const stats = manager.getStats()
     * console.log(stats)
     * // { channels: 5, totalClients: 150, channelStats: [...] }
     * ```
     */
    getStats(): ChannelManagerStats {
        const channelStats: ChannelStats[] = []

        for (const [name, channel] of this.channels.entries()) {
            channelStats.push({
                name,
                clientCount: channel.clientCount,
                isFull: channel.isFull,
            })
        }

        return {
            channels: this.channels.size,
            totalClients: this.totalClients,
            channelStats,
        }
    }
}

// =============================================================================
// Types
// =============================================================================

/**
 * Statistics for a single channel
 */
export interface ChannelStats {
    /** Channel name */
    name: string
    /** Number of connected clients */
    clientCount: number
    /** Whether channel is at max capacity */
    isFull: boolean
}

/**
 * Overall manager statistics
 */
export interface ChannelManagerStats {
    /** Total number of channels */
    channels: number
    /** Total clients across all channels */
    totalClients: number
    /** Per-channel statistics */
    channelStats: ChannelStats[]
}
