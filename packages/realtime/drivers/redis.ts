/**
 * @fileoverview The Redis broadcast driver — cross-process fan-out, the
 * authoritative presence roster, and the authenticated control plane.
 *
 * Publishing a channel event is a normal `PUBLISH` command (args are RESP bulk
 * strings via the client — no inline construction, no RESP injection). Receiving
 * push messages needs a **subscribe-mode connection**, which `@lockness/redis`'s
 * serialized-command `RedisClient` does not provide; that connection is a
 * {@link RedisSubscriber} port.
 *
 * There are two ways to obtain a driver:
 *
 * - **Production (FR-012).** {@link RedisBroadcastDriver.fromConfig} constructs
 *   both ends INTERNALLY from one Redis connection config — a lazily-connecting
 *   `RedisClient` for `PUBLISH` and a dedicated `RedisSubscribeConnection` for
 *   the pub/sub socket — mirroring `@lockness/queue`'s `RedisClient`
 *   construction (`packages/queue/manager.ts`). This is the decision-table home
 *   for "queue-mirror construction"; the `realtime → redis` edge is already
 *   granted and this is what makes the declaration used.
 * - **Tests.** The public constructor still takes the {@link RedisCommandClient}
 *   and {@link RedisSubscriber} ports so a fake bus can be injected — the
 *   injection path is preserved, not replaced.
 *
 * This driver is the single home for three decision-table rules (#268 §5):
 *
 * - **The reserved control-topic name and shape** (evict, presence join/leave):
 *   one {@link RedisBroadcastDriver.controlTopic} + one encode/decode pair,
 *   delivered on the DISTINCT {@link RedisBroadcastDriver.onControl} seam —
 *   never through {@link RedisBroadcastDriver.onMessage}'s channel-event path.
 * - **Whether a control / presence-identity message is authentic**: the FR-015
 *   HMAC over the payload, keyed by the per-deployment secret, attached on
 *   publish and verified on ingest BEFORE the message is actioned; an absent or
 *   failed MAC is dropped with a WARN and never obeyed. The reserved `prefix` is
 *   NOT a security boundary.
 * - **Who is authoritatively "here"** and **how a member is identified for the
 *   sweep**: the per-presence-channel Redis roster keyed by member id, each
 *   entry tagged with the owning-instance id (internal, FR-018), plus the
 *   instance-scoped ghost sweep (Q1/FR-008).
 *
 * It performs NO authorization — local re-authorization is
 * `ChannelManager.deliverLocal`'s single home (S6).
 *
 * @module @lockness/realtime/drivers/redis
 */

import type {
    BroadcastDriver,
    BroadcastMessage,
    ControlMessage,
} from '../driver.ts'
import { isValidName } from '../protocol.ts'
import type { PresenceMember } from '../channel.ts'
import type { RealtimeControlConfig } from '../types.ts'
import {
    hmacSha256Hex,
    RedisClient,
    type RedisClientConfig,
    RedisSubscribeConnection,
} from '@lockness/redis'

/** A resource the driver owns and must release on {@link RedisBroadcastDriver.close}. */
interface Closeable {
    /** Release the resource (idempotent). */
    close(): void | Promise<void>
}

/**
 * The minimal command surface used for publishing and roster state.
 * `@lockness/redis`'s `RedisClient` satisfies it; a test passes a fake. Every
 * op is an ordinary serialized command — the serialized-command client handles
 * it. The reply is a `@lockness/redis` `RespReply` (`{ type, value }`), narrowed
 * here through the {@link asArray}/{@link asBulk}/{@link asInteger} guards.
 */
export interface RedisCommandClient {
    /**
     * Run a Redis command; args are sent as RESP bulk strings.
     *
     * @param args - The command and its arguments.
     * @returns The reply (a `RespReply`-shaped value, narrowed by the caller).
     */
    command(...args: string[]): Promise<unknown>
}

