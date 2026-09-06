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
import { ControlReplayWindow } from '../control_replay_window.ts'
import type { PresenceMember } from '../channel.ts'
import type { RealtimeControlConfig } from '../types.ts'
import { renderError, safeForLog } from '@lockness/contract'
import {
    hmacSha256Hex,
    RedisClient,
    type RedisClientConfig,
    RedisSubscribeConnection,
    type RedisSubscribeConnectionConfig,
} from '@lockness/redis'

/**
 * Extra seconds on the index key's own TTL, beyond the longest revocation it can
 * hold. It only has to outlive the newest member, and it is refreshed on every
 * write; the slack keeps a key that is still being written from expiring under
 * a member (#276).
 */
const INDEX_TTL_SLACK_SECONDS = 60

/**
 * Record a revocation: ONE operation, expiring at a Redis-decided instant.
 *
 * `TIME` is read inside the script, so the expiry is set from Redis's clock
 * and no instance's wall clock takes part in the decision (#276 FR-012) —
 * the property #271's monotonicity argument rests on.
 *
 * **Every** write here is extend-only, and it takes THREE calls to be so.
 *
 * - `ZADD … GT` protects one member's score, so a re-eviction from an instance
 *   configured with a shorter `revocationTtlSeconds` cannot pull that member's
 *   expiry back in.
 * - `EXPIRE … NX` **arms** the key's own TTL, and only when it has none.
 * - `EXPIRE … GT` **extends** it, and only upward — so the same shorter-TTL
 *   instance cannot shrink the whole key and take every live revocation in it
 *   down, which would undo at key granularity what the `ZADD` guarantees at
 *   member granularity.
 *
 * `NX` and `GT` cannot be combined in one `EXPIRE`, and `GT` alone is inert:
 * Redis treats a key with **no** TTL as having an *infinite* one, so `GT` always
 * refuses it and the key would simply never expire. That is a real trap — it
 * looks like a working guard and silently bounds nothing (#276 review cycle 2).
 *
 * `KEYS[1]` index key · `ARGV[1]` ttl seconds · `ARGV[2]` connection id ·
 * `ARGV[3]` the index key's own TTL.
 */
const MARK_REVOKED_SCRIPT: string = [
    "local t = redis.call('TIME')[1]",
    "redis.call('ZADD', KEYS[1], 'GT', t + ARGV[1], ARGV[2])",
    "redis.call('EXPIRE', KEYS[1], ARGV[3], 'NX')",
    "redis.call('EXPIRE', KEYS[1], ARGV[3], 'GT')",
].join('\n')

/**
 * Reap expired revocations and return the live ones — ONE operation, ONE
 * `now`.
 *
 * Both halves are bounded by the same `t`, so every member the enumeration
 * returns has a score strictly greater than the bound the reap just used: a
 * live revocation cannot be removed, whatever else is happening concurrently
 * (#276 FR-001). Nothing is read in an earlier round-trip and acted on in a
 * later one, which is the shape the previous `EXISTS`-then-`SREM` had.
 *
 * `KEYS[1]` index key.
 */
const LIST_REVOKED_SCRIPT: string = [
    "local t = redis.call('TIME')[1]",
    "redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', t)",
    "return redis.call('ZRANGEBYSCORE', KEYS[1], t, '+inf')",
].join('\n')

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
    /**
     * OPTIONAL (#271/FR-004). Register a handler invoked after a fault-triggered
     * reconnect has re-issued every active subscription.
     *
     * Optional on the type so a subscriber that predates the seam — or a test
     * double that has no socket to lose — still satisfies this port. When it is
     * absent the driver falls back to its periodic revocation reconcile alone,
     * which is exactly #268's shipped behaviour.
     *
     * @param handler - Called with no arguments after each successful reconnect.
     */
    onReconnect?(handler: () => void | Promise<void>): void
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

