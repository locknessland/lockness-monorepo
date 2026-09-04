/**
 * @fileoverview `ChannelManager` — the broadcaster: subscribe/unsubscribe with
 * authorization, channel fan-out over a driver, presence, eviction, and the
 * per-client `send` that satisfies `@lockness/notification`'s `BroadcasterLike`.
 *
 * The subscription set for a channel holds **only authorized** connections
 * (subscribe gates it), so both local and Redis-received delivery fan out only
 * to authorized subscribers on this instance (security S1/S6). Per-client
 * `send(clientId,…)` is a targeted send, never a fan-to-all.
 *
 * @module @lockness/realtime/manager
 */

import type { Connection, WebSocketHooks } from './types.ts'
import type { BroadcastDriver, BroadcastMessage } from './driver.ts'
import { MemoryBroadcastDriver } from './drivers/memory.ts'
import {
    type Authorizer,
    type AuthorizeResult,
    channelKind,
    type PresenceMember,
} from './channel.ts'
import type { ServerMessage } from './protocol.ts'

/**
 * A frame the manager sends to a connection — the `event`/`presence` subset of
 * the wire protocol's {@link ServerMessage} (one shape, not a second copy).
 */
export type OutboundFrame = Extract<
    ServerMessage,
    { type: 'event' } | { type: 'presence' }
>

/** The outcome of a subscribe attempt. */
export interface SubscribeResult {
    /** Whether the subscription was authorized. */
    ok: boolean
    /** For an authorized presence channel: the current member list ("here"). */
    members?: PresenceMember[]
}

/** Options for a {@link ChannelManager}. */
export interface ChannelManagerOptions<Identity = unknown> {
    /** The broadcast driver (defaults to in-process memory). */
    driver?: BroadcastDriver
    /** The app authorizer for private/presence channels. */
    authorize?: Authorizer<Identity>
    /** Frame encoder (defaults to JSON; `#213`'s protocol codec replaces it). */
    encode?: (frame: OutboundFrame) => string
    /** Sink for a failed cross-process publish (defaults to `console.error`). */
    onPublishError?: (error: unknown) => void
}

/**
 * The channel manager / broadcaster.
 *
 * @typeParam Identity - The app's connection-identity shape.
 *
 * @example
 * ```ts
 * const manager = new ChannelManager({ authorize: (id, ch) => id != null })
 * await manager.subscribe(conn, 'private-orders')
 * manager.broadcast('private-orders', 'created', { id: 1 })
 * ```
 */
export class ChannelManager<Identity = unknown> {
    private readonly driver: BroadcastDriver
    private readonly authorize?: Authorizer<Identity>
    private readonly encode: (frame: OutboundFrame) => string
    private readonly onPublishError: (error: unknown) => void
    private readonly connections = new Map<string, Connection<Identity>>()
    private readonly subscriptions = new Map<string, Set<string>>()
    private readonly presence = new Map<
        string,
        Map<string, PresenceMember>
    >()

    /**
     * @param options - The driver, authorizer, and encoder.
     */
    constructor(options: ChannelManagerOptions<Identity> = {}) {
        this.driver = options.driver ?? new MemoryBroadcastDriver()
        this.authorize = options.authorize
        this.encode = options.encode ?? ((frame) => JSON.stringify(frame))
        this.onPublishError = options.onPublishError ??
            ((error) =>
                console.error('realtime: broadcast publish failed', error))
        // Local + cross-process delivery share this one path.
        this.driver.onMessage((message) => this.deliverLocal(message))
    }

    /**
     * Compose lifecycle hooks that register the connection on open and
     * disconnect it on close — the framework-owned teardown seam, so a forgotten
     * app wire cannot leave ghost presence members or dead-socket references.
     *
     * @param userHooks - The app's own hooks (run alongside the teardown).
     * @returns Hooks to pass to `createWebSocketHandler`.
     *
     * @example
     * ```ts
     * createWebSocketHandler({ hooks: manager.handlerHooks({ onMessage }) })
     * ```
     */
    handlerHooks(
        userHooks: WebSocketHooks<Identity> = {},
    ): WebSocketHooks<Identity> {
        return {
            onOpen: (conn) => {
                this.register(conn)
                return userHooks.onOpen?.(conn)
            },
            onMessage: userHooks.onMessage,
            onError: userHooks.onError,
            onClose: async (conn, code, reason) => {
                await userHooks.onClose?.(conn, code, reason)
                this.disconnect(conn.id)
            },
        }
    }