/**
 * A subscribe-mode connection that pushes messages for a topic pattern. A test
 * passes a fake bus; production supplies a real pub/sub connection
 * (`@lockness/redis`'s `RedisSubscribeConnection` — the serialized client cannot
 * subscribe).
 */
export interface RedisSubscriber {
    /**
     * Subscribe to a topic pattern and receive each published payload.
     *
     * @param pattern - The topic glob (e.g. `lockness:realtime:*`).
     * @param handler - Called with `(topic, payload)` for each message.
     */
    psubscribe(
        pattern: string,
        handler: (topic: string, payload: string) => void,
    ): void
}

/**
 * Tuning for the instance-scoped ghost-member sweep (Q1/FR-008). One liveness
 * key per instance is refreshed on the heartbeat interval; a reconcile pass
 * sweeps the roster members of any instance whose liveness key has expired.
 */
export interface RedisPresenceOptions {
    /**
     * The instance liveness key TTL, in seconds. An instance that stops
     * heartbeating (crash) is considered dead once this elapses.
     * @default 15
     */
    livenessTtlSeconds?: number
    /**
     * How often (ms) this instance refreshes its own liveness key. Must be well
     * under `livenessTtlSeconds * 1000`.
     * @default 5000
     */
    heartbeatIntervalMs?: number
    /**
     * How often (ms) this instance reconciles the roster, sweeping the members
     * of any dead instance.
     * @default 10000
     */
    reconcileIntervalMs?: number
}

/** Options for the Redis broadcast driver. */
export interface RedisBroadcastDriverOptions {
    /** Reserved topic prefix for multi-app / multi-tenant isolation. */
    prefix?: string
    /**
     * The FR-015 control-plane authenticity secret. Required for the control /
     * presence-identity path (`onControl` / `publishControl`): without it, a
     * control message can neither be signed on publish nor verified on ingest,
     * so both are refused with a WARN.
     */
    control?: RealtimeControlConfig
    /** Ghost-member sweep tuning (Q1/FR-008). */
    presence?: RedisPresenceOptions
    /**
     * The TTL (seconds) of a durable revocation marker (FR-014). A marker
     * lingers this long so a socket that reconnects within the window is still
     * revoked; after it, the marker self-expires so the set never grows without
     * bound.
     * @default 300
     */
    revocationTtlSeconds?: number
}

/** Narrow an unknown `RespReply` to its array elements, or `undefined`. */
function asArray(reply: unknown): readonly unknown[] | undefined {
    return typeof reply === 'object' && reply !== null &&
            (reply as { type?: unknown }).type === 'array'
        ? (reply as { value: readonly unknown[] }).value
        : undefined
}

/** Narrow an unknown `RespReply` to its bulk-string value, or `undefined`. */
function asBulk(reply: unknown): string | undefined {
    return typeof reply === 'object' && reply !== null &&
            (reply as { type?: unknown }).type === 'bulk'
        ? (reply as { value: string }).value
        : undefined
}

/** Narrow an unknown `RespReply` to its integer value, or `undefined`. */
function asInteger(reply: unknown): number | undefined {
    return typeof reply === 'object' && reply !== null &&
            (reply as { type?: unknown }).type === 'integer'
        ? (reply as { value: number }).value
        : undefined
}

/** A stored roster entry: the client-visible member + its internal owner (FR-018). */
interface RosterEntry {
    /** The client-visible member (the only field that enters snapshots/frames). */
    readonly member: PresenceMember
    /** The owning-instance id — internal sweep metadata, never client-visible. */
    readonly owner: string
}

/** The wire shape of a control message: the manager-facing fields + `origin`. */
interface ControlWire {
    kind: ControlMessage['kind']
    target: string
    channel?: string
    member?: PresenceMember
    origin: string
    mac?: string
}

const DEFAULT_LIVENESS_TTL_SECONDS = 15
const DEFAULT_HEARTBEAT_INTERVAL_MS = 5_000
const DEFAULT_RECONCILE_INTERVAL_MS = 10_000
const DEFAULT_REVOCATION_TTL_SECONDS = 300
/**
 * The minimum control-secret length, in bytes. The FR-015 MAC is only as strong
 * as its key: a short, guessable secret lets a peer forge an authentic-looking
 * control frame, so a secret below this floor is rejected at construction.
 */