/**
 * Redis glob metacharacters. A prefix carrying one of these is refused (#282).
 *
 * The prefix reaches `PSUBSCRIBE` at two sites — the event pattern and the
 * control topic — and both are **pattern** contexts, not literal ones. A `*` in
 * the prefix therefore widens the subscription to traffic the deployment does
 * not own, and it does so while remaining trivially "anchored" under any
 * `startsWith` check, so a containment test alone will not catch it.
 *
 * `packages/redis/tests/live_broker.ts:157-172` already applies this discipline
 * to the test harness's own namespace, with the reasoning written out. The
 * driver did not apply it to the operator's prefix until now.
 *
 * **All five, and the fifth is the nastiest.** A first version listed four and
 * omitted `\\`. A prefix of `app\\` yields `PSUBSCRIBE app\\:*`, which Redis
 * reads as the literal `app:*` — so that deployment subscribes to another one's
 * entire event stream **while its own traffic stays invisible to that
 * deployment**, i.e. the asymmetry hides it from whoever would notice. It also
 * corrupts the #273 reaper's `SCAN MATCH app\\*` into a literal, so its keys are
 * never reaped.
 */
const PREFIX_GLOB_CHARS: readonly string[] = ['*', '?', '[', ']', '\\']

/**
 * Refuse a prefix that would widen a subscription.
 *
 * @param prefix - The configured prefix.
 * @throws {Error} If it contains a Redis glob metacharacter, or is empty.
 */
function assertUsablePrefix(prefix: string): void {
    if (prefix.length === 0) {
        throw new Error(
            'RedisBroadcastDriver: prefix must not be empty — every key and ' +
                'topic is derived from it',
        )
    }
    for (const char of PREFIX_GLOB_CHARS) {
        if (prefix.includes(char)) {
            throw new Error(
                `RedisBroadcastDriver: prefix must not contain the Redis glob ` +
                    `character "${char}" — it is interpolated into PSUBSCRIBE ` +
                    `patterns, where it would widen the subscription to traffic ` +
                    `this deployment does not own`,
            )
        }
    }
}

