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
import type {
    BroadcastDriver,
    BroadcastMessage,
    ControlMessage,
    PresenceCapableDriver,
} from './driver.ts'
import { MemoryBroadcastDriver } from './drivers/memory.ts'
import {
    type Authorizer,
    type AuthorizeResult,
    channelKind,
    type PresenceMember,
} from './channel.ts'
import type { ServerMessage } from './protocol.ts'

/**
 * The single feature-detect guard for a driver's optional presence-state ops
 * (A5). The roster-aware methods route through this **one** helper rather than
 * repeating `if (driver.addMember)` per call site: a driver either owns the
 * authoritative roster (all three ops present) or it does not, and this narrows
 * once to {@link PresenceCapableDriver} accordingly.
 *
 * @param driver - The broadcast driver to probe.
 * @returns The driver narrowed to {@link PresenceCapableDriver} when it exposes
 *   the full presence-state surface, otherwise `undefined` (single-process
 *   driver — the manager keeps its in-process roster).
 *
 * @example
 * ```ts
 * const roster = presenceRoster(driver)
 * if (roster) await roster.addMember(channel, member)
 * ```
 */
export function presenceRoster(
    driver: BroadcastDriver,
): PresenceCapableDriver | undefined {
    return typeof driver.addMember === 'function' &&
            typeof driver.removeMember === 'function' &&
            typeof driver.listMembers === 'function'
        ? driver as PresenceCapableDriver
        : undefined
}

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
    /**
     * The **local** presence members this instance's sockets own, per channel
     * (`clientId → member`). NOT the authoritative roster (that is the driver,
     * possibly remote — decision-table §5): this map only records what THIS
     * instance added, so `unsubscribe`/`disconnect` know which member to remove
     * from the driver roster and to announce as `left`.
     */
    private readonly presence = new Map<
        string,
        Map<string, PresenceMember>
    >()
    /** The driver's roster ops when it owns the authoritative roster (else `undefined`). */
    private readonly roster: PresenceCapableDriver | undefined

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
        this.roster = presenceRoster(this.driver)
        // Local + cross-process delivery share this one path.
        this.driver.onMessage((message) => this.deliverLocal(message))
        // A cross-process driver's control plane is a DISTINCT seam (A2/FR-016):
        // control frames drive roster/eviction consequences, never event fan-out.
        this.driver.onControl?.((control) => this.handleControl(control))
        // The durable revocation re-check (S1/FR-014): on every reconcile pass
        // the owning instance recovers an evict whose control frame was lost.
        this.driver.onRevocationReconcile?.(() => this.reconcileRevocations())
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
                await this.disconnect(conn.id)
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

        if (kind === 'presence' && member) {
            // Notify existing LOCAL subscribers of the join BEFORE adding the
            // newcomer to the set, so the newcomer gets the roster (below) but
            // not a `joined` for itself (A5 — emitPresence fans to the local set).
            this.emitPresence(channel, {
                type: 'presence',
                channel,
                action: 'joined',
                member,
            })
            set.add(connection.id)
            // Track it as a local member so a later leave knows what to remove.
            let members = this.presence.get(channel)
            if (!members) this.presence.set(channel, members = new Map())
            members.set(connection.id, member)
            // The authoritative roster is the driver's (FR-005/FR-006): store the
            // member there and announce the join to presence subscribers on every
            // OTHER instance via the control plane (this instance already emitted
            // locally above; the driver drops its own control loopback).
            if (this.roster) await this.roster.addMember(channel, member)
            await this.publishControl({
                kind: 'presence-join',
                target: connection.id,
                channel,
                member,
            })
            return { ok: true, members: await this.rosterSnapshot(channel) }
        }

        set.add(connection.id)
        return { ok: true }
    }

    /**
     * The authoritative "here" roster for a presence channel — the driver's when
     * it owns one (every instance's members, FR-006), otherwise this instance's
     * local members (a driver with no roster capability is single-process).
     */
    private async rosterSnapshot(channel: string): Promise<PresenceMember[]> {
        if (this.roster) return [...await this.roster.listMembers(channel)]
        return [...(this.presence.get(channel)?.values() ?? [])]
    }

    /**
     * Publish a control message to other instances when the driver exposes the
     * control plane; a single-process driver (no `publishControl`) has none, and
     * relies on the manager's direct local `emitPresence` instead.
     */
    private async publishControl(control: ControlMessage): Promise<void> {
        await this.driver.publishControl?.(control)
    }

    /**
     * Unsubscribe a connection from a channel (eviction primitive, S7).
     *
     * `async` because a presence leave now removes the member from the driver's
     * authoritative roster, which for the Redis driver is a round-trip (FR-017).
     * The `left` frame reaches this instance's local presence subscribers, and
     * the same leave is announced cross-instance over the control plane (US4) so
     * presence subscribers on every OTHER instance emit their own local `left`.
     *
     * @param clientId - The connection id.
     * @param channel - The channel to leave.
     * @returns Resolves once the roster removal and `left` announcement have run.
     */
    async unsubscribe(clientId: string, channel: string): Promise<void> {
        this.subscriptions.get(channel)?.delete(clientId)
        const members = this.presence.get(channel)
        const member = members?.get(clientId)
        if (members && member) {
            members.delete(clientId)
            // Remove from the authoritative roster before announcing the leave.
            if (this.roster) await this.roster.removeMember(channel, member.id)
            this.emitPresence(channel, {
                type: 'presence',
                channel,
                action: 'left',
                member,
            })
            // Announce the leave to presence subscribers on every OTHER instance
            // (US4/T030) — the driver drops this instance's own control loopback.
            await this.publishControl({
                kind: 'presence-leave',
                target: clientId,
                channel,
                member,
            })
        }
    }

    /**
     * Disconnect a connection entirely — unsubscribe it from every channel
     * (emitting presence leaves) and forget it (eviction primitive, S7).
     *
     * `async` (FR-017): it awaits each channel's roster removal so a caller — the
     * handler's `onClose` — can await teardown before the socket is gone.
     *
     * @param clientId - The connection id.
     * @returns Resolves once every channel leave has been applied.
     */
    async disconnect(clientId: string): Promise<void> {
        for (const channel of [...this.subscriptions.keys()]) {
            await this.unsubscribe(clientId, channel)
        }
        this.connections.delete(clientId)
    }

    /**
     * Server-only eviction of a connection (FR-009, S7). Revokes the connection
     * wherever its socket lives: the durable marker is recorded first (FR-014,
     * so a lost control frame is recovered on reconnect/reconcile), then — if
     * this instance owns the socket — it is revoked locally; otherwise an
     * authenticated `evict` control message is published so the owning instance
     * revokes it. Per Q2 a revocation-driven evict **hard-closes** the socket,
     * unlike a plain channel leave ({@link unsubscribe}).
     *
     * This is NOT reachable from a client frame — `decodeClientMessage`'s
     * allowlist is unchanged (deny-by-default). It is called by server code (an
     * admin action, a revoked-token hook).
     *
     * @param clientId - The connection id to evict.
     * @returns Resolves once the durable marker is set and the revocation has
     *   been applied locally or published to the owning instance.
     * @example
     * ```ts
     * // A revoked token: kick the connection off every instance.
     * await manager.evict(connectionId)
     * ```
     */
    async evict(clientId: string): Promise<void> {
        // Durable first (S1/FR-014): even if the control frame is lost, the
        // owning instance recovers the evict on its next reconcile.
        await this.driver.markRevoked?.(clientId)
        if (this.connections.has(clientId)) {
            await this.revokeLocal(clientId)
            return
        }
        // The socket lives on another instance — reach it over the control plane.
        await this.publishControl({ kind: 'evict', target: clientId })
    }

    /**
     * Revoke a connection this instance owns: hard-close its socket (Q2 — a
     * revocation-driven evict, not a plain leave) then disconnect it from every
     * channel, which removes it from the authoritative roster and announces the
     * `left` on every instance. A failure to tear down is logged at WARN, never
     * swallowed — the socket is closed regardless.
     *
     * @param clientId - The owned connection id to revoke.
     */
    private async revokeLocal(clientId: string): Promise<void> {
        // Hard-close first so delivery stops immediately, even before the async
        // roster teardown settles (Q2 — safe even if `authorize()` lags).
        this.connections.get(clientId)?.close(4403, 'evicted')
        try {
            await this.disconnect(clientId)
        } catch (error) {
            console.warn(
                `realtime: evict teardown for ${clientId} failed after ` +
                    `hard-close: ${
                        error instanceof Error ? error.message : String(error)
                    }`,
            )
        }
    }

    /**
     * The durable revocation re-check (S1/FR-014), invoked by the driver on each
     * periodic reconcile pass. Any revoked id whose socket this instance owns is
     * revoked here — recovering an evict whose one-shot control frame was lost
     * while the owning socket was between reconnects.
     */
    private async reconcileRevocations(): Promise<void> {
        const revoked = await this.driver.listRevoked?.() ?? []
        for (const clientId of revoked) {
            if (this.connections.has(clientId)) await this.revokeLocal(clientId)
        }
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

    /**
     * Emit a presence frame to this instance's LOCAL presence subscribers (A5).
     *
     * Fans to `subscriptions.get(channel)` — the connections THIS instance holds
     * — never to the driver roster, which now holds remote members this instance
     * cannot reach. Cross-instance presence is carried by the control plane
     * ({@link handleControl}), not by iterating a roster of unreachable sockets.
     */
    private emitPresence(channel: string, frame: OutboundFrame): void {
        const set = this.subscriptions.get(channel)
        if (!set) return
        const encoded = this.encode(frame)
        for (const clientId of set) {
            this.connections.get(clientId)?.send(encoded)
        }
    }

    /**
     * Act on a control message received off the bus (already authenticated and
     * name-validated by the driver, A2/FR-015/FR-016). Dispatched by kind — a
     * control frame drives a roster/eviction consequence, never event fan-out:
     *
     * - `presence-join` / `presence-leave`: emit the `joined` / `left` frame to
     *   THIS instance's local presence subscribers, so a member joining/leaving
     *   on another instance is seen here (US2).
     * - `evict`: the owning instance revokes the target socket (hard-close +
     *   roster/`left`, Q2); an instance that does not own it is a no-op here —
     *   the owning instance's teardown fans the `left` to it via `presence-leave`
     *   (FR-009). The durable marker (FR-014) is the backstop for a lost frame.
     */
    private handleControl(control: ControlMessage): void {
        switch (control.kind) {
            case 'presence-join':
                if (control.channel && control.member) {
                    this.emitPresence(control.channel, {
                        type: 'presence',
                        channel: control.channel,
                        action: 'joined',
                        member: control.member,
                    })
                }
                return
            case 'presence-leave':
                if (control.channel && control.member) {
                    this.emitPresence(control.channel, {
                        type: 'presence',
                        channel: control.channel,
                        action: 'left',
                        member: control.member,
                    })
                }
                return
            case 'evict':
                // Only the instance that owns the socket revokes it; every other
                // instance leaves it to the owner (which fans the `left` here via
                // a `presence-leave`). The revoke is async; its awaits settle in
                // microtasks, and it logs on failure — never a silent catch.
                if (this.connections.has(control.target)) {
                    void this.revokeLocal(control.target)
                }
                return
        }
    }
}