const MIN_CONTROL_SECRET_BYTES = 32
/**
 * Field separator inside an owned-member set entry — `channel memberId`, joined
 * by a single space. Unambiguous because {@link isValidName} forbids spaces in a
 * channel name, so the first space always marks the channel/member boundary.
 */
const OWNED_SEP = ' '

/**
 * Constant-time-ish comparison of two lowercase-hex MAC strings. Compares every
 * character regardless of the first mismatch so verification does not leak where
 * a forged MAC first diverges.
 */
function timingSafeEqualHex(a: string, b: string): boolean {
    if (a.length !== b.length) return false
    let diff = 0
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
    return diff === 0
}

/**
 * A cross-process broadcast driver over Redis pub/sub.
 *
 * @example
 * ```ts
 * const driver = RedisBroadcastDriver.fromConfig(
 *   { hostname: 'localhost' },
 *   { prefix: 'myapp', control: { secret: Deno.env.get('REALTIME_SECRET')! } },
 * )
 * ```
 */
export class RedisBroadcastDriver implements BroadcastDriver {
    private readonly prefix: string
    /** The per-deployment MAC secret bytes, or `undefined` when unconfigured. */
    private readonly secret: Uint8Array<ArrayBuffer> | undefined
    /** This instance's identity — tags roster entries and control-message origin. */
    private readonly instanceId: string = crypto.randomUUID()
    private readonly livenessTtlSeconds: number
    private readonly heartbeatIntervalMs: number
    private readonly reconcileIntervalMs: number
    private readonly revocationTtlSeconds: number
    private heartbeatTimer?: ReturnType<typeof setInterval>
    private reconcileTimer?: ReturnType<typeof setInterval>
    private revocationTimer?: ReturnType<typeof setInterval>
    private sweepStarted = false
    /**
     * The owning instance's revocation re-check (S1/FR-014). Registered by the
     * manager via {@link onRevocationReconcile}; absent until then, so a driver
     * used without a manager reconciles nothing. Its cadence is the DEDICATED
     * {@link revocationTimer} — deliberately independent of the presence
     * ghost-sweep, which only starts once this instance hosts a presence member,
     * so a presence-free deployment still recovers a lost evict (FR-014).
     */
    private revocationHandler?: () => void | Promise<void>
    /**
     * Resources this driver constructed itself (via {@link fromConfig}) and is
     * therefore responsible for closing. Empty when the ports were injected — a
     * test owns and closes its own fakes, so {@link close} then only stops the
     * sweep timers.
     */
    private owned: readonly Closeable[] = []

    /**
     * @param command - The command client used to `PUBLISH` and hold roster state.
     * @param subscriber - The subscribe-mode connection pushing messages.
     * @param options - The reserved prefix, control secret, and sweep tuning.
     * @throws {Error} When a control secret is supplied but is shorter than
     *   {@link MIN_CONTROL_SECRET_BYTES} bytes — a weak key would let a peer
     *   forge an authentic-looking control frame (FR-015).
     */
    constructor(
        private readonly command: RedisCommandClient,
        private readonly subscriber: RedisSubscriber,
        options: RedisBroadcastDriverOptions = {},
    ) {
        this.prefix = options.prefix ?? 'lockness:realtime'
        if (options.control?.secret !== undefined) {
            const bytes = new TextEncoder().encode(options.control.secret)
            if (bytes.length < MIN_CONTROL_SECRET_BYTES) {
                throw new Error(
                    'realtime: the control secret must be at least ' +
                        `${MIN_CONTROL_SECRET_BYTES} bytes (FR-015) — got ` +
                        `${bytes.length}. Use a high-entropy value, e.g. ` +
                        `Deno.env.get('REALTIME_SECRET').`,
                )
            }
            this.secret = bytes
        } else {
            this.secret = undefined
        }
        this.livenessTtlSeconds = options.presence?.livenessTtlSeconds ??
            DEFAULT_LIVENESS_TTL_SECONDS
        this.heartbeatIntervalMs = options.presence?.heartbeatIntervalMs ??
            DEFAULT_HEARTBEAT_INTERVAL_MS
        this.reconcileIntervalMs = options.presence?.reconcileIntervalMs ??
            DEFAULT_RECONCILE_INTERVAL_MS
        this.revocationTtlSeconds = options.revocationTtlSeconds ??
            DEFAULT_REVOCATION_TTL_SECONDS
    }