/** Options for the Redis broadcast driver. */
export interface RedisBroadcastDriverOptions {
    /**
     * Reserved name prefix for every key and topic this driver derives.
     *
     * **Not an isolation boundary**, despite what this docstring said until
     * #282. It scopes what this driver *writes and subscribes to*; it does not
     * stop anything else on the broker publishing into `${prefix}:<channel>` —
     * see this file's header. Calling it "multi-tenant isolation" is what would
     * lead an operator to give two deployments nested prefixes, which is not
     * safe: a glob matches `:` like any other character.
     *
     * Must contain no Redis glob metacharacter. It is interpolated into
     * `PSUBSCRIBE` patterns, where `*`, `?` or `[` would widen the subscription
     * to traffic the deployment does not own, so one is refused at construction.
     *
     * @default "lockness:realtime"
     */
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

/**
 * A fresh control-frame nonce: 16 CSPRNG bytes, hex-encoded to a fixed width.
 *
 * A counter would be cheaper and is the wrong choice twice over: it collides
 * across senders (two instances both start at 1), and it collides with itself
 * after a restart (back to 1, inside a live window). Unpredictability is not
 * what the anti-replay property requires — an attacker cannot forge a MAC over
 * a nonce of their choosing — it is simply how uniqueness is obtained across
 * processes without coordination.
 *
 * @returns A 32-character lowercase hex string.
 */
function newControlNonce(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Whether a control frame's `member` is a plain, small presence member.
 *
 * `member` was the one field the ingest shape gate never checked, and it is the
 * one an attacker can make arbitrarily large — which matters because everything
 * downstream of the gate re-serialises it and hashes it synchronously
 * (FR-011). `undefined` is valid: an `evict` frame carries no member.
 *
 * @param value - The candidate, straight off the wire.
 * @returns Whether it is safe to canonicalise.
 */
function isPlainMember(value: unknown): boolean {
    if (value === undefined) return true
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false
    }
    const member = value as { id?: unknown; info?: unknown }
    const idOk = typeof member.id === 'string' || typeof member.id === 'number'
    const infoOk = member.info === undefined ||
        (typeof member.info === 'object' && member.info !== null &&
            !Array.isArray(member.info))
    return idOk && infoOk && Object.keys(member).length <= 2
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
    /**
     * Epoch milliseconds at issue (#272). Inside the MAC — outside it, an
     * attacker could re-date a captured frame and the window would be
     * decorative.
     */
    ts: number
    /**
     * A per-frame CSPRNG value (#272). Inside the MAC, for the same reason.
     * Unpredictability is not what the anti-replay property needs — an attacker
     * cannot forge a MAC over a nonce of their choosing — but a CSPRNG is how
     * uniqueness survives a restart and holds across instances without
     * coordination. A counter would collide across senders and again after
     * every restart.
     */
    nonce: string
    mac?: string
}

const DEFAULT_LIVENESS_TTL_SECONDS = 15
const DEFAULT_HEARTBEAT_INTERVAL_MS = 5_000
const DEFAULT_RECONCILE_INTERVAL_MS = 10_000
const DEFAULT_REVOCATION_TTL_SECONDS = 300
/**
 * How long after issue a control frame may still be obeyed (#272). See
 * `RealtimeControlConfig.windowMs` for why 30s and what widening it costs.
 */
const DEFAULT_CONTROL_WINDOW_MS = 30_000
/**
 * The byte ceiling on a control payload, checked BEFORE `JSON.parse` and before
 * any MAC computation.
 *
 * A control frame is a kind, two names and a small member — kilobytes at the
 * outside. Without this bound an unauthenticated PUBLISH costs every instance
 * in the fleet a parse, a re-serialise and a *synchronous, pure-JS* SHA-256
 * (`hmacSha256Hex`) over attacker-chosen bytes, on the event loop, before the
 * MAC has had a chance to reject it. The RESP reader already caps a frame at
 * 10MB, so this is an amplifier rather than an unbounded one — but 10MB of
 * blocking hash per packet, multiplied by instance count, is not a cost the MAC
 * check contains.
 */
const DEFAULT_MAX_CONTROL_PAYLOAD_BYTES = 8 * 1024
/** The exact width of a hex-encoded 16-byte nonce. */
const CONTROL_NONCE_HEX_LENGTH = 32
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
 * What {@link RedisBroadcastDriver.fromConfig} accepts: a Redis client config,
 * plus the subscribe socket's liveness and retry cadences.
 *
 * The cadences are here because they were otherwise **unreachable**. `fromConfig`
 * builds the `RedisSubscribeConnection` itself, so an application had no way to
 * pass one — and because every field is optional, a literal carrying
 * `keepaliveMs` was rejected as an excess property rather than silently ignored.
 * `packages/redis/README.md` documents these four by name, and a documented knob
 * nobody can set is a README that lies.
 */
export type RedisBroadcastConnectionConfig =
    & RedisClientConfig
    & Pick<
        RedisSubscribeConnectionConfig,
        'keepaliveMs' | 'livenessMs' | 'retryBaseMs' | 'retryMaxMs'
    >

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
    /**
     * The anti-replay window (#272) — the single home for whether a control
     * frame is fresh, whether it has been seen, and what makes two frames the
     * same frame. Absent when no control secret is configured, because the
     * control plane is then refused at both ends anyway.
     */
    private readonly replayWindow: ControlReplayWindow | undefined
    /** The control-payload byte ceiling, enforced on BOTH publish and ingest. */
    private readonly maxControlPayloadBytes: number
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
     * @throws {Error} When `control.windowMs`, `control.maxPayloadBytes` or
     *   `control.maxEntries` is not a positive, finite value — each bounds a
     *   cost paid on every ingest, and a zero or negative bound is a
     *   misconfiguration that would disable the check rather than tighten it.
     * @throws {Error} When `prefix` contains a Redis glob metacharacter
     *   (`*`, `?`, `[`, `]`, `\\`) — such a prefix is `startsWith`-anchored but
     *   its subscribe pattern reaches into other deployments (#282).
     */
    constructor(
        private readonly command: RedisCommandClient,
        private readonly subscriber: RedisSubscriber,
        options: RedisBroadcastDriverOptions = {},
    ) {
        this.prefix = options.prefix ?? 'lockness:realtime'
        assertUsablePrefix(this.prefix)
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
        // The window is built only when a control secret exists: without one
        // the control plane refuses to publish and refuses to verify, so there
        // is nothing to remember. The clock is supplied HERE, once — the class
        // requires it rather than defaulting, so production and tests share one
        // path through the seam.
        const windowMs = options.control?.windowMs ?? DEFAULT_CONTROL_WINDOW_MS
        // Validated at boot, like the secret above it. `NaN` is the dangerous
        // one and it is easy to produce — `Number(Deno.env.get('...'))` on an
        // unset variable — because `Math.abs(x) > NaN` is false for every
        // frame, which silently disables the freshness check and quietly
        // restores the pre-#272 posture on a fresh process. Zero or negative
        // does the opposite and drops every frame.
        if (!Number.isFinite(windowMs) || windowMs <= 0) {
            throw new Error(
                'realtime: control.windowMs must be a positive, finite number ' +
                    `of milliseconds (#272) — got ${windowMs}. A NaN here ` +
                    'disables the anti-replay freshness check silently.',
            )
        }
        const maxPayloadBytes = options.control?.maxPayloadBytes ??
            DEFAULT_MAX_CONTROL_PAYLOAD_BYTES
        if (!Number.isFinite(maxPayloadBytes) || maxPayloadBytes <= 0) {
            throw new Error(
                'realtime: control.maxPayloadBytes must be a positive, finite ' +
                    `byte count (#272) — got ${maxPayloadBytes}.`,
            )
        }
        this.maxControlPayloadBytes = maxPayloadBytes
        const maxEntries = options.control?.maxEntries
        if (
            maxEntries !== undefined &&
            (!Number.isInteger(maxEntries) || maxEntries < 1)
        ) {
            throw new Error(
                'realtime: control.maxEntries must be a positive integer ' +
                    `entry count (#283) — got ${maxEntries}.`,
            )
        }
        this.replayWindow = this.secret === undefined
            ? undefined
            : new ControlReplayWindow({
                windowMs,
                now: () => this.now(),
                maxEntries,
            })
    }

    /**
     * This instance's clock, in epoch milliseconds — the single home for the
     * time a control frame is stamped with and checked against. Two direct
     * `Date.now()` calls, one on publish and one on verify, would be two clocks
     * that must agree.
     */
    private now(): number {
        return Date.now()
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
        config: RedisBroadcastConnectionConfig,
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

    /**
     * The revocation index: a sorted set, member = connection id, **score = the
     * epoch second the revocation expires** (#276).
     *
     * A NEW key name, deliberately. The legacy `{prefix}:revoked` is a SET, and
     * reusing that name for a sorted set would make an old instance's `SADD`
     * raise `WRONGTYPE` inside `evict()` — whose first await is untried, so the
     * error would propagate to the caller and the local revoke would never run.
     */
    private get revocationIndexKey(): string {
        return `${this.prefix}:revocations`
    }

    /** The legacy index SET, read during rollout only (#276 FR-009). */
    private get legacyRevokedIndexKey(): string {
        return `${this.prefix}:revoked`
    }

    /** The legacy per-target marker key, read during rollout only. */
    private legacyRevokedKey(target: string): string {
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
            ts: this.now(),
            nonce: newControlNonce(),
        }
        wire.mac = this.#sign(wire)
        const payload = JSON.stringify(wire)
        // Enforced on PUBLISH as well as on ingest, and this half is the one
        // that matters operationally. Every receiver rejects an oversized frame
        // — so without this check an app whose `PresenceMember.info` grew past
        // the ceiling would publish happily, update the roster, and have every
        // remote instance silently drop the frame. The WARN would appear on the
        // instances that cannot fix it, and never on the one that can.
        if (payload.length > this.maxControlPayloadBytes) {
            console.warn(
                'realtime: refusing to publish an oversized control message ' +
                    `(${payload.length} bytes > ` +
                    `${this.maxControlPayloadBytes}). Every peer would drop ` +
                    'it, so this instance drops it here where the cause is ' +
                    'visible. Shrink the presence member, or raise ' +
                    'control.maxPayloadBytes on EVERY instance.',
            )
            return
        }
        await this.command.command('PUBLISH', this.controlTopic, payload)
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
                    `realtime: skipped a malformed roster entry on ${
                        safeForLog(channel)
                    }: ${renderError(error)}`,
                )
            }
        }
        return members
    }

    /**
     * OPTIONAL (S1/FR-014). Durably record that a connection is revoked.
     *
     * The record is **one** sorted-set member whose score is the second it
     * expires (#276) — not a marker key plus a separate index entry, which were
     * two structures encoding one fact and could be made to disagree. It is
     * written by {@link MARK_REVOKED_SCRIPT} in a single operation, so there is
     * no window in which the connection is enumerable but not yet revoked.
     * Decision-table home: "whether a revoked connection stays revoked across a
     * reconnect".
     *
     * @param target - The revoked connection id.
     * @throws {Error} If the write fails — `ChannelManager.evict` revokes the
     *   socket anyway and re-throws, so the caller learns durability was lost.
     */
    async markRevoked(target: string): Promise<void> {
        await this.command.command(
            'EVAL',
            MARK_REVOKED_SCRIPT,
            '1',
            this.revocationIndexKey,
            String(this.revocationTtlSeconds),
            target,
            String(this.revocationTtlSeconds + INDEX_TTL_SLACK_SECONDS),
        )
    }

    /**
     * OPTIONAL (S1/FR-014). The connection ids whose revocation is live now,
     * reaping expired entries so the index stays bounded (#276 FR-002/FR-003).
     *
     * Reap and enumeration happen inside ONE script, against ONE `now` read from
     * Redis — so every surviving member's score is strictly greater than the
     * bound the reap just used, and a live revocation is unremovable. There is
     * no earlier round-trip whose result could go stale before it is acted on.
     *
     * During rollout it also reads the legacy structure (FR-009) so a revocation
     * written by a not-yet-upgraded instance is still enumerated. Only the new
     * index is reaped; legacy markers expire on their own TTL.
     *
     * @returns The currently-revoked connection ids.
     * @example
     * ```ts
     * for (const id of await driver.listRevoked()) { /* revoke if local *\/ }
     * ```
     */
    async listRevoked(): Promise<string[]> {
        const reply = await this.command.command(
            'EVAL',
            LIST_REVOKED_SCRIPT,
            '1',
            this.revocationIndexKey,
        )
        const members = asArray(reply)
        if (members === undefined) {
            // "Nobody is revoked" and "the reply was not the shape we expect"
            // must not look the same to a caller: the first is routine, the
            // second means every revocation this instance owns goes unenforced.
            console.warn(
                'realtime: the revocation index returned an unexpected reply ' +
                    'shape — treating it as empty, so no revocation will be ' +
                    'recovered on this pass',
            )
        }
        const live = new Set<string>()
        for (const raw of members ?? []) {
            const id = asBulk(raw)
            if (id) live.add(id)
        }
        for (const id of await this.#legacyRevoked()) live.add(id)
        return [...live]
    }

    /**
     * The legacy two-structure revocations still live, read during rollout only.
     *
     * Read, never reaped and never written: a not-yet-upgraded instance is still
     * maintaining these, and reaping them from here would reintroduce exactly
     * the cross-round-trip removal #276 removes. They expire on their own `EX`,
     * and the legacy index set is left as one abandoned key.
     */
    async #legacyRevoked(): Promise<string[]> {
        const reply = await this.command.command(
            'SMEMBERS',
            this.legacyRevokedIndexKey,
        )
        const live: string[] = []
        for (const raw of asArray(reply) ?? []) {
            const id = asBulk(raw)
            if (!id) continue
            const exists = asInteger(
                await this.command.command(
                    'EXISTS',
                    this.legacyRevokedKey(id),
                ),
            )
            if (exists === 1) live.push(id)
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
        // The SECOND trigger (#271): the subscribe socket coming back is the
        // routine moment an `evict` frame was lost, so re-check immediately
        // rather than waiting up to `reconcileIntervalMs`. Registered HERE, in
        // the same method as the timer — "when the revocation re-check runs" has
        // one home, and a future non-revocation consumer of the reconnect signal
        // does not belong in it. Routed through `#runRevocationReconcile` (not
        // the raw handler) so both triggers share its contextual WARN, the only
        // log line naming WHICH control failed.
        this.subscriber.onReconnect?.(() => this.#runRevocationReconcile())
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
                `realtime: revocation reconcile failed: ${renderError(error)}`,
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
            // #272: both inside the MAC. A field on the wire but absent here
            // ships UNAUTHENTICATED, and no test in this package could detect
            // that before FR-013 — see tests/control_mac_coverage.test.ts.
            ts: wire.ts,
            nonce: wire.nonce,
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
        // COST GATE, before `JSON.parse` and before any hashing (#272/FR-011).
        // `hmacSha256Hex` is a synchronous, pure-JS SHA-256 that allocates
        // twice the message length, so without this bound one unauthenticated
        // PUBLISH costs every instance in the fleet a parse, a re-serialise and
        // a blocking hash over attacker-chosen bytes. The RESP reader caps a
        // frame at 10MB; that is an amplifier, not a containment.
        if (payload.length > this.maxControlPayloadBytes) {
            console.warn(
                'realtime: dropped an oversized control payload ' +
                    `(${payload.length} bytes > ${this.maxControlPayloadBytes})`,
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
            typeof wire.origin !== 'string' || typeof wire.mac !== 'string' ||
            // #272/FR-012. `Number.isInteger` rather than `typeof === 'number'`:
            // `1e400` parses to `Infinity`, and `JSON.stringify` collapses
            // `Infinity`, `-Infinity` and `null` to the same bytes — three
            // distinct wire values sharing one MAC. Not reachable today, and
            // one predicate away from never being reachable.
            !Number.isInteger(wire.ts) ||
            // An object nonce would be compared by identity in the replay
            // store, so every replay would be a fresh key: duplicate detection
            // fails silently while the store grows.
            typeof wire.nonce !== 'string' ||
            wire.nonce.length !== CONTROL_NONCE_HEX_LENGTH ||
            // The one field the shape gate never checked, and the one an
            // attacker can make arbitrarily large (FR-011).
            !isPlainMember(wire.member)
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
        // FR-019: re-validate the routing names on ingest. `origin` joins them
        // (#272): it is always a `crypto.randomUUID()` from a legitimate
        // signer, so this rejects nothing real.
        //
        // The replay WARNs below still run `origin` through `safeForLog`
        // (#277). This guard already constrains the charset, so the encoder
        // rejects nothing either — that is the point. An allowlist upstream and
        // an encoder at the sink are independent controls, and the encoder is
        // the one that survives a future caller reaching those WARNs down a
        // path that does not pass through here.
        if (
            !isValidName(wire.target) || !isValidName(wire.origin) ||
            (wire.channel !== undefined && !isValidName(wire.channel))
        ) {
            console.warn(
                'realtime: dropped a control message with an invalid name',
            )
            return undefined
        }
        // #272: anti-replay, LAST — strictly after the MAC. Admitting an
        // unauthenticated frame would let anyone with bus PUBLISH write into
        // the replay store, trading one weakness for a worse one. The verdict
        // is mapped to a message here rather than logged by the window itself,
        // so every drop reason has one home (this guard chain).
        const verdict = this.replayWindow?.admit(
            wire.origin,
            wire.nonce,
            wire.ts,
        )
        if (verdict === 'stale') {
            const skewMs = this.now() - wire.ts
            console.warn(
                'realtime: dropped a STALE control message — never obeyed ' +
                    `(#272). Issued ${skewMs}ms ago by origin ` +
                    `${safeForLog(wire.origin)}; a large or negative value ` +
                    'here is clock skew between instances, not a dead bus.',
            )
            return undefined
        }
        if (verdict === 'duplicate') {
            console.warn(
                'realtime: dropped a DUPLICATE control message — never ' +
                    `obeyed (#272). Origin ${
                        safeForLog(wire.origin)
                    } already ` +
                    'delivered this exact frame inside the freshness window.',
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
                    renderError(error)
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
                `realtime: roster reconcile failed: ${renderError(error)}`,
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
            `realtime: swept ${swept} ghost member(s) of dead instance ${
                safeForLog(deadId)
            }`,
        )
    }

    /**
     * Release the connections this driver constructed itself (via
     * {@link fromConfig}) — the subscribe socket first (stops the push read
     * loop), then the command client (drains its QUIT) — and stop the sweep
     * timers. Does NOT proactively drop this instance's roster members: a real
     * crash cannot, so its liveness key simply expires and a surviving instance
     * sweeps it (that is what {@link close} models in the sweep tests).
     * Idempotent; for an injected-port driver it stops the timers and drops the
     * revocation handler, so a later reconnect on the app-owned subscriber
     * revokes nothing (FR-007).
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
        // Clearing the timer is not enough for the RECONNECT trigger (#271): on
        // the injected-port path `owned` is empty, so the subscriber outlives
        // this driver and can still fire. Dropping the handler makes
        // `#runRevocationReconcile`'s existing guard the ONE gate that quiesces
        // both triggers on both construction paths.
        this.revocationHandler = undefined
        for (const resource of this.owned) {
            await resource.close()
        }
    }
}
