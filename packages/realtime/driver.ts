/**
 * @fileoverview The broadcast-driver seam — how a broadcast crosses (or does
 * not cross) process boundaries.
 *
 * A driver takes a published {@link BroadcastMessage} and delivers it back to
 * `onMessage` on **every** instance that subscribed — including the publisher.
 * The manager registers one `onMessage` handler and, on receive, fans the
 * message out to its **locally authorized** subscribers (security S6). Thus
 * local and cross-process delivery share one path.
 *
 * A cross-process driver MAY additionally expose two OPTIONAL capabilities the
 * manager feature-detects (never mandates), so the memory driver and any
 * third-party driver keep single-process behaviour unchanged:
 *
 * - the presence-state ops ({@link PresenceCapableDriver}) that own the
 *   authoritative `here` roster off the instance's in-process map (FR-005);
 * - the {@link ControlMessage} seam `onControl`, a **distinct** path from
 *   `onMessage` (A2/FR-016) — a control frame is not a channel event and must
 *   never route through `deliverLocal`.
 *
 * @module @lockness/realtime/driver
 */

import type { PresenceMember } from './channel.ts'

/** A message broadcast to a channel. */
export interface BroadcastMessage {
    /** The channel name. */
    readonly channel: string
    /** The event name. */
    readonly event: string
    /** The event payload. */
    readonly data: unknown
}

/**
 * A control frame carried on the same bus as channel events but on a **distinct**
 * seam (A2/FR-016) — it is not a {@link BroadcastMessage} and never reaches
 * `deliverLocal`. It instructs the owning instance to act on a connection
 * (revoke a socket, apply a presence join/leave), never to deliver an event.
 *
 * The `mac` is the FR-015 authenticity tag (an HMAC over the payload, keyed by
 * a per-deployment shared secret). It is **optional on the type** because an
 * unauthenticated frame is representable on the wire — the US3 ingest check is
 * what drops a control message whose `mac` is absent or fails to verify, before
 * the message is ever obeyed. The HMAC computation/verification itself is not
 * implemented here (US3 / T026); only the field is declared.
 */
export interface ControlMessage {
    /**
     * The control kind. `evict` revokes a connection; `presence-join` /
     * `presence-leave` announce a roster change across instances.
     */
    readonly kind: 'evict' | 'presence-join' | 'presence-leave'
    /** The target connection id the control acts on. */
    readonly target: string
    /**
     * For a `presence-join` / `presence-leave`: the presence channel the roster
     * change is on. Absent for an `evict` (which spans every channel).
     */
    readonly channel?: string
    /**
     * For a `presence-join` / `presence-leave`: the **client-visible**
     * {@link PresenceMember} to fan out to local presence subscribers (FR-018 —
     * the owning-instance sweep metadata is internal to the driver and never
     * travels on this field). Absent for an `evict`.
     */
    readonly member?: PresenceMember
    /** The FR-015 authenticity tag; absent on an unauthenticated frame. */
    readonly mac?: string
}

/**
 * A broadcast transport. `publish` emits a message; every instance's
 * `onMessage` handler (registered once) receives it and re-resolves local
 * delivery. The memory driver loops back in-process; the Redis driver fans out
 * across processes.
 *
 * The presence-state ops and `onControl` are **optional**: a driver that omits
 * them keeps single-process behaviour, and the manager reaches them only behind
 * one feature-detect guard (A5). Use {@link PresenceCapableDriver} for the
 * narrowed shape once that guard has confirmed them present.
 */