    /**
     * Construct a driver whose command client and subscribe-mode connection are
     * built INTERNALLY from one Redis connection config (FR-012).
     *
     * This is the production path and the decision-table home for "queue-mirror
     * construction": it mirrors `@lockness/queue`'s `new RedisClient(config)` in
     * `packages/queue/manager.ts`. Both connections are lazy — the `RedisClient`
     * dials on its first command and the `RedisSubscribeConnection` on its first
     * `psubscribe` — so this opens no socket. Call {@link close} to release both.
     *
     * @param config - The Redis connection settings (`hostname` required).
     * @param options - The reserved prefix, control secret, and sweep tuning.
     * @returns A driver that owns and will close the two connections it built.
     * @throws {Error} When a control secret is supplied but is shorter than
     *   {@link MIN_CONTROL_SECRET_BYTES} bytes (FR-015).
     * @example
     * ```ts
     * const driver = RedisBroadcastDriver.fromConfig(
     *   { hostname: 'localhost', port: 6379 },
     *   { prefix: 'myapp', control: { secret: Deno.env.get('REALTIME_SECRET')! } },
     * )
     * // …later
     * await driver.close()
     * ```
     */
    static fromConfig(
        config: RedisClientConfig,
        options: RedisBroadcastDriverOptions = {},
    ): RedisBroadcastDriver {
        const command = new RedisClient(config)
        const subscriber = new RedisSubscribeConnection(config)
        const driver = new RedisBroadcastDriver(command, subscriber, options)
        // Close the subscribe socket before the command socket: stop draining
        // pushes, then drain the command queue's QUIT.
        driver.owned = [subscriber, command]
        return driver
    }

    /** The reserved topic for a channel's events. */
    private topic(channel: string): string {
        return `${this.prefix}:${channel}`
    }

    /**
     * The reserved control topic — the single home for the control-topic name
     * (#268 §5). Uses a `__control` suffix WITHOUT the `:` separator so it never
     * matches the `${prefix}:*` event pattern: a control frame is delivered only
     * via {@link onControl}, never through {@link onMessage}.
     */
    private get controlTopic(): string {
        return `${this.prefix}__control`
    }

    private presenceKey(channel: string): string {
        return `${this.prefix}:presence:${channel}`
    }

    private ownedKey(instanceId: string): string {
        return `${this.prefix}:owned:${instanceId}`
    }

    private aliveKey(instanceId: string): string {
        return `${this.prefix}:alive:${instanceId}`
    }

    private get instancesKey(): string {
        return `${this.prefix}:instances`
    }

    /** The index SET of currently-revoked connection ids (FR-014). */
    private get revokedIndexKey(): string {
        return `${this.prefix}:revoked`
    }

    /** The per-target revocation marker key — self-expires on its TTL (FR-014). */
    private revokedKey(target: string): string {
        return `${this.prefix}:revoked:${target}`
    }

    /**
     * Publish a message to the channel's Redis topic.
     *
     * @param message - The message to broadcast.
     */
    async publish(message: BroadcastMessage): Promise<void> {
        await this.command.command(
            'PUBLISH',
            this.topic(message.channel),
            JSON.stringify({ event: message.event, data: message.data }),
        )
    }