    /**
     * Register a live connection (call from the handler's `onOpen`).
     *
     * @param connection - The connection to track.
     */
    register(connection: Connection<Identity>): void {
        this.connections.set(connection.id, connection)
    }

    /** The count of tracked connections. */
    get connectionCount(): number {
        return this.connections.size
    }

    /**
     * Subscribe a connection to a channel, enforcing authorization for
     * private/presence channels.
     *
     * @param connection - The subscribing connection.
     * @param channel - The channel name.
     * @returns Whether it was authorized, plus the presence roster when relevant.
     */
    async subscribe(
        connection: Connection<Identity>,
        channel: string,
    ): Promise<SubscribeResult> {
        const kind = channelKind(channel)

        let member: PresenceMember | undefined
        if (kind !== 'public') {
            // A private/presence channel needs a verified identity (S1) and the
            // app's approval — before any event is ever delivered.
            if (connection.identity === null) return { ok: false }
            const result: AuthorizeResult = this.authorize
                ? await this.authorize(connection.identity, channel)
                : false
            if (result === false) return { ok: false }
            if (kind === 'presence') {
                member = result === true ? { id: connection.id } : result
            }
        }

        this.connections.set(connection.id, connection)
        let set = this.subscriptions.get(channel)
        if (!set) this.subscriptions.set(channel, set = new Set())
        set.add(connection.id)

        if (kind === 'presence' && member) {
            let members = this.presence.get(channel)
            if (!members) this.presence.set(channel, members = new Map())
            // Notify existing members of the join before adding the newcomer.
            this.emitPresence(channel, {
                type: 'presence',
                channel,
                action: 'joined',
                member,
            })
            members.set(connection.id, member)
            return { ok: true, members: [...members.values()] }
        }

        return { ok: true }
    }

    /**
     * Unsubscribe a connection from a channel (eviction primitive, S7).
     *
     * @param clientId - The connection id.
     * @param channel - The channel to leave.
     */
    unsubscribe(clientId: string, channel: string): void {
        this.subscriptions.get(channel)?.delete(clientId)
        const members = this.presence.get(channel)
        const member = members?.get(clientId)
        if (members && member) {
            members.delete(clientId)
            this.emitPresence(channel, {
                type: 'presence',
                channel,
                action: 'left',
                member,
            })
        }
    }

    /**
     * Disconnect a connection entirely — unsubscribe it from every channel
     * (emitting presence leaves) and forget it (eviction primitive, S7).
     *
     * @param clientId - The connection id.
     */
    disconnect(clientId: string): void {
        for (const channel of [...this.subscriptions.keys()]) {
            this.unsubscribe(clientId, channel)
        }
        this.connections.delete(clientId)
    }

    /**
     * Broadcast an event to a channel (fanned to authorized subscribers on
     * every instance via the driver).
     *
     * @param channel - The channel name.
     * @param event - The event name.
     * @param data - The payload.
     */
    broadcast(channel: string, event: string, data: unknown): void {
        try {
            const result = this.driver.publish({ channel, event, data })
            if (result instanceof Promise) result.catch(this.onPublishError)
        } catch (error) {
            this.onPublishError(error)
        }
    }

    /**
     * Send an event directly to one connection — satisfies
     * `@lockness/notification`'s `BroadcasterLike`. Per-client, never fan-to-all.
     *
     * @param clientId - The target connection id.
     * @param event - The event name.
     * @param data - The payload.
     * @returns Whether a live connection received it.
     */
    send(clientId: string, event: string, data: unknown): boolean {
        const connection = this.connections.get(clientId)
        if (!connection) return false
        connection.send(this.encode({ type: 'event', event, data }))
        return true
    }

    /** Deliver a received message to this instance's authorized subscribers. */
    private deliverLocal(message: BroadcastMessage): void {
        const set = this.subscriptions.get(message.channel)
        if (!set) return
        const frame = this.encode({
            type: 'event',
            channel: message.channel,
            event: message.event,
            data: message.data,
        })
        for (const clientId of set) {
            this.connections.get(clientId)?.send(frame)
        }
    }

    /** Emit a presence frame to the channel's current members. */
    private emitPresence(channel: string, frame: OutboundFrame): void {
        const members = this.presence.get(channel)
        if (!members) return
        const encoded = this.encode(frame)
        for (const clientId of members.keys()) {
            this.connections.get(clientId)?.send(encoded)
        }
    }
}
