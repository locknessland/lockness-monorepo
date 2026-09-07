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

import { renderError, safeForLog } from '@lockness/contract'
import { isValidName, MAX_NAME_LENGTH } from './protocol.ts'

/**
 * A connection id the control plane cannot carry.
 *
 * A named type rather than a bare `Error` because this reaches the application
 * through the same `onError` hook as a transport failure and a driver failure,
 * and those want different handling: a dead socket is operational, an unusable
 * id is a bug in the caller's own code that no retry will fix.
 */
export class ChannelNameError extends Error {
    override readonly name = 'ChannelNameError'

    /**
     * @param channel - The offending name, encoded before it reaches the message.
     */
    constructor(channel: string) {
        super(
            `realtime: channel name ${safeForLog(channel)} is outside the ` +
                'supported charset (letters, digits and : . _ -, at most 200 ' +
                'characters). The control plane drops frames naming a channel ' +
                'outside it, so a presence join would succeed on this instance ' +
                'and be silently dropped by every other one.',
        )
    }
}

export class PresenceMemberIdError extends Error {
    override readonly name = 'PresenceMemberIdError'

    /**
     * @param id - The offending id, encoded before it reaches the message.
     */
    constructor(id: string) {
        super(
            `realtime: presence member id ${safeForLog(id)} is unusable — it ` +
                `must be a finite value whose string form is 1 to ` +
                `${MAX_NAME_LENGTH} characters (#306). It becomes a Redis ` +
                'hash field on the authoritative roster, and an oversized one ' +
                'is written there BEFORE the control frame that announces it ' +
                'is refused for size — leaving the member on this instance, ' +
                'absent from every other, and `subscribe` still answering ok.',
        )
    }
}

export class ConnectionIdError extends Error {
    override readonly name = 'ConnectionIdError'