    /**
     * Register the delivery handler and start the pattern subscription. Each
     * received payload is decoded back into a {@link BroadcastMessage} whose
     * channel is the topic with the reserved prefix stripped.
     *
     * @param handler - Called with each received message.
     */
    onMessage(handler: (message: BroadcastMessage) => void): void {
        const pattern = `${this.prefix}:*`
        this.subscriber.psubscribe(pattern, (topic, payload) => {
            const channel = topic.startsWith(`${this.prefix}:`)
                ? topic.slice(this.prefix.length + 1)
                : topic
            let parsed: { event?: unknown; data?: unknown }
            try {
                parsed = JSON.parse(payload)
            } catch {
                console.warn('realtime: dropped a malformed Redis payload')
                return // a malformed payload is dropped, never a throw
            }
            // Re-validate names on ingest — a peer (or a poisoned topic) must
            // not inject an out-of-charset channel/event name into local fan-out.
            if (
                typeof parsed.event !== 'string' ||
                !isValidName(parsed.event) || !isValidName(channel)
            ) {
                console.warn(
                    'realtime: dropped a Redis message with an invalid name',
                )
                return
            }
            handler({ channel, event: parsed.event, data: parsed.data })
        })
    }

    /**
     * Register the control-message handler and subscribe the reserved control
     * topic. Each received frame is decoded, its FR-015 MAC verified, and its
     * routing names re-validated BEFORE the handler is invoked; a frame that
     * fails any check — or that this instance published itself (self-loopback) —
     * is dropped and never reaches the handler.
     *
     * @param handler - Called with each **authenticated** control message.
     */
    onControl(handler: (control: ControlMessage) => void): void {
        this.subscriber.psubscribe(this.controlTopic, (_topic, payload) => {
            const control = this.#verifyAndDecode(payload)
            if (control) handler(control)
        })
    }

    /**
     * Publish a control message to every instance's {@link onControl} seam,
     * attaching the FR-015 authenticity MAC. Refused with a WARN when no control
     * secret is configured — an unauthenticated control frame would be dropped by
     * every peer's ingest check anyway, so it is never emitted.
     *
     * @param control - The control message to broadcast (its `mac` is set here).
     */
    async publishControl(control: ControlMessage): Promise<void> {
        if (!this.secret) {
            console.warn(
                'realtime: refusing to publish an unauthenticated control ' +
                    'message — no control secret configured (FR-015)',
            )
            return
        }
        const wire: ControlWire = {
            kind: control.kind,
            target: control.target,
            channel: control.channel,
            member: control.member,
            origin: this.instanceId,
        }
        wire.mac = this.#sign(wire)
        await this.command.command(
            'PUBLISH',
            this.controlTopic,
            JSON.stringify(wire),
        )
    }

    /**
     * OPTIONAL (FR-005). Add a member to the channel's authoritative Redis
     * roster, tagged with this instance's owning id for the ghost sweep (FR-008),
     * and start the instance-liveness heartbeat if it is not already running.
     *
     * @param channel - The presence channel.
     * @param member - The client-visible member to add.
     */
    async addMember(channel: string, member: PresenceMember): Promise<void> {
        await this.#ensureSweepStarted()
        const entry: RosterEntry = { member, owner: this.instanceId }
        const field = String(member.id)
        await this.command.command(
            'HSET',
            this.presenceKey(channel),
            field,
            JSON.stringify(entry),
        )
        await this.command.command(
            'SADD',
            this.ownedKey(this.instanceId),
            `${channel}${OWNED_SEP}${field}`,
        )
    }

    /**
     * OPTIONAL (FR-005). Remove a member from the channel's authoritative roster.
     *
     * @param channel - The presence channel.
     * @param memberId - The id of the member to remove.
     */
    async removeMember(
        channel: string,
        memberId: string | number,
    ): Promise<void> {
        const field = String(memberId)
        await this.command.command('HDEL', this.presenceKey(channel), field)
        await this.command.command(
            'SREM',
            this.ownedKey(this.instanceId),
            `${channel}${OWNED_SEP}${field}`,
        )
    }