export interface BroadcastDriver {
    /**
     * Publish a message to all instances (including this one).
     *
     * @param message - The message to broadcast.
     */
    publish(message: BroadcastMessage): void | Promise<void>
    /**
     * Register the handler invoked for every received message.
     *
     * @param handler - Called with each delivered message.
     */
    onMessage(handler: (message: BroadcastMessage) => void): void
    /**
     * OPTIONAL (FR-005). Add a member to the channel's authoritative roster.
     *
     * @param channel - The presence channel.
     * @param member - The client-visible member to add.
     */
    addMember?(
        channel: string,
        member: PresenceMember,
    ): void | Promise<void>
    /**
     * OPTIONAL (FR-005). Remove a member from the channel's authoritative roster.
     *
     * @param channel - The presence channel.
     * @param memberId - The id of the member to remove.
     */
    removeMember?(
        channel: string,
        memberId: string | number,
    ): void | Promise<void>
    /**
     * OPTIONAL (FR-005). List the channel's authoritative roster (every
     * instance's members).
     *
     * @param channel - The presence channel.
     * @returns The current members ("here").
     */
    listMembers?(
        channel: string,
    ): PresenceMember[] | Promise<PresenceMember[]>
    /**
     * OPTIONAL (A2/FR-016). Register the handler for {@link ControlMessage}s —
     * a **distinct** seam from {@link onMessage}, never folded into the
     * channel-event union. A driver exposing this seam only ever delivers a
     * frame that already passed the FR-015 authenticity check; an unauthenticated
     * frame is dropped inside the driver and never reaches this handler.
     *
     * @param handler - Called with each **authenticated** received control message.
     */
    onControl?(handler: (control: ControlMessage) => void): void
    /**
     * OPTIONAL (FR-015/FR-016). Publish a {@link ControlMessage} to every
     * instance's {@link onControl} seam, attaching the authenticity MAC. The
     * counterpart to {@link onControl}; a driver that omits one omits both. The
     * `mac` field of `control` is ignored — the driver computes and attaches it.
     *
     * @param control - The control message to broadcast (its `mac` is set here).
     */
    publishControl?(control: ControlMessage): void | Promise<void>
    /**
     * OPTIONAL (S1/FR-014). Durably record that a connection is revoked, so an
     * evict survives a lost control frame. The marker lives in the driver
     * (decision-table home: "whether a revoked connection stays revoked across a
     * reconnect") and is re-checked by the owning instance on each
     * {@link onRevocationReconcile} pass.
     *
     * @param target - The revoked connection id.
     */
    markRevoked?(target: string): void | Promise<void>
    /**
     * OPTIONAL (S1/FR-014). The connection ids the durable marker currently
     * names, with expired entries reaped. The owning instance re-checks this on
     * each {@link onRevocationReconcile} tick to recover a missed evict.
     *
     * @returns The currently-revoked connection ids.
     */
    listRevoked?(): string[] | Promise<string[]>
    /**
     * OPTIONAL (S1/FR-014). Register the handler the driver invokes on its
     * periodic reconcile pass, so the owning instance re-checks
     * {@link listRevoked} and revokes any local member it names — recovering an
     * evict whose control frame was lost while the owning socket was between
     * reconnects. Bounds exposure to a lost evict at ~one reconcile interval.
     *
     * @param handler - Called with no arguments on each reconcile tick.
     */
    onRevocationReconcile?(handler: () => void | Promise<void>): void
}

/**
 * A {@link BroadcastDriver} narrowed to one that owns the authoritative presence
 * roster — the presence-state ops are guaranteed present. Obtain it from the
 * manager's single feature-detect guard, never by asserting the shape ad hoc.
 */
export interface PresenceCapableDriver extends BroadcastDriver {
    /**
     * Add a member to the channel's authoritative roster.
     *
     * @param channel - The presence channel.
     * @param member - The client-visible member to add.
     */
    addMember(channel: string, member: PresenceMember): void | Promise<void>
    /**
     * Remove a member from the channel's authoritative roster.
     *
     * @param channel - The presence channel.
     * @param memberId - The id of the member to remove.
     */
    removeMember(
        channel: string,
        memberId: string | number,
    ): void | Promise<void>
    /**
     * List the channel's authoritative roster (every instance's members).
     *
     * @param channel - The presence channel.
     * @returns The current members ("here").
     */
    listMembers(channel: string): PresenceMember[] | Promise<PresenceMember[]>
}