    /**
     * @param id - The offending id, encoded before it reaches the message.
     */
    constructor(id: string) {
        super(
            `realtime: connection id ${safeForLog(id)} is outside the ` +
                'supported charset (letters, digits and : . _ -, at most 200 ' +
                'characters). Mint connection ids with `crypto.randomUUID()`. ' +
                'The control plane drops frames naming an id outside it, so ' +
                'eviction would work on this instance and silently fail on ' +
                'every other one.',
        )
    }
}
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
                console.error(
                    // The framework's DEFAULT sink, so it is the framework's job
                    // to make it safe. A caller who supplies their own owns what
                    // it prints; this one must not hand an unrendered error —
                    // and its stack — to a log store.
                    `realtime: broadcast publish failed: ${renderError(error)}`,
                ))
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
                // CLOSE FIRST, then rethrow. `guard()` in websocket.ts catches
                // whatever this throws and merely logs it, so a bare throw left
                // the socket OPEN and untracked: the app's own onOpen — where a
                // per-socket rate limit or an explicit unauthorized-close lives
                // — was skipped, onMessage went on firing, and `evict` could
                // not reclaim it because it rejects the same id. Fail-open on
                // the seam this breaking change was supposed to make loud.
                try {
                    this.register(conn)
                } catch (error) {
                    conn.close(1011, 'unusable connection id')
                    throw error
                }
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
     * Reject a connection id the rest of the framework cannot carry.
     *
     * **Loud, at the boundary, once.** Before this, three paths disagreed about
     * an id outside {@link isValidName}: a local `evict()` worked, a control
     * frame to another instance was dropped on ingest (`drivers/redis.ts`), and
     * the durable reconcile recovered it. An application using such an id had a
     * revocation that worked on one instance and not the others, with nothing
     * to tell it so — and filtering the reconcile path alone would have made
     * that two silent failures rather than one.
     *
     * The charset is not new; it is what the control plane has always required.
     * What is new is saying so at the moment the id enters, where an
     * application can act on it, instead of at a revocation nobody is watching.
     *
     * @param id - The connection id to check.
     * @throws If the id is outside the charset the control plane accepts.
     */
    #assertUsableId(id: string): void {
        if (isValidName(id)) return
        throw new ConnectionIdError(id)
    }

    /**
     * Assert a presence member's id can cross the control plane and land in
     * the roster (#306).
     *
     * **LENGTH ONLY, and the charset is deliberately NOT constrained.** This
     * value is application identity, not a framework-minted name: real
     * deployments key presence on an email, a username or an external
     * provider's id, and `isValidName`'s charset rejects `a@b.com` on the `@`.
     * Borrowing {@link Connection.id}'s charset here would break those
     * applications to buy nothing, because the three ways a hostile id could
     * hurt are all closed elsewhere:
     *
     * - Not command injection — `encodeCommand` emits length-prefixed RESP
     *   bulk strings, so a CRLF or a space in the value cannot forge a command.
     * - Not owned-set parser confusion — the entry is `<channel> <field>` and
     *   the parse is `indexOf(' ')`, which takes the FIRST space, so a field
     *   may contain spaces freely. That rests on the channel containing none —
     *   which #306 asserted and **nothing enforced**: `isValidName` ran only on
     *   the WebSocket wire, never on `subscribe`'s public path. #314 added
     *   {@link #assertUsableChannel}, and this claim now cites an enforcement
     *   point instead of a convention. (#306 originally credited the MEMBER
     *   id's charset, which does not exist at all.)
     * - Not frame forgery — control frames carry a MAC.
     *
     * What is NOT closed elsewhere is length. The id becomes a Redis hash field
     * on the authoritative roster, and the only two caps upstream of it are a
     * 10 MiB RESP frame and an 8 KiB control payload — neither a bound on this
     * value. Worse, the roster write happens BEFORE the control publish, and
     * the oversize check there only warns and returns: an oversized id is
     * already in the hash while the frame announcing it is silently dropped and
     * `subscribe` still answers `{ ok: true }`. Refusing at the boundary is
     * what keeps that from being a partial write.
     *
     * A NUMERIC id is checked as a number first. `String(1e21)` is `"1e+21"`,
     * whose `+` is outside `isValidName` — which is why a charset predicate
     * could not be applied to this type without rejecting a legitimate large
     * integer. Length has no such problem. Non-finite numbers are refused
     * outright: `String(NaN)` is `"NaN"`, a perfectly ordinary-looking field
     * name that every NaN-identified member would silently share.
     *
     * @param id - The member id to check, as supplied by `authorize()`.
     * @throws {PresenceMemberIdError} If the id is empty, over
     *   {@link MAX_NAME_LENGTH} characters, or a non-finite number.
     */
    /**
     * Assert a channel name can cross the control plane and be parsed back out
     * of the roster's owned-member set (#314).
     *
     * **`subscribe` asserted two of the three values it received and skipped
     * this one.** `connection.id` goes through `#assertUsableId` (#304) and a
     * presence `member.id` through `#assertUsableMemberId` (#306); the channel
     * went through nothing. The only channel validation in the package was
     * `decodeClientMessage`, which guards the WebSocket wire — so the
     * framework's own socket path refused a name the public programmatic API
     * accepted, which is the asymmetry #304 was opened about, one value over.
     *
     * Two consequences were live, both reachable with a channel containing a
     * space:
     *
     * - **Cross-instance presence stopped working for that channel.** The
     *   `presence-join` control frame carries it, and every receiving instance
     *   drops the frame on ingest for exactly this charset. The join succeeded
     *   locally, `subscribe` answered `{ ok: true }`, and no peer ever learned.
     * - **The ghost sweep mis-parsed.** An owned-set entry is
     *   `` `${channel} ${field}` `` and the sweep splits on the FIRST space, so
     *   `presence-my room` + `u1` split to channel `presence-my` and field
     *   `room u1`. The `HDEL` then hit a key that does not exist and the members
     *   were never reclaimed. Only the death-recovery path broke — the ordinary
     *   `removeMember` re-joins the full string — which is why nothing caught it.
     *
     * Two shipped docstrings already asserted this invariant
     * (`OWNED_SEP`'s and {@link #assertUsableMemberId}'s), which is worse than a
     * gap: the next reader takes it as settled. Both now cite this method.
     *
     * @param channel - The channel name to check.
     * @throws {ChannelNameError} If the name is outside `isValidName`.
     */
    #assertUsableChannel(channel: string): void {
        if (isValidName(channel)) return
        throw new ChannelNameError(channel)
    }

    #assertUsableMemberId(id: string | number): void {
        if (typeof id === 'number' && !Number.isFinite(id)) {
            throw new PresenceMemberIdError(String(id))
        }
        const text = String(id)
        if (text.length > 0 && text.length <= MAX_NAME_LENGTH) return
        throw new PresenceMemberIdError(text)
    }

    /**
     * Register a live connection (call from the handler's `onOpen`).
     *
     * @param connection - The connection to track.
     * @throws If `connection.id` is outside the supported charset.
     */
    register(connection: Connection<Identity>): void {
        this.#assertUsableId(connection.id)
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
     * @throws {ConnectionIdError} If `connection.id` is outside the supported
     *   charset. That is a caller bug, not an authorization outcome — a denied
     *   subscribe answers `{ ok: false }`, and folding the two together would
     *   put a policy decision and a defect behind the same branch.
     */
    async subscribe(
        connection: Connection<Identity>,
        channel: string,
    ): Promise<SubscribeResult> {
        // FIRST, before `channelKind` and before the awaited authorize. It
        // sat after both, so an out-of-charset id returned `{ ok: false }`
        // whenever the app's authorizer denied — the same id that throws on a
        // public channel — and the authorizer (a DB read, an audit write, a
        // rate-limit increment) ran on an id that was never usable.
        this.#assertUsableId(connection.id)
        // BEFORE `channelKind` and before the awaited authorizer, for the same
        // reason the id assertion is (#314): the authorizer may be a DB read, an
        // audit write or a rate-limit increment, and running it for a channel
        // that can never work spends that side effect on nothing.
        this.#assertUsableChannel(channel)
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
                // BEFORE the roster write and before the control publish
                // (#306). Asserting after either one is what makes an
                // oversized id a partial write rather than a refusal.
                this.#assertUsableMemberId(member.id)
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
    // DELIBERATELY NOT CHANNEL-ASSERTED (#314). This is a REMOVAL path, and
    // refusing a removal strands the state it would have removed. It is also
    // reached from `disconnect`, which iterates `subscriptions.keys()` — so on
    // a process that predates the boundary guard, throwing here would make
    // every disconnect fail on the first legacy name and leak every channel
    // after it. Accepting a name we would no longer create is the correct
    // asymmetry: creation is guarded, cleanup is total.
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
     * @throws {ConnectionIdError} If `clientId` is outside the supported
     *   charset. Without this the call would publish a control frame that every
     *   receiving instance drops on ingest, and return successfully having
     *   revoked nothing.
     * @example
     * ```ts
     * // A revoked token: kick the connection off every instance.
     * // Throws ConnectionIdError if the id is not one this framework minted.
     * await manager.evict(connectionId)
     * ```
     */
    async evict(clientId: string): Promise<void> {
        // The third boundary. `evict` takes an arbitrary string from the
        // application, and an id outside the charset would publish a control
        // frame that every receiving instance drops on ingest — a revocation
        // that reports success and does nothing. Loud here, for the same reason
        // it is loud at registration.
        this.#assertUsableId(clientId)
        // Durable first (S1/FR-014): even if the control frame is lost, the
        // owning instance recovers the evict on its next reconcile.
        //
        // A failure here must NOT cancel the eviction. The local hard-close
        // needs no Redis at all, so letting a durability write reject out of
        // this method would skip the one revocation that was still possible —
        // failing open on the framework's only revocation path. The error is
        // re-thrown after the revocation has been applied, so the caller still
        // learns that durability was lost and this evict will not survive a
        // reconcile (#276 review HIGH-2).
        let durabilityError: unknown
        try {
            await this.driver.markRevoked?.(clientId)
        } catch (error) {
            durabilityError = error
            // Rendered, not passed as a separate console argument. The old
            // comment here reasoned that not interpolating meant no encoder was
            // needed — which treats the hazard as log INJECTION when it is
            // DISCLOSURE. `console.warn(msg, error)` prints the error's message
            // AND its stack, so the object form leaks strictly more than the
            // interpolation it was preferred over: measured, a DSN-bearing
            // failure reached the sink in cleartext with its stack. Teardown is
            // exactly where credential-bearing errors are produced.
            console.warn(
                'realtime: the durable revocation write failed — revoking ' +
                    'anyway, but a lost control frame will NOT be recovered ' +
                    `by reconcile: ${renderError(error)}`,
            )
        }
        // The revocation itself. Its failure is the more serious of the two, so
        // it propagates in preference to the durability error — never from a
        // `finally`, which would mask it.
        if (this.connections.has(clientId)) {
            await this.revokeLocal(clientId)
        } else {
            // The socket lives on another instance — reach it over the control
            // plane.
            await this.publishControl({ kind: 'evict', target: clientId })
        }
        if (durabilityError !== undefined) throw durabilityError
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
                `realtime: evict teardown for ${safeForLog(clientId)} failed ` +
                    `after hard-close: ${renderError(error)}`,
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
    // DELIBERATELY NOT CHANNEL-ASSERTED (#314). A broadcast reaches only a
    // PUBLISH, which is a literal context, and `deliverLocal` re-keys on the
    // channel recovered from the delivered topic. With `subscribe` guarded
    // nothing can be subscribed to an unusable name, so a broadcast to one
    // fans out to an empty set — inert, not incorrect. Guarding it would add a
    // throw on a path that cannot produce the failure this issue is about,
    // while breaking a caller mid-flight during an upgrade.
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