    /**
     * OPTIONAL (FR-005). List the channel's authoritative roster — every
     * instance's members. Only the client-visible member is returned; the
     * owning-instance metadata stays internal (FR-018).
     *
     * @param channel - The presence channel.
     * @returns The current members ("here").
     */
    async listMembers(channel: string): Promise<PresenceMember[]> {
        const reply = await this.command.command(
            'HGETALL',
            this.presenceKey(channel),
        )
        const flat = asArray(reply)
        if (!flat) return []
        const members: PresenceMember[] = []
        // HGETALL returns [field1, value1, field2, value2, …] as bulk strings.
        for (let i = 1; i < flat.length; i += 2) {
            const value = asBulk(flat[i])
            if (!value) continue
            try {
                const entry = JSON.parse(value) as RosterEntry
                if (entry && typeof entry === 'object' && entry.member) {
                    members.push(entry.member)
                }
            } catch (error) {
                console.warn(
                    `realtime: skipped a malformed roster entry on ${channel}: ${
                        error instanceof Error ? error.message : String(error)
                    }`,
                )
            }
        }
        return members
    }

    /**
     * OPTIONAL (S1/FR-014). Durably record that a connection is revoked. The
     * marker is a per-target key with a TTL (so it self-expires and the set
     * never grows without bound) plus an index-set entry for enumeration — the
     * same liveness pattern the ghost sweep uses. Decision-table home: "whether
     * a revoked connection stays revoked across a reconnect".
     *
     * @param target - The revoked connection id.
     */
    async markRevoked(target: string): Promise<void> {
        await this.command.command('SADD', this.revokedIndexKey, target)
        await this.command.command(
            'SET',
            this.revokedKey(target),
            '1',
            'EX',
            String(this.revocationTtlSeconds),
        )
    }

    /**
     * Whether a per-target revocation marker is still live (before its TTL).
     * Internal to {@link listRevoked}'s reap: there is no subscribe-time gate,
     * because a reconnecting client draws a fresh connection id, so a
     * per-id check could never catch a reconnect anyway (S1/FR-014).
     *
     * @param target - The connection id to check.
     * @returns `true` while the durable marker names it.
     */
    async #markerLive(target: string): Promise<boolean> {
        return asInteger(
            await this.command.command('EXISTS', this.revokedKey(target)),
        ) === 1
    }

    /**
     * OPTIONAL (S1/FR-014). The connection ids the durable marker currently
     * names, reaping index entries whose per-target key has expired so the
     * index stays bounded.
     *
     * @returns The currently-revoked connection ids.
     */
    async listRevoked(): Promise<string[]> {
        const reply = await this.command.command(
            'SMEMBERS',
            this.revokedIndexKey,
        )
        const ids = asArray(reply) ?? []
        const live: string[] = []
        for (const raw of ids) {
            const id = asBulk(raw)
            if (!id) continue
            if (await this.#markerLive(id)) live.push(id)
            else await this.command.command('SREM', this.revokedIndexKey, id)
        }
        return live
    }

    /**
     * OPTIONAL (S1/FR-014). Register the owning instance's revocation re-check
     * and start its periodic pass so a missed evict is recovered rather than
     * lost. The re-check itself (which local socket to revoke) lives in the
     * manager; the marker and its cadence live here (decision-table home).
     *
     * The pass runs on a DEDICATED timer started here, UNCONDITIONALLY — it is
     * not coupled to the presence ghost-sweep (which only starts once this
     * instance hosts a presence member). A deployment that serves only private /
     * public channels therefore still reconciles revocations, bounding exposure
     * to a lost evict at ~`reconcileIntervalMs` for EVERY deployment class
     * (closing the FR-014 gap the presence-coupled cadence left open). The timer
     * is cleared by {@link close}.
     *
     * @param handler - Called with no arguments on each reconcile tick.
     */
    onRevocationReconcile(handler: () => void | Promise<void>): void {
        this.revocationHandler = handler
        // Re-registration replaces the previous timer rather than stacking one.
        if (this.revocationTimer !== undefined) {
            clearInterval(this.revocationTimer)
        }
        // The callback RETURNS its promise so a FakeTime `tickAsync` awaits the
        // full re-check round-trip (the same discipline as the sweep timers).
        this.revocationTimer = setInterval(
            () => this.#runRevocationReconcile(),
            this.reconcileIntervalMs,
        )
    }

    /**
     * Run the registered revocation re-check once, on the dedicated cadence. A
     * failure is logged at WARN and never swallowed silently; the timer keeps
     * running so the next pass still bounds exposure to ~`reconcileIntervalMs`.
     */
    async #runRevocationReconcile(): Promise<void> {
        if (!this.revocationHandler) return
        try {
            await this.revocationHandler()
        } catch (error) {
            console.warn(
                `realtime: revocation reconcile failed: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            )
        }
    }

    /** Compute the FR-015 MAC over a control message's canonical payload. */
    #sign(wire: ControlWire): string {
        if (!this.secret) return ''
        return hmacSha256Hex(this.secret, this.#canonical(wire))
    }

    /**
     * The canonical bytes a control MAC covers: the semantic fields in a fixed
     * key order (the `mac` field itself excluded). `JSON.stringify` omits
     * `undefined` values, so `evict` (no channel/member) and a presence frame
     * canonicalise deterministically.
     */
    #canonical(wire: ControlWire): Uint8Array<ArrayBuffer> {
        return new TextEncoder().encode(JSON.stringify({
            kind: wire.kind,
            target: wire.target,
            channel: wire.channel,
            member: wire.member,
            origin: wire.origin,
        }))
    }

    /**
     * Decode a control-topic payload, verify its authenticity MAC and routing
     * names, and drop self-loopback. Returns the manager-facing
     * {@link ControlMessage} only when every check passes; otherwise `undefined`
     * (logged at WARN — never obeyed, never thrown).
     */
    #verifyAndDecode(payload: string): ControlMessage | undefined {
        if (!this.secret) {
            console.warn(
                'realtime: dropped a control message — no control secret ' +
                    'configured to verify it (FR-015)',
            )
            return undefined
        }
        let wire: ControlWire
        try {
            wire = JSON.parse(payload) as ControlWire
        } catch {
            console.warn('realtime: dropped a malformed control payload')
            return undefined
        }
        if (
            typeof wire !== 'object' || wire === null ||
            typeof wire.kind !== 'string' || typeof wire.target !== 'string' ||
            typeof wire.origin !== 'string' || typeof wire.mac !== 'string'
        ) {
            console.warn('realtime: dropped a control message of invalid shape')
            return undefined
        }
        // Our own publish loops back; we already applied it locally. Skip before
        // the MAC check — skipping is never "obeying", so it is always safe.
        if (wire.origin === this.instanceId) return undefined
        // FR-015: verify authenticity BEFORE any further action.
        const expected = this.#sign({ ...wire, mac: undefined })
        if (!timingSafeEqualHex(expected, wire.mac)) {
            console.warn(
                'realtime: dropped a control message with an absent/invalid ' +
                    'MAC — never obeyed (FR-015)',
            )
            return undefined
        }
        // FR-019: re-validate the routing names on ingest.
        if (
            !isValidName(wire.target) ||
            (wire.channel !== undefined && !isValidName(wire.channel))
        ) {
            console.warn(
                'realtime: dropped a control message with an invalid name',
            )
            return undefined
        }
        return {
            kind: wire.kind,
            target: wire.target,
            channel: wire.channel,
            member: wire.member,
        }
    }

    /**
     * Start the instance-liveness heartbeat and the ghost-sweep reconcile pass
     * once, the first time this instance touches the roster. Idempotent; the
     * timers are cleared by {@link close}.
     */
    async #ensureSweepStarted(): Promise<void> {
        if (this.sweepStarted) return
        this.sweepStarted = true
        await this.#heartbeat()
        // Refresh our own liveness key so a live instance is never swept. The
        // callbacks RETURN their promise (rather than voiding it) so a FakeTime
        // `tickAsync` awaits the full round-trip — the sweep's own error handling
        // still swallows nothing (both log at WARN).
        this.heartbeatTimer = setInterval(
            () => this.#heartbeat(),
            this.heartbeatIntervalMs,
        )
        // Sweep the members of any instance whose liveness key has expired.
        this.reconcileTimer = setInterval(
            () => this.#reconcile(),
            this.reconcileIntervalMs,
        )
    }

    /** Register this instance and refresh its liveness key (TTL heartbeat). */
    async #heartbeat(): Promise<void> {
        try {
            await this.command.command(
                'SADD',
                this.instancesKey,
                this.instanceId,
            )
            await this.command.command(
                'SET',
                this.aliveKey(this.instanceId),
                '1',
                'EX',
                String(this.livenessTtlSeconds),
            )
        } catch (error) {
            console.warn(
                `realtime: instance-liveness heartbeat failed: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            )
        }
    }

    /**
     * Sweep the roster members of every instance whose liveness key has expired
     * (Q1/FR-008), so a crashed instance leaves no permanent ghost members.
     */
    async #reconcile(): Promise<void> {
        try {
            const reply = await this.command.command(
                'SMEMBERS',
                this.instancesKey,
            )
            const ids = asArray(reply) ?? []
            for (const raw of ids) {
                const id = asBulk(raw)
                if (!id || id === this.instanceId) continue
                const alive = asInteger(
                    await this.command.command('EXISTS', this.aliveKey(id)),
                )
                if (alive === 0) await this.#sweepInstance(id)
            }
        } catch (error) {
            console.warn(
                `realtime: roster reconcile failed: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            )
        }
        // The durable revocation re-check runs on its OWN dedicated timer
        // (see {@link onRevocationReconcile}), NOT here — it must fire for a
        // presence-free deployment that never starts this ghost-sweep pass.
    }

    /** Remove every roster member owned by a dead instance, then forget it. */
    async #sweepInstance(deadId: string): Promise<void> {
        const reply = await this.command.command(
            'SMEMBERS',
            this.ownedKey(deadId),
        )
        const owned = asArray(reply) ?? []
        let swept = 0
        for (const raw of owned) {
            const entry = asBulk(raw)
            if (!entry) continue
            const sep = entry.indexOf(OWNED_SEP)
            if (sep < 0) continue
            const channel = entry.slice(0, sep)
            const field = entry.slice(sep + 1)
            await this.command.command('HDEL', this.presenceKey(channel), field)
            swept++
        }
        await this.command.command('DEL', this.ownedKey(deadId))
        await this.command.command('SREM', this.instancesKey, deadId)
        console.warn(
            `realtime: swept ${swept} ghost member(s) of dead instance ${deadId}`,
        )
    }

    /**
     * Release the connections this driver constructed itself (via
     * {@link fromConfig}) — the subscribe socket first (stops the push read
     * loop), then the command client (drains its QUIT) — and stop the sweep
     * timers. Does NOT proactively drop this instance's roster members: a real
     * crash cannot, so its liveness key simply expires and a surviving instance
     * sweeps it (that is what {@link close} models in the sweep tests).
     * Idempotent; a no-op for an injected-port driver beyond stopping the timers.
     *
     * @returns Resolves once every owned connection is closed.
     * @example
     * ```ts
     * const driver = RedisBroadcastDriver.fromConfig({ hostname: 'localhost' })
     * await driver.close()
     * ```
     */
    async close(): Promise<void> {
        if (this.heartbeatTimer !== undefined) {
            clearInterval(this.heartbeatTimer)
            this.heartbeatTimer = undefined
        }
        if (this.reconcileTimer !== undefined) {
            clearInterval(this.reconcileTimer)
            this.reconcileTimer = undefined
        }
        if (this.revocationTimer !== undefined) {
            clearInterval(this.revocationTimer)
            this.revocationTimer = undefined
        }
        for (const resource of this.owned) {
            await resource.close()
        }
    }
}
