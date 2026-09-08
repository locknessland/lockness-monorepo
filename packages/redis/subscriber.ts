/**
 * @fileoverview A Redis connection in **subscribe mode** — the exclusive-mode
 * socket the serialized-command {@link RedisClient} deliberately is not (#268,
 * plan §5 "enter subscribe mode").
 *
 * After `PSUBSCRIBE` a Redis connection accepts only
 * (P)SUBSCRIBE/(P)UNSUBSCRIBE/PING/QUIT and receives push frames unbidden — the
 * opposite of the one-request/one-reply discipline `RedisClient` enforces on its
 * shared socket. The two cannot share a socket, so this connection opens its
 * OWN, through the same {@link AuthenticatedConnection} primitive (FR-013): the
 * dial + TLS + `AUTH`/`SELECT` handshake + cleartext-AUTH warning + self-heal are
 * shared; the command discipline is not.
 *
 * What lives here (and only here):
 *
 * - **Entering subscribe mode.** {@link RedisSubscribeConnection.psubscribe}
 *   issues `PSUBSCRIBE` and starts a read loop over the bounded `resp.ts` reader
 *   (`readReply`, FR-002/FR-019) — no second RESP parser, no hand-rolled push
 *   framing.
 * - **Which subscriptions to re-issue on reconnect (FR-003).** The connection
 *   holds its own live-pattern set and, on a wire fault, reconnects and re-issues
 *   **every** active `PSUBSCRIBE`, logged at WARN — delivery resumes without app
 *   intervention and never silently.
 * - **What counts as a reconnect (#271/FR-001/FR-002).** A reconnect is a
 *   fault-triggered re-open whose patterns were re-issued — not a first connect,
 *   and not a re-open that failed. The distinction is structural rather than
 *   inferred — but it is a property of the OUTAGE, not of the caller (#290).
 *   The read loop's fault and a stalled keepalive record a reconnect intent;
 *   whichever activation then SUCCEEDS consumes it and fires
 *   {@link RedisSubscribeConnection.onReconnect}, whether that activation came
 *   from the retry timer or from an ordinary `psubscribe`. Deciding by entry
 *   point instead meant a user joining a room could be the call that healed a
 *   broker, and the seam then fired up to `retryMaxMs` late. Consumers that must
 *   reconcile what a lost pub/sub frame would have carried hang off that seam.
 *
 * It satisfies `@lockness/realtime`'s `RedisSubscriber` port structurally
 * (`psubscribe(pattern, handler)`), so the broadcast driver consumes it without
 * importing this class.
 *
 * @module @lockness/redis/subscriber
 */

import { renderError, safeForLog } from '@lockness/contract'
import {
    deregisterDisposable,
    type DisposableHandle,
    registerDisposable,
} from '@lockness/contract/lifecycle/internal'
import {
    AuthenticatedConnection,
    type AuthenticatedConnectionConfig,
} from './connection.ts'
import {
    encodeCommand,
    readReply,
    RespCommandTooLargeError,
    RespFramingError,
    type RespReply,
    WRITE_STALL_CEILING_MS,
    writeFrame,
} from './resp.ts'

/**
 * The default shutdown-drain priority for the subscribe socket's disposable.
 * Mirrors the {@link RedisClient} default so lifecycle ordering is consistent.
 */
const DEFAULT_DISPOSABLE_PRIORITY = 60

/**
 * How often a `PING` is written on an otherwise-idle subscribe socket.
 *
 * A subscribe socket idles by design, so silence proves nothing on its own. The
 * keepalive is what makes a healthy peer produce a frame inside
 * {@link DEFAULT_LIVENESS_MS} — which turns that deadline from a false-positive
 * generator (#274: ~2 880 teardowns per instance per day) into a real liveness
 * signal.
 */
const DEFAULT_KEEPALIVE_MS = 15_000

/**
 * The longest silence — from any cause — that is not treated as a fault.
 *
 * Three keepalive intervals, so two consecutive lost pongs are tolerated before
 * the socket is declared dead. It bounds the WHOLE activation, handshake
 * included: `AUTH`/`SELECT` would otherwise inherit the command path's 30s
 * default and make half the window an incidental number (#274, FR-014).
 */
const DEFAULT_LIVENESS_MS = 45_000

/** The first retry delay after a failed activation, before backoff. */
const DEFAULT_RETRY_BASE_MS = 250

/**
 * The backoff ceiling. Retries are **unbounded in count** — going deaf is the
 * defect (#275), so exhaustion is not an outcome — but bounded in interval.
 */
const DEFAULT_RETRY_MAX_MS = 30_000

/**
 * The minimum ratio between the liveness window and the keepalive interval.
 *
 * A strict `>` would admit `keepalive + 1`, in which the keepalive can never
 * arrive in time on any broker with non-zero RTT — inverting the fix into the
 * permanent churn it exists to remove.
 */
const MIN_LIVENESS_RATIO = 2

/** A push-message handler: called with `(topic, payload)` per delivered frame. */
type MessageHandler = (topic: string, payload: string) => void

/**
 * A reconnect handler: called with no arguments once a fault-triggered reconnect
 * has re-issued every active `PSUBSCRIBE`. Deliberately **nullary** — the seam
 * carries no topic, no payload, and no peer-supplied byte, so nothing a Redis
 * peer controls crosses it (#271, plan §6 invariants). Unexported, like
 * {@link MessageHandler}, so the package's public surface gains one method and
 * no new type name.
 */
type ReconnectHandler = () => void | Promise<void>

/** Connection settings for a {@link RedisSubscribeConnection}. */
export interface RedisSubscribeConnectionConfig
    extends AuthenticatedConnectionConfig {
    /**
     * The name the socket's shutdown disposable registers under.
     * @default "redis-subscribe"
     */
    disposableName?: string
    /**
     * The shutdown-drain priority of the socket's disposable.
     * @default 60
     */
    disposablePriority?: number
    /**
     * How often to write a keepalive `PING`, in milliseconds.
     * @default 15000
     */
    keepaliveMs?: number
    /**
     * The longest silence tolerated before the socket is declared dead, in
     * milliseconds. Must be at least twice `keepaliveMs`.
     * @default 45000
     */
    livenessMs?: number
    /**
     * The first retry delay after a failed activation, in milliseconds.
     * @default 250
     */
    retryBaseMs?: number
    /**
     * The backoff ceiling, in milliseconds. Retries never stop; they only slow.
     * @default 30000
     */
    retryMaxMs?: number
}

/**
 * A subscribe-mode Redis connection that pushes messages for topic patterns.
 *
 * Structurally implements `@lockness/realtime`'s `RedisSubscriber` port: call
 * {@link RedisSubscribeConnection.psubscribe} with a pattern and a
 * `(topic, payload)` handler, and every matching published message is delivered
 * on this connection's own socket. A wire fault self-heals — reconnect and
 * re-issue every active pattern — with a WARN, never silently.
 *
 * @example
 * ```typescript
 * const sub = new RedisSubscribeConnection({ hostname: 'localhost' })
 * sub.onReconnect(() => reconcileWhateverTheLostFramesCarried())
 * sub.psubscribe('lockness:realtime:*', (topic, payload) => {
 *   // deliver `payload` for `topic`
 * })
 * // …later
 * await sub.close()
 * ```
 */
/**
 * Everything released together when a socket is dropped.
 *
 * **This type IS the list** (plan §5). A resource whose lifetime ends with the
 * socket goes in here; one that does not stays a field of
 * {@link RedisSubscribeConnection}. That is what one ownership check buys over
 * one guard per field, and the file's own history is the argument for it: the
 * keepalive learned the guard after an unconditional clear disarmed a LIVE
 * socket's timer and brought the #274 idle churn silently back, and #286 then
 * hit the identical shape one field over for the write chain. A third field
 * learning it the same way is what #298 exists to stop.
 *
 * **The criterion is "released together", not "lives as long as"** — read off a
 * field's INSTALL MOMENT, not its name. Four per-socket fields are deliberately
 * not members:
 *
 * - `loopConn` — installed at a different moment (after the awaited writes and
 *   after the ownership re-check), and it answers "is a read loop draining this
 *   socket", not "which socket owns this". A phase flag, not an identity shadow.
 *   Folding it in makes the read-loop start unreachable and the connection deaf
 *   with a clean log.
 * - `loopDone` — never released; `close()` awaits it AFTER the discard, which is
 *   its whole purpose.
 * - `#loopStartedAt` — never released; read after a discard by `#reportRecovery`.
 * - `#handlerFaults` — released UNCONDITIONALLY, and reachable from a deferred
 *   `.catch` that can run once the generation is already gone. Owning it would
 *   make it either a `TypeError` thrown inside a `.catch` or an un-throttled
 *   peer-driven flood.
 *
 * **The subscription record is a member, and it has to be** (#295). "Which
 * patterns are on THIS socket" is released with the socket by definition: a
 * fresh socket has confirmed nothing. Keeping it on the connection instead
 * would let it survive a socket change and claim patterns are live on a socket
 * that never received them — #245 exactly.
 *
 * **Release is a CALL, not a reference drop.** `keepaliveTimer` is a
 * `setInterval` id: dropping the object frees the field and leaves the interval
 * running forever — the member this issue was filed about is the one a plain
 * drop leaks. So the interval is owned here and cleared here, and nothing
 * outside this type calls `clearInterval`.
 */
class SocketGeneration {
    /**
     * The socket this generation IS. Never re-pointed: a new socket is a new
     * generation. Rebasing it in place would leave one object claiming to be the
     * new socket while its timer pings the old one, after which the single
     * ownership check answers about the wrong resources.
     */
    readonly conn: Deno.Conn
    /**
     * The write queue for this generation. Every frame reaching the socket is
     * appended here, so `PSUBSCRIBE`, the keepalive `PING` and a retry's
     * re-issue can never interleave at a short-write boundary — and a new
     * socket's first frame never queues behind a dead socket's backlog, which
     * would make the recovery wait for the thing it is recovering from.
     *
     * The interleaving that matters is not the noisy one: a corrupted frame
     * Redis rejects self-heals through the read loop's fault path. A corrupted
     * frame that is still VALID — a `PSUBSCRIBE` on a truncated pattern — raises
     * nothing, and `#dispatch` then routes by the pmessage's own pattern value,
     * so every frame is silently dropped forever.
     */
    #writeChain: Promise<void> = Promise.resolve()
    /** The keepalive interval's id, or `undefined` when none is armed. */
    #keepaliveTimer: ReturnType<typeof setInterval> | undefined
    /**
     * Patterns whose `PSUBSCRIBE` is on this generation's write chain but which
     * the broker has not answered yet (#295).
     *
     * A `Set` suffices although a pattern can be watched and unwatched many
     * times over one socket: {@link claim} is reachable only where {@link has}
     * is false, so **at most one claim per pattern is ever outstanding**. The
     * guard enforces the cardinality, not the container.
     */
    #pending = new Set<string>()
    /**
     * Patterns the broker has ACKNOWLEDGED on this socket (#295) — `+psubscribe`
     * arrived and was routed here.
     *
     * Acknowledged, never merely written. An activation awaits only that its
     * frame reached the socket; #245 is what happens when "recorded" is allowed
     * to mean "written".
     */
    #issued = new Set<string>()

    /** @param conn - The socket this generation owns. */
    constructor(conn: Deno.Conn) {
        this.conn = conn
    }

    /**
     * Append a write to this generation's queue and hand back its promise.
     *
     * The queue is private and appended only through here, so a caller cannot
     * reset it — `conn` is `readonly` for the same reason, and a mutable public
     * chain beside an immutable identity was the asymmetry two review seats
     * picked up independently. The chain is kept alive across a rejection, so
     * one failed write cannot wedge the queue for the recovery that follows it.
     *
     * @param write - The write to run once the queue drains.
     * @returns The write's own promise — rejections belong to the caller.
     */
    enqueue(write: () => Promise<void>): Promise<void> {
        const next = this.#writeChain.then(write)
        this.#writeChain = next.then(
            () => {},
            () => {},
        )
        return next
    }

    /**
     * Arm the keepalive, clearing any interval this generation already holds.
     *
     * Clear-then-store rather than store: an interval orphaned by an overwritten
     * id is unreachable forever, and being unref'd it would not even keep the
     * process alive to be noticed.
     *
     * @param id - The interval to adopt.
     */
    armKeepalive(id: ReturnType<typeof setInterval>): void {
        this.clearKeepalive()
        this.#keepaliveTimer = id
    }

    /** Whether this generation already holds a keepalive interval. */
    get hasKeepalive(): boolean {
        return this.#keepaliveTimer !== undefined
    }

    /** Stop this generation's keepalive interval, if one is armed. */
    clearKeepalive(): void {
        if (this.#keepaliveTimer !== undefined) {
            clearInterval(this.#keepaliveTimer)
            this.#keepaliveTimer = undefined
        }
    }

    /**
     * Record that a `PSUBSCRIBE` for `pattern` is going on this socket's wire.
     *
     * **Call this in the SAME SYNCHRONOUS TURN as the enqueue** — the
     * `patterns.has` re-read that precedes it, this call, and that pattern's
     * `enqueue` are one turn, and nothing awaits between them. The record and
     * the write chain agree only if every mutation is co-turn with its frame,
     * and that is the whole correctness argument for these two sets. An `await`
     * slipped in here lets an unwatch put `PUNSUBSCRIBE` on the chain FIRST:
     * the broker ends subscribed, {@link has} answers false and the desired-set
     * entry is gone — a live subscription with no handler, for the life of the
     * socket, with nothing logged.
     *
     * @param pattern - The pattern whose frame is being enqueued.
     */
    claim(pattern: string): void {
        this.#pending.add(pattern)
    }

    /**
     * Promote a claimed pattern to acknowledged, on the broker's `+psubscribe`.
     *
     * **A retired claim makes the acknowledgement stale, and it is dropped.**
     * Redis answers in order, so the `+psubscribe` for a subscribe that was
     * unwatched meanwhile lands *after* {@link retire} — recording it
     * unconditionally would re-assert a pattern the broker no longer holds, and
     * the next watch would then be skipped against a subscription that does not
     * exist. That is the whole reason these sets are private: a bare
     * `issued.add` at the call site is how the rule goes missing.
     *
     * With a re-watch outstanding the acknowledgement legitimately consumes the
     * NEW claim. That is safe rather than merely tolerable: this method can only
     * move a pattern from pending to issued, so it never changes what
     * {@link has} answers, and nothing reads the distinction between the two
     * sets.
     *
     * @param pattern - The pattern the broker acknowledged.
     */
    confirm(pattern: string): void {
        if (!this.#pending.delete(pattern)) return
        this.#issued.add(pattern)
    }

    /**
     * Erase every trace of `pattern` from this generation — the claim AND the
     * acknowledged fact.
     *
     * **Both halves, and at the `PUNSUBSCRIBE` ENQUEUE rather than at its
     * acknowledgement.** Clearing only the acknowledged half leaves a channel
     * unwatched inside one broker round trip still claimed, so the re-watch is
     * skipped and the socket is deaf for its lifetime — and the burst path the
     * claim exists for is precisely the path that fills it. Erasing at the
     * acknowledgement instead would let a re-watch inside the round trip lose
     * its handler under a live subscription.
     *
     * The asymmetry to remember is not between the two sets: **a write to this
     * record is acknowledged, an erasure is enqueued.**
     *
     * @param pattern - The pattern being unsubscribed.
     */
    retire(pattern: string): void {
        this.#pending.delete(pattern)
        this.#issued.delete(pattern)
    }

    /**
     * Whether `pattern` is already on this socket — claimed or acknowledged.
     *
     * The only reader of either set, and what makes an activation issue a
     * difference rather than the whole recorded set.
     *
     * @param pattern - The pattern to test.
     * @returns `true` when a frame for it is in flight or confirmed.
     */
    has(pattern: string): boolean {
        return this.#pending.has(pattern) || this.#issued.has(pattern)
    }

    /**
     * How many patterns this socket carries — claimed plus acknowledged.
     *
     * For reporting only. It is the honest figure for "subscriptions re-issued"
     * after a recovery, where the desired-set size is not: that counts what the
     * caller WANTS, which on a live socket an activation may have issued none
     * of.
     */
    get size(): number {
        return this.#pending.size + this.#issued.size
    }

    /**
     * Release everything this generation owns — the single "this socket's
     * resources are finished".
     */
    release(): void {
        this.clearKeepalive()
        this.#writeChain = Promise.resolve()
        this.#pending.clear()
        this.#issued.clear()
    }
}

/**
 * Why a queued frame was dropped. One constant, because the entry refusal and
 * the in-closure refusal are the same fact told at two moments, and a caller
 * matching on the text must not have to know which one fired.
 */
const ABANDONED_WRITE =
    'Redis write abandoned: the socket generation changed while this frame ' +
    'was queued. Nothing was written.'

export class RedisSubscribeConnection {
    private readonly conn: AuthenticatedConnection
    /**
     * The desired live patterns → handler. The single source of truth for "which
     * subscriptions to re-issue on reconnect" (plan §5) — re-issued in full on
     * every (re)connect.
     */
    private readonly patterns = new Map<string, MessageHandler>()
    /**
     * The reconnect seam's handler (#271/FR-001), or `undefined` until
     * {@link RedisSubscribeConnection.onReconnect} registers one. Single-handler,
     * last-registration-wins — the same discipline as this package's other
     * seams.
     */
    private reconnectHandler?: ReconnectHandler
    /** The socket the current read loop is draining, or `null` when idle. */
    private loopConn: Deno.Conn | null = null
    /** The current read loop, awaited by {@link close} so no read is left pending. */
    private loopDone: Promise<void> = Promise.resolve()
    private closed = false
    #handle: DisposableHandle | undefined
    private readonly hostname: string
    private readonly disposableName: string
    private readonly disposablePriority: number
    readonly #keepaliveMs: number
    readonly #livenessMs: number
    readonly #retryBaseMs: number
    readonly #retryMaxMs: number
    /**
     * The live socket generation, or `null` when no socket is live.
     *
     * Replaces four parallel fields — the keepalive's timer and its socket, the
     * write chain and its socket — and the two ownership guards that came with
     * them. The history those guards were written from is in
     * {@link SocketGeneration}: each was added after the unconditional version
     * had already been a live defect, one field at a time. One check now answers
     * for all of it, and a new resource released with the socket joins the type
     * rather than growing a fifth field beside it.
     */
    #generation: SocketGeneration | null = null
    /** The pending retry's id. At most one exists at a time (FR-006). */
    #retryTimer: ReturnType<typeof setTimeout> | undefined
    /**
     * Consecutive failed activations, reset the moment one succeeds. Scoped per
     * CONNECTION, not per activation: two concurrent boot activations are one
     * outage, and two counters would report it as two.
     */
    #attempts = 0
    /** When the current failure streak began, for the recovery line (FR-016). */
    #failingSince = 0
    /**
     * When the live socket's read loop started.
     *
     * The streak resets only once a socket has survived a full keepalive
     * interval, not on its first inbound frame. A peer that answers
     * `PSUBSCRIBE` and then drops delivers a subscribe confirmation every
     * cycle, and treating that as proof zeroed the backoff on every pass — a
     * throttle that resets itself is not a throttle.
     */
    #loopStartedAt = 0
    /**
     * The OUTAGE's reconnect identity. Latched **monotonically while an outage
     * is open** — any path may promote it to "reconnect" and none may demote it
     * — and cleared in exactly one place: an activation that succeeds while
     * still holding the live socket. That clear is the outage ending, not a
     * demotion.
     *
     * Both directions were reachable — a `psubscribe` failure carries `false`
     * while the read loop's fault on the same broken socket carries `true` — and
     * only one retry slot exists. Latching upward is the fail-safe choice: the
     * consumer's revocation re-check is idempotent reconciliation, so an extra
     * fire costs one round-trip and a missed one costs enforcement latency.
     *
     * **It belongs to the outage, not to the retry chain** (#290). It used to be
     * consumed by the retry timer on its way into {@link #activate}, which made
     * it a property of the CALLER: an ordinary `psubscribe()` — a user joining a
     * new room — that happened to be the call re-dialling a healed broker
     * restored delivery carrying `false`, and the seam fired only when the
     * pending retry got round to it, up to `retryMaxMs` later. The consumer is
     * `@lockness/realtime`'s revocation re-check, so what was lost was #271's
     * fast path: reconciliation that runs after the frames are already flowing
     * has not bounded the exposure it exists to bound.
     *
     * So it is now read at ACTIVATION time and cleared only by an activation
     * that SUCCEEDS — a fired-then-failed retry cannot lower it for the
     * activation that follows.
     */
    #reconnectIntent = false
    /**
     * Handler faults per pattern, for the current socket generation (#296).
     *
     * Cleared in {@link #discardSocket}, so the first fault after every
     * reconnect is logged in full. That reset is what stops a suppression
     * window hiding a security-control failure for the lifetime of a process.
     */
    readonly #handlerFaults = new Map<string, number>()
    /**
     * Patterns a re-issue must put on the wire FIRST, and on which the
     * reconnect seam waits (#295/FR-023).
     *
     * **Declared by the caller, never inferred.** Before this the order came
     * from `patterns` Map insertion, which came from the order a consumer
     * happened to register its seams in — an ordering no requirement stated and
     * no test pinned, and one that silently INVERTS when a consumer stops
     * subscribing at registration time. What it decided was which subscription
     * survives a re-issue that throws half way, and for `@lockness/realtime`
     * that is the control plane: eviction and presence. A latency cost for
     * events; a security one for enforcement.
     */
    readonly #priority = new Set<string>()
    /**
     * Recorded names that are GLOB PATTERNS rather than exact channels.
     *
     * The verb is decided when the name is recorded, and it is not cosmetic:
     * Redis matches an ACL channel rule **literally** for `PSUBSCRIBE` and by
     * **glob** for `SUBSCRIBE`. Measured with `ACL DRYRUN` against Redis 7 —
     * under `&app__event:*`, `PSUBSCRIBE app__event:alpha` is REFUSED and
     * `SUBSCRIBE app__event:alpha` is allowed. Issuing an exact topic as a
     * pattern would leave every operator who follows the framework's own
     * documented ACL deaf on events while their control plane kept working.
     */
    readonly #globs = new Set<string>()
    /**
     * How many frames the most recent activation actually put on the wire.
     *
     * For the recovery report only (FR-010). A plain count, not a set: the
     * recovery line answers "how much did the activation that ended this outage
     * re-issue", which is neither the desired-set size nor the socket's total.
     */
    #lastIssued = 0
    /**
     * How long one frame may take to reach the socket — the write leg's bound
     * (#286), `Math.min(livenessMs, WRITE_STALL_CEILING_MS)`.
     *
     * Passed to `writeFrame`, which owns the enforcement: only its loop holds
     * the byte offset, and `resp.ts` already owns "a frame is fully on the wire
     * before a reply is read". A timer here would make this file a second
     * decider of when a frame is complete.
     */
    #writeDeadlineMs!: number
    /** Whether `AUTH` travels in cleartext, for the retry WARN (security S5). */
    readonly #cleartextAuth: boolean

    /**
     * @param config - The connection settings; only `hostname` is required.
     * @throws {RangeError} If any cadence is not positive and finite, if
     *   `retryMaxMs < retryBaseMs`, or if `livenessMs` is under twice
     *   `keepaliveMs`.
     */
    constructor(config: RedisSubscribeConnectionConfig) {
        this.#keepaliveMs = config.keepaliveMs ?? DEFAULT_KEEPALIVE_MS
        this.#livenessMs = config.livenessMs ?? DEFAULT_LIVENESS_MS
        // Derived once, from the one knob the operator sets, then capped.
        // See WRITE_STALL_CEILING_MS for why not the window raw.
        this.#writeDeadlineMs = Math.min(
            this.#livenessMs,
            WRITE_STALL_CEILING_MS,
        )
        this.#retryBaseMs = config.retryBaseMs ?? DEFAULT_RETRY_BASE_MS
        this.#retryMaxMs = config.retryMaxMs ?? DEFAULT_RETRY_MAX_MS
        this.#assertCadences()
        // The handshake gets the same window as the read loop: without it a peer
        // that accepts TCP and then answers nothing stalls in AUTH/SELECT for the
        // command path's 30s, before any liveness logic runs (FR-014).
        this.conn = new AuthenticatedConnection({
            ...config,
            // The caller's value wins when given: this field is on the public
            // config, and silently overwriting it made a documented option a lie.
            handshakeTimeoutMs: config.handshakeTimeoutMs ?? this.#livenessMs,
        })
        this.#cleartextAuth = config.password !== undefined &&
            config.tls !== true
        this.hostname = config.hostname
        this.disposableName = config.disposableName ?? 'redis-subscribe'
        this.disposablePriority = config.disposablePriority ??
            DEFAULT_DISPOSABLE_PRIORITY
    }

    /** Refuse a cadence set that cannot behave (FR-018, invariant 4). */
    #assertCadences(): void {
        const named: ReadonlyArray<[string, number]> = [
            ['keepaliveMs', this.#keepaliveMs],
            ['livenessMs', this.#livenessMs],
            ['retryBaseMs', this.#retryBaseMs],
            ['retryMaxMs', this.#retryMaxMs],
        ]
        for (const [name, value] of named) {
            if (!Number.isFinite(value) || value <= 0) {
                throw new RangeError(
                    `RedisSubscribeConnection: ${name} must be a positive finite ` +
                        `number, received ${value}`,
                )
            }
        }
        if (this.#retryMaxMs < this.#retryBaseMs) {
            throw new RangeError(
                'RedisSubscribeConnection: retryMaxMs must be at least ' +
                    `retryBaseMs (${this.#retryMaxMs} < ${this.#retryBaseMs})`,
            )
        }
        if (this.#livenessMs < this.#keepaliveMs * MIN_LIVENESS_RATIO) {
            throw new RangeError(
                'RedisSubscribeConnection: livenessMs must be at least ' +
                    `${MIN_LIVENESS_RATIO}x keepaliveMs, or the keepalive cannot ` +
                    `arrive in time (${this.#livenessMs} < ` +
                    `${this.#keepaliveMs * MIN_LIVENESS_RATIO})`,
            )
        }
    }

    /**
     * Subscribe to a topic pattern and receive each published payload.
     *
     * The pattern is recorded and `PSUBSCRIBE`d on this connection's own socket
     * (dialled + authenticated lazily on first use). The handler fires once per
     * pushed `pmessage` frame whose pattern matches. Synchronous by the port
     * contract: the socket work runs in the background, and a failure to reach
     * the wire is logged at WARN, never thrown into the caller.
     *
     * @param pattern - The topic glob (e.g. `lockness:realtime:*`).
     * @param handler - Called with `(topic, payload)` for each message.
     * @throws {Error} If called after {@link close}.
     * @example
     * ```typescript
     * sub.psubscribe('lockness:realtime:*', (topic, payload) => {})
     * ```
     */
    psubscribe(pattern: string, handler: MessageHandler): void {
        if (this.closed) {
            throw new Error('RedisSubscribeConnection is closed')
        }
        this.patterns.set(pattern, handler)
        this.#globs.add(pattern)
        void this.#connectAndSubscribe()
    }

    /**
     * Subscribe to ONE topic pattern and resolve once its frame is on the wire.
     *
     * The awaitable counterpart to {@link psubscribe} (#295). Same recording,
     * same retry, one difference that is the whole point: **the returned
     * promise settles on what actually happened.**
     *
     * The guarantee is *"the `PSUBSCRIBE` frame reached the socket, or you were
     * told it did not"* — **never** "delivery has started". This connection
     * awaits that a frame reached the socket and nothing more; the broker's
     * `+psubscribe` is recorded separately, and a caller that needs delivery
     * must observe delivery.
     *
     * **The residual is not one round trip.** Every frame crosses this
     * generation's serialized write chain, so the k-th of k concurrent calls
     * resolves after k writes, and on a reconnect it queues behind the whole
     * re-issue. The wait is one RTT *plus the queue depth ahead of the frame*.
     *
     * **On failure it rejects AND schedules the retry** — the two are not
     * alternatives. {@link psubscribe} and the retry timer keep the never-throw
     * contract because neither has a caller to reject to; this one does, and a
     * seam that resolved regardless would make the await decorative.
     *
     * The single exemption is {@link close}: an activation still in flight when
     * the connection closes resolves rather than rejecting. The frame did not
     * land, but the shutdown is deliberate, there is nothing to recover, and
     * nobody is waiting to be told.
     *
     * @param pattern - The topic glob or exact topic.
     * @param handler - Called with `(topic, payload)` for each message.
     * @returns Resolves once the frame has reached the socket.
     * @throws {Error} If called after {@link close}, or if the frame could not
     *   be written — a retry is scheduled either way.
     * @example
     * ```typescript
     * await sub.psubscribeOne('app__event:orders', (topic, payload) => {})
     * ```
     */
    subscribeOne(
        channel: string,
        handler: MessageHandler,
        options: { priority?: boolean } = {},
    ): Promise<void> {
        if (this.closed) {
            throw new Error('RedisSubscribeConnection is closed')
        }
        this.patterns.set(channel, handler)
        this.#globs.delete(channel)
        if (options.priority) this.#priority.add(channel)
        return this.#activate([channel], true)
    }

    /**
     * Stop receiving messages for one pattern, on the wire and on reconnect.
     *
     * Removes the pattern from the desired set — so no later activation
     * re-issues it — and enqueues `PUNSUBSCRIBE` on the live socket.
     *
     * **Both erasures happen HERE, at the enqueue, not at the broker's
     * acknowledgement**, and they are co-turn with the frame. Deferring either
     * to the `+punsubscribe` lets a pattern re-watched inside the round trip
     * lose the record the re-watch just made: subscribed on the broker, nothing
     * recorded, every frame discarded, and nothing logged. The asymmetry worth
     * remembering is not between the two records — it is that **a write is
     * acknowledged and an erasure is enqueued.**
     *
     * With no live socket there is nothing to unsubscribe: the desired-set
     * removal alone is sufficient, because the next activation issues from that
     * set.
     *
     * @param pattern - The pattern to stop receiving.
     * @returns Resolves once the frame has reached the socket, or at once when
     *   no socket is live.
     * @throws {Error} If called after {@link close}, or if the frame could not
     *   be written.
     * @example
     * ```typescript
     * await sub.punsubscribe('app__event:orders')
     * ```
     */
    unsubscribeOne(name: string): Promise<void> {
        if (this.closed) {
            throw new Error('RedisSubscribeConnection is closed')
        }
        const verb = this.#globs.has(name) ? 'PUNSUBSCRIBE' : 'UNSUBSCRIBE'
        this.patterns.delete(name)
        this.#globs.delete(name)
        this.#priority.delete(name)
        const generation = this.#generation
        if (!generation) return Promise.resolve()
        // CO-TURN: retire, then enqueue, with nothing awaited between them.
        // `#write` reaches the queue synchronously, so the erasure and its frame
        // are ordered together on the chain.
        generation.retire(name)
        return this.#write(generation.conn, encodeCommand([verb, name]))
    }

    /**
     * Register a handler invoked after a **reconnect** has re-issued every
     * active `PSUBSCRIBE` (#271/FR-001).
     *
     * The routine moment a pub/sub frame is lost is the window in which this
     * socket was between connects, so the reconnect is the moment a consumer
     * wants to reconcile whatever the lost frames would have told it.
     * `@lockness/realtime` uses it to run its durable revocation re-check
     * immediately, instead of waiting for its periodic tick.
     *
     * It fires **only** on a reconnect: never on the first connect (there is
     * nothing to recover), and never when the re-dial or the re-`PSUBSCRIBE`
     * failed (a failed reconnect is not a reconnect). A handler that throws or
     * rejects is contained and logged at WARN — it can neither kill the read
     * loop nor stop future fires.
     *
     * Single-handler: registering again replaces the previous handler rather
     * than stacking one, matching this package's other seams.
     *
     * **Delivery resumes BEFORE the handler completes, and that is deliberate.**
     * The read loop is started first, so a `pmessage` can be dispatched while
     * the handler is still running — the window is one round-trip on whatever
     * the handler talks to, not a microtask. Firing before the read loop
     * instead would let an application-supplied handler gate all delivery
     * indefinitely, trading a bounded authorization window for an unbounded
     * availability one. A consumer that needs frames gated for the duration of
     * its reconciliation must gate them itself.
     *
     * And **a fire is not proof that frames are flowing**: an activation awaits
     * only that its `PSUBSCRIBE` reached the socket, never that the broker
     * answered `+psubscribe`.
     *
     * @param handler - Called with no arguments after each successful reconnect.
     * @example
     * ```typescript
     * sub.onReconnect(() => reconcileWhateverTheLostFramesCarried())
     * ```
     */
    onReconnect(handler: ReconnectHandler): void {
        this.reconnectHandler = handler
    }

    /**
     * The one entry point: dial, issue every recorded pattern, start the read
     * loop, and fire the reconnect seam if an outage is outstanding.
     *
     * There used to be two — this and a `#reconnectAll` that passed
     * `isReconnect: true` — because "is this a reconnect" was decided by WHICH
     * entry point was called rather than by state read back (#271, plan §5).
     *
     * **Only one half of that was still true.** `#reconnectAll` had no caller
     * at all: the read loop's fault path routes through `#scheduleRetry` so it
     * shares one backoff (#275/FR-021), and the timer re-entered `#activate`
     * directly.
     *
     * The `isReconnect` argument, by contrast, was very much LIVE — the retry
     * timer passed the latch it had just consumed, and that was the only way
     * the seam ever fired. Do not read this note as "the `true` branch was
     * unreachable"; it was the load-bearing one. What moved is the DECISION's
     * location, not its existence: the two argument sites were
     * `#connectAndSubscribe`'s literal `false` and the timer's consumed latch,
     * and consuming at the timer is precisely the #290 defect. Reading
     * {@link #reconnectIntent} at the point of success makes it the single home
     * for the decision — and the promotions in `#scheduleRetry`'s callers
     * (the read fault, the keepalive stall) are what feed it. They are not
     * dead; removing them disables the seam outright.
     *
     * **It issues every recorded pattern, not the one that triggered it** (#245,
     * FR-011). It used to take a single pattern, and that was a live defect: the
     * realtime driver subscribes twice back-to-back over one single-flight dial,
     * so a transient blip rejected both — and with one retry slot, the survivor
     * re-entered here and re-issued only its own pattern. The other sat recorded
     * but never subscribed, leaving the instance permanently deaf on the control
     * topic with a log that had gone quiet. Re-`PSUBSCRIBE` of a live pattern is
     * a no-op on Redis, which the re-issue has always depended on.
     */
    #connectAndSubscribe(): Promise<void> {
        return this.#activate([...this.patterns.keys()])
    }

    /**
     * Append a frame to the socket's single write queue.
     *
     * Every writer goes through here — see {@link SocketGeneration.enqueue}
     * for why. The chain
     * is kept alive across a rejection so one failed write cannot wedge the queue
     * for the recovery that follows it.
     */
    #write(conn: Deno.Conn, frame: Uint8Array): Promise<void> {
        // The two mechanisms #286 needed are now one predicate, asked twice.
        //
        // AT ENTRY this REFUSES where the old MECHANISM 1 rebased: the chain is
        // per generation and generations are created at one site in `#activate`,
        // so a frame for a socket that is not the live generation's has no queue
        // to join. That is the one non-neutrality of #298, and it is recorded
        // rather than glossed: rebasing here adopted whatever socket arrived. No
        // reachable sequence distinguishes them, because every path discards a
        // socket before replacing it — a property of the CALLERS, which is
        // exactly why the battery keeps a row for it.
        const generation = this.#generation
        if (generation?.conn !== conn) {
            return Promise.reject(new Error(ABANDONED_WRITE))
        }
        return generation.enqueue(() => {
            // AND INSIDE THE QUEUED CLOSURE, because refusing at entry does not
            // cancel a write already chained behind an in-flight one — without
            // this, a queued frame still reaches a dead socket.
            //
            // It REJECTS rather than resolving quietly: a silently-dropped
            // write would leave `#activate`'s await unsettled, which is #286's
            // own defect — an activation that neither completes nor fails —
            // relocated into the queue reset.
            if (this.#generation?.conn !== conn) {
                throw new Error(ABANDONED_WRITE)
            }
            return writeFrame(conn, frame, this.#writeDeadlineMs)
        })
    }

    /**
     * Discard a socket and clear the timers that belong to it.
     *
     * The single home for "this socket is finished" (plan §5). Every discard site
     * routes through it, so the keepalive can never outlive the socket it was
     * pinging — an obligation that would otherwise be re-stated at each site and
     * silently forgotten at the next one.
     */
    #discardSocket(conn: Deno.Conn): void {
        // Unconditional, unlike the clears below, and deliberately: this is a
        // per-generation REPORTING counter, not a resource owned by a socket.
        // Resetting it for a generation that is already gone costs one extra
        // log line; failing to reset it silences a real fault.
        // THE TALLY, before the clear (#295/FR-014). The per-generation
        // throttle above logs one fault in full and counts the rest; this is
        // where the rest are accounted for, so a socket that dropped messages
        // on twenty channels says so on its way out rather than leaving one
        // arbitrary pattern named and nineteen silent.
        if (this.#handlerFaults.size > 0) {
            const tally = [...this.#handlerFaults]
                .map(([p, n]) => `${safeForLog(p)}=${n}`)
                .join(' ')
            console.warn(
                `[redis-subscribe] handler faults on the socket being ` +
                    `discarded at ${safeForLog(this.hostname)}, by pattern: ` +
                    tally,
            )
        }
        this.#handlerFaults.clear()
        // ONE ownership check, where there was one per field. It gates the
        // RELEASE and nothing else.
        //
        // Only if this socket is the live generation's. Discarding a STALE
        // socket while a newer one is live must leave the newer one alone: the
        // unconditional version was a live defect twice, one field at a time —
        // it disarmed the live socket's keepalive and the #274 idle churn came
        // back with nothing in the log, and #286 hit the same shape for the
        // write chain, where it deletes the serialization that stops two frames
        // splicing into a still-valid truncated one. `SC-001` is the witness,
        // and it is the first this branch has ever had.
        if (this.#generation?.conn === conn) {
            this.#generation.release()
            this.#generation = null
        }
        // UNCONDITIONAL, and deliberately — it sits between the release above
        // and the loop clear below exactly as it did. This is the only path that
        // closes the socket, clears the cached socket and clears the
        // single-flight `pending` entry. Gating it behind the ownership check
        // leaks an established, AUTH'd socket and a file descriptor per stale
        // discard, and leaves `pending` pointing at a dead dial — #287, which
        // this package has already paid for once. `SC-002` is the witness.
        this.conn.discard(conn)
        // NOT a member of the generation, and not an oversight: `loopConn` is
        // installed at a different moment — after the awaited writes and after
        // the ownership re-check — and it means "a read loop is draining this
        // socket", not "which socket owns this". See {@link SocketGeneration}.
        if (this.loopConn === conn) this.loopConn = null
    }

    /** Cancel the pending retry, if one is scheduled. */
    #clearRetry(): void {
        if (this.#retryTimer !== undefined) {
            clearTimeout(this.#retryTimer)
            this.#retryTimer = undefined
        }
    }

    /**
     * Arm the keepalive on a freshly-activated socket, replacing any previous one.
     *
     * Unref'd: a socket waiting for traffic must never be the reason a process
     * refuses to exit.
     */
    #armKeepalive(generation: SocketGeneration): void {
        // TAKES THE GENERATION, does not re-read the field (#321).
        //
        // This method used to read `this.#generation` and re-check
        // `generation?.conn !== conn`. That check was the LAST re-read of the
        // field after an await inside `#activate`, and #298's FR-002 named the
        // absence of exactly that re-read as "the single condition under which
        // zero new identity predicates is true rather than aspirational" — a
        // requirement whose second half did not ship. It ships here.
        //
        // The predicate is not merely redundant now, it is provably DEAD: the
        // caller holds the generation it constructed for this socket, so
        // `generation.conn` IS `conn` by construction. A guard that can only
        // evaluate one way is worse than no guard, because it reads as a check.
        // ONCE PER GENERATION, not once per activation (#295/FR-015).
        //
        // `#activate` runs on every `psubscribe`, and re-arming clears the
        // interval and starts a fresh one — so an instance joining channels more
        // often than `keepaliveMs` never emits a `PING` at all, and the liveness
        // signal quietly stops being independent of application traffic. That
        // was harmless while activations were rare; under per-channel subscribe
        // a join IS an activation, so it is the normal case.
        //
        // A new socket is a new generation with no interval, so a reconnect
        // still arms one. `armKeepalive` keeps its clear-then-store as the
        // safety net; this is what stops the interval being created at all.
        if (generation.hasKeepalive) return
        const conn = generation.conn
        const id = setInterval(() => {
            // The socket check moved into `#write`, which is the single funnel
            // both writers pass through — keeping it here too would be two
            // homes for one predicate. `closed` stays: it also skips the frame
            // allocation below.
            if (this.closed) return
            // No interpolated token, ever. `PING <id>` would put a value of ours
            // on the wire and make this frame something an auditor has to reason
            // about; as a bare literal it is inert.
            this.#write(conn, encodeCommand(['PING'])).catch((error) => {
                if (this.closed) return
                // TWO OBLIGATIONS, and they are not the same one (#286).
                //
                // SCHEDULING stays `#activate`'s job: the read loop on this
                // same socket is about to fault, and two triggers would race to
                // reconnect. That is still true and unchanged.
                //
                // DISCARDING is owed by whoever observed the failure, and this
                // path used to owe it and not pay. The old reasoning assumed
                // the read loop would also see the fault — true of a socket
                // error, FALSE of a write timeout, where the socket is alive
                // and merely slow. The partial PING then sits mid-frame and the
                // next PSUBSCRIBE is consumed as its continuation: a spliced
                // but still-VALID frame, which raises nothing and drops every
                // message forever (see `SocketGeneration.enqueue`).
                //
                // And it SCHEDULES, which the plan for #286 first said it must
                // not. A test found why that was wrong: `#discardSocket` alone
                // makes `#readLoop`'s `while (this.conn.socket === conn)`
                // condition false, so the loop exits **quietly** rather than
                // faulting — nothing re-dials, and the connection is
                // permanently deaf. That is the defect this whole feature
                // exists to remove, reintroduced by the fix for it.
                //
                // The "two triggers would race" worry the old comment carried
                // is already answered where it belongs: `#scheduleRetry`
                // returns early when `#retryTimer !== undefined`, so a second
                // caller is a no-op rather than a second dial.
                if (error instanceof RespFramingError) {
                    this.#discardSocket(conn)
                    this.#scheduleRetry(true, error, 'keepalive write stalled')
                }
                console.warn(
                    `[redis-subscribe] keepalive PING failed at ${
                        safeForLog(this.hostname)
                    }; the read loop owns the recovery: ${renderError(error)}`,
                )
            })
        }, this.#keepaliveMs)
        Deno.unrefTimer(id)
        generation.armKeepalive(id)
    }

    /**
     * Ensure the socket is connected, issue `PSUBSCRIBE` for `toIssue`, and make
     * sure a read loop is draining it.
     *
     * A failure is logged at WARN and **retried** (#275, FR-004) — never thrown,
     * because the callers are the synchronous `psubscribe` and a background
     * timer. Abandoning is not an outcome: this method returning without a
     * scheduled retry is exactly the permanent deafness the feature removes.
     */
    async #activate(
        toIssue: readonly string[],
        rethrow = false,
    ): Promise<void> {
        if (this.closed) return
        let conn: Deno.Conn | undefined
        // Hoisted so the catch can read it: an activation that fired the seam
        // and then threw owes the retry a seam of its own.
        let firedEarly = false
        try {
            conn = await this.conn.connect()
            // Re-checked AFTER the await: a dial that resolves once `close()` has
            // run would otherwise register a disposable the close already
            // deregistered, and write on a socket nobody owns.
            if (this.closed) {
                this.#discardSocket(conn)
                return
            }
            this.#handle ??= registerDisposable({
                name: this.disposableName,
                dispose: () => this.close(),
                priority: this.disposablePriority,
            })
            // THE SINGLE CONSTRUCTION SITE (plan FR-002), after the `closed`
            // re-check and before the first write. Installed only when this
            // socket is not already the live generation's: `psubscribe()` on an
            // established connection reaches here and `connect()` hands back the
            // CACHED socket, so a per-activation generation would drop the live
            // write chain and orphan the live keepalive — on the second
            // `psubscribe` call, not through a race.
            //
            // And it replaces by RELEASING first, never by assignment, so a
            // generation being displaced cannot leave its interval running.
            if (this.#generation?.conn !== conn) {
                this.#generation?.release()
                this.#generation = new SocketGeneration(conn)
            }
            // THE LOCAL #298's FR-002 required and did not ship (#321). Every
            // later use in this method reaches the generation through `gen`,
            // never through the field, so nothing here re-establishes identity
            // after an await.
            //
            // Its staleness is excluded by the `this.conn.socket !== conn`
            // guard below, and that guard is sufficient ONLY BECAUSE
            // `AuthenticatedConnection.discard` closes the socket and nulls
            // `connection` in ONE synchronous step (`connection.ts`, `discard`).
            // Anything that splits those two makes this local unsound — which
            // is why that is recorded at `discard` as well as here.
            const gen = this.#generation
            // PRIORITY FIRST, by declaration (#295/FR-023). A stable partition,
            // not a sort: everything else keeps its recorded order, so this
            // changes nothing for a caller that declares nothing.
            const ordered = this.#priority.size > 0
                ? [
                    ...toIssue.filter((p) => this.#priority.has(p)),
                    ...toIssue.filter((p) => !this.#priority.has(p)),
                ]
                : toIssue
            let landed = 0
            this.#lastIssued = 0
            for (const pattern of ordered) {
                // RE-READ INSIDE THE LOOP, never the snapshot taken before the
                // awaits (#295/FR-013). Both reads race the same awaits: a
                // `punsubscribe` can delete from `patterns` while this loop is
                // suspended, and `#dispatch` can confirm into the generation.
                // Issuing a pattern the caller has since dropped leaves a live
                // subscription whose handler is gone — frames arrive and are
                // discarded, which is the cost this feature exists to remove.
                if (!this.patterns.has(pattern)) continue
                // THE DELTA. One rule, and it collapses what looked like two
                // decisions: a reconnect dials a NEW socket, so its generation's
                // record is empty and the difference IS the full set; an
                // ordinary `psubscribe` on a live socket finds everything else
                // already recorded and issues one frame. Nothing branches on
                // "am I a reconnect", which is why there is no way to get that
                // branch wrong.
                if (gen.has(pattern)) continue
                // CO-TURN with the enqueue, and that is load-bearing: `#write`
                // reaches `enqueue` synchronously, so the claim and its frame
                // hit the chain in the same turn. An `await` between them lets
                // an unwatch enqueue `PUNSUBSCRIBE` first and leaves the broker
                // subscribed with nothing recorded. See `SocketGeneration.claim`.
                gen.claim(pattern)
                // THE VERB FOLLOWS THE NAME'S KIND, and it is an ACL fact, not
                // a style one — see `#globs`.
                const verb = this.#globs.has(pattern)
                    ? 'PSUBSCRIBE'
                    : 'SUBSCRIBE'
                await this.#write(conn, encodeCommand([verb, pattern]))
                landed++
                this.#lastIssued = landed
                // THE SEAM FIRES ON THE FIRST LANDED WRITE, not after all N
                // (#295/FR-023, and #295's R-8).
                //
                // Its consumer is a revocation re-check that needs the control
                // subscription and nothing else. Waiting for the whole loop put
                // the framework's only revocation fast path behind every hosted
                // channel's frame — at a thousand channels, a thousand
                // serialized writes between a socket recovering and an evicted
                // connection stopping. The priority partition above is what
                // makes "the first write" and "the control topic" the same
                // thing.
                //
                // ONE HONEST COST, recorded rather than glossed: a re-issue
                // that lands write 1 and then fails leaves the seam fired while
                // later channels are still deaf, and the retry that fixes them
                // will not fire it again — the intent is consumed here. That is
                // the right trade only because what the seam feeds is
                // enforcement, which the first write restored, and because a
                // partial re-issue already schedules its own retry.
                // THE SEAM WAITS FOR THE SUBSCRIPTION IT FEEDS, not merely for
                // the first write to land.
                //
                // "First write" and "the control topic" are the same thing only
                // when this activation is re-issuing a set that contains it.
                // They are not the same for a single-pattern `subscribeOne`
                // after a fault, nor for any activation running before
                // `onControl` has declared its priority — and in both cases the
                // seam used to fire with the control topic unsubscribed, after
                // which the retry read a consumed latch and never fired again.
                // Revocation then falls back to the periodic reconcile, which is
                // the pre-#271 exposure the seam exists to remove. Two review
                // seats reached this from opposite ends of the guard.
                const feedsTheSeam = this.#priority.size === 0
                    ? landed === 1
                    : this.#priority.has(pattern)
                if (feedsTheSeam && this.#reconnectIntent) {
                    this.#reconnectIntent = false
                    firedEarly = true
                    await this.#fireReconnect()
                }
            }
            // Re-checked AGAIN, after the awaited writes. `close()` clears the
            // keepalive once; an activation whose write resolves during that
            // close would otherwise re-arm the interval it just cleared, and
            // nothing would ever clear it again.
            //
            // DEFENSIVE AND UNTESTED, deliberately. `close()` discards the
            // socket, so an in-flight write normally fails and the catch returns
            // before this point; the guard covers an interleaving at this one
            // await boundary, which is real but not reachable from the public
            // surface. Two attempts to test it went green for the wrong reason
            // and were removed rather than kept.
            if (this.closed) {
                this.#discardSocket(conn)
                return
            }
            // OWNERSHIP, re-checked after the awaited writes (#290 review, HIGH).
            // A read fault on this same socket can land inside those awaits:
            // `#readLoop` discards the socket — nulling `conn.socket` AND
            // `loopConn` — and promotes the intent through `#scheduleRetry`.
            // Without this guard the continuation resumed on a corpse: it saw
            // `loopConn !== conn` and restarted a read loop that exits at once
            // and QUIETLY (its `conn.socket === conn` condition is already
            // false), armed a keepalive on a closed socket, then consumed the
            // intent and fired the seam with nothing subscribed anywhere — and
            // the retry that actually restored delivery found the latch clear
            // and fired nothing. One phantom recovery, and the real one silent.
            //
            // "Cleared only by an activation that SUCCEEDS" has to mean the
            // activation still holds the live socket, not merely that it did
            // not throw. Returning leaves the intent for the retry the read
            // fault already scheduled.
            //
            // DEFENSIVE AND UNTESTED, deliberately — the same call the two
            // `closed` re-checks above make, for a different reason. Two
            // attempts to pin it went green for the wrong reason and were
            // removed rather than kept:
            //
            // - `accepts()` and the command log are SERVER-side counters, and
            //   sampling them for a CLIENT-side fire read `accept 1` on a
            //   perfectly healthy activation.
            // - Publishing a probe from inside the handler and requiring its
            //   delivery asserts something this class does not promise: an
            //   activation awaits only that its `PSUBSCRIBE` reached the
            //   socket, never that the broker answered `+psubscribe`, so a
            //   legitimate fire can precede a peer-side close it cannot yet
            //   know about. And forcing the interleaving with
            //   `closeAfter('PSUBSCRIBE')` churns MANY outages, so a later one
            //   fires normally and hides the phantom entirely.
            //
            // What is pinned is the consume-once half, by FR-025.
            if (this.conn.socket !== conn) return
            if (this.loopConn !== conn) {
                this.loopConn = conn
                this.#loopStartedAt = Date.now()
                this.loopDone = this.#readLoop(conn, gen)
            }
            this.#armKeepalive(gen)
            // The seam fires INSIDE the try and AFTER the re-issue loop, so a
            // reconnect whose PSUBSCRIBE never landed is not reported as one.
            //
            // And the intent is CONSUMED HERE — at the success that ends the
            // outage, not at the retry timer's fire (#290, FR-022). Reading the
            // latch rather than taking the answer from whoever called is the
            // whole fix: whichever caller drove this activation, it is the one
            // that restored delivery, so it is the one that owes the seam.
            //
            // Clearing before the await keeps a concurrent activation that
            // succeeds during the handler from firing a second time: `connect()`
            // is single-flight, so two activations racing one outage share a
            // socket and would otherwise both report it.
            // The latch is normally consumed by the first landed write above.
            // This covers the activation that issues NOTHING — every desired
            // pattern already on this socket — which is still the activation
            // that ended the outage and still owes the seam.
            const asReconnect = this.#reconnectIntent
            this.#reconnectIntent = false
            if (asReconnect) await this.#fireReconnect()
        } catch (error) {
            if (this.closed) return
            // A RETRY THAT CANNOT CONVERGE IS NOT A RETRY (#300). An oversized
            // `PSUBSCRIBE` pattern is refused by `encodeCommand` before the
            // socket is touched, and re-issuing the identical pattern produces
            // the identical refusal — forever, while the log says "retrying".
            // Patterns are kilobytes, so this is unreachable in practice; it is
            // guarded because an unreachable infinite loop is still an infinite
            // loop, and the log would be actively misleading.
            if (error instanceof RespCommandTooLargeError) {
                if (conn) this.#discardSocket(conn)
                console.error(
                    `[redis-subscribe] a subscription pattern is too large to ` +
                        `send to ${safeForLog(this.hostname)} and retrying ` +
                        `cannot help: ${renderError(error)}`,
                )
                if (rethrow) throw error
                return
            }
            // Whether delivery was established is READ, not assumed. A first
            // connect that fails promotes nothing — `loopConn` is null, and
            // "a retried FIRST connect fires nothing" depends on that. But an
            // activation writing to the CACHED socket can fail after that socket
            // had been delivering for hours (broker back-pressure stalling a
            // `PSUBSCRIBE`), and it is about to close it; claiming it "learned
            // nothing" there was simply false, and left the promotion to a race
            // with the read loop's own rejection.
            //
            // Captured BEFORE the discard, which nulls `loopConn`.
            const wasDelivering = this.loopConn === conn
            // The discard is BEFORE the retry, and not optional: `connect()`
            // hands back the cached socket, so a retry that skips this feeds
            // every later attempt the same corpse and loops forever while
            // logging "retrying".
            if (conn) this.#discardSocket(conn)
            // AND RE-ARM WHAT THE EARLY FIRE CONSUMED. An activation that fired
            // the seam and then threw has lost frames the retry will recover,
            // so the retry owes a seam of its own; without this the latch was
            // consumed by an activation that did not finish, and the recovery
            // that actually restores delivery reports nothing.
            //
            // `#scheduleRetry` latches monotonically, so this can only raise.
            this.#scheduleRetry(wasDelivering || firedEarly, error)
            // AFTER the retry is scheduled, never instead of it (#295/FR-001).
            // An awaiting caller is told its frame did not land; the connection
            // still heals itself. Only `psubscribeOne` passes `rethrow` —
            // `psubscribe` and the retry timer have no caller to reject to,
            // which is why the never-throw contract holds for them unchanged.
            if (rethrow) throw error
        }
    }

    /**
     * Log the recovery and reset the failure streak.
     *
     * An outage that ends must be as visible as one that starts. Without this
     * line, "recovered", "the process died" and "the loop is wedged" all look
     * identical to an operator watching the WARN stream stop.
     */
    #reportRecovery(): void {
        if (this.#attempts === 0) return
        // Survival, not arrival. See `#loopStartedAt`.
        if (Date.now() - this.#loopStartedAt < this.#keepaliveMs) return
        const elapsed = Date.now() - this.#failingSince
        // WHAT THIS ACTIVATION WROTE, not what the socket carries.
        //
        // `generation.size` was wrong and FR-010 says which quantity is meant:
        // the delta. The two agree on a fresh socket and diverge the moment a
        // retry lands on a CACHED one — a hundred patterns already confirmed
        // plus a three-pattern retry reported "100 re-issued" having written
        // three, or none. An outage report that overstates itself is worse than
        // none, because it is believed.
        const reissued = this.#lastIssued
        console.warn(
            `[redis-subscribe] recovered at ${
                safeForLog(this.hostname)
            } after ` +
                `${this.#attempts} failed attempt(s) over ${elapsed}ms; ` +
                `${reissued} subscription(s) re-issued`,
        )
        this.#attempts = 0
        this.#failingSince = 0
    }

    /**
     * Log a failed activation and schedule the next attempt.
     *
     * Backoff is exponential from `retryBaseMs`, capped at `retryMaxMs`, with
     * **full jitter**: N instances that lose a broker at the same instant would
     * otherwise compute identical schedules and re-dial it in lockstep forever,
     * holding a recovering broker in the state that caused the herd.
     *
     * Only the attempt that SCHEDULES logs. A second concurrent failure folds
     * into the pending chain — it is the same outage, and both activations issue
     * the same pattern set, so a second line would say nothing new.
     *
     * **Both re-dial paths come through here** — a failed activation and a read
     * loop that faulted on a socket which had activated fine. They are different
     * events (`cause` names which) and one cadence; the second used to have no
     * cadence at all.
     */
    #scheduleRetry(
        isReconnect: boolean,
        error: unknown,
        cause:
            | 'PSUBSCRIBE failed'
            | 'read fault'
            | 'keepalive write stalled' = 'PSUBSCRIBE failed',
    ): void {
        if (this.closed) return
        // Still promoted here: the read loop's fault and the keepalive stall
        // reach the latch through this method and never through `#activate`.
        //
        // BEFORE the early return, and it stays there (#307). Below it, a
        // `true` folding into an already-armed chain would be dropped and the
        // reconnect never reported.
        //
        // No test pins the ordering, and #307 set out to write one before
        // establishing that the order it needs is no longer reachable. Arming
        // with `false` requires `#activate`'s catch to see
        // `this.loopConn !== conn`, which since #290 means "no read loop is
        // running on this socket" — and without one, no later `true` can
        // arrive, because both of its sources (the read fault, the keepalive)
        // need a live socket. Every discard site pairs with a schedule except
        // the `RespCommandTooLargeError` return above, which the comment there
        // already calls unreachable in practice. So the losing order needs
        // that path, plus a failed dial, plus winning a race against the old
        // loop's fault.
        //
        // Kept because the cost is zero and the failure it prevents is silent:
        // a reconnect that never fires looks exactly like an outage that never
        // happened. `reconnect_intent_290.ts` carries the row and the
        // reasoning, so this is re-checkable rather than folklore.
        this.#reconnectIntent ||= isReconnect
        if (this.#retryTimer !== undefined) return

        // Counted HERE, after the early returns, and in one place for both
        // callers. Incremented at the call sites it could grow without any dial
        // being scheduled — a second concurrent failure folding into a pending
        // chain still bumped the count — which inflated the backoff ceiling for
        // attempts that never happened.
        this.#attempts++
        if (this.#failingSince === 0) this.#failingSince = Date.now()

        const ceiling = Math.min(
            this.#retryMaxMs,
            this.#retryBaseMs * 2 ** (this.#attempts - 1),
        )
        const delay = Math.max(1, Math.floor(Math.random() * ceiling))
        const cleartext = this.#cleartextAuth
            ? ' (AUTH is being re-sent in cleartext on every attempt — tls is off)'
            : ''
        // ONE line for both entry paths. The read loop used to log its own and
        // then re-dial elsewhere, which is how a whole re-dial path came to sit
        // outside the backoff without anything in the log looking wrong.
        console.warn(
            `[redis-subscribe] ${cause} at ${safeForLog(this.hostname)}, ` +
                `attempt ${this.#attempts}, ${
                    cause === 'read fault' ? 'reconnecting' : 'retrying'
                } in ${delay}ms — re-issuing ${this.patterns.size} ` +
                `subscription(s)${cleartext}: ${renderError(error)}`,
        )

        const id = setTimeout(() => {
            this.#retryTimer = undefined
            // The latch is NOT read here (#290). This callback used to consume
            // it on the way in, which handed a property of the outage to one
            // caller and let a failed attempt drop it. `#activate` reads it
            // itself and clears it only on success.
            void this.#activate([...this.patterns.keys()])
        }, delay)
        Deno.unrefTimer(id)
        this.#retryTimer = id
    }

    /**
     * Invoke the reconnect handler, containing any fault.
     *
     * The containment is the seam's own (plan §5): a consumer's throw must not
     * kill the read loop that is about to resume delivery. It is logged at WARN
     * via the same encoder as this file's other warnings, and it deliberately
     * does **not** unregister the handler — a containment that disarms the seam
     * would turn a recoverable failure into permanent silent degradation.
     */
    async #fireReconnect(): Promise<void> {
        if (this.closed || !this.reconnectHandler) return
        try {
            await this.reconnectHandler()
        } catch (error) {
            console.warn(
                `[redis-subscribe] reconnect handler failed at ${
                    safeForLog(this.hostname)
                }: ${renderError(error)}`,
            )
        }
    }

    /**
     * Drain push frames off `conn` until it faults or the connection closes. On a
     * wire fault the socket is discarded and, unless closing, a reconnect
     * re-issues every active pattern — logged at WARN.
     */
    async #readLoop(
        conn: Deno.Conn,
        generation: SocketGeneration,
    ): Promise<void> {
        while (!this.closed && this.conn.socket === conn) {
            let reply: RespReply
            try {
                // Bounded by `resp.ts` (max bulk length, max line length, and a
                // per-reply deadline), so an oversized pushed payload is
                // rejected before dispatch.
                //
                // The deadline is this connection's LIVENESS window, not
                // `resp.ts`'s command-path default. A fresh reader per iteration
                // is what makes any inbound frame — a pmessage, a subscribe
                // confirmation, or a keepalive pong — reset the clock.
                reply = await readReply(conn, this.#livenessMs)
            } catch (error) {
                if (this.closed) return
                this.#discardSocket(conn)
                // Through the SAME backoff a failed activation uses (FR-021).
                // This path used to re-dial bare, and a peer that accepts,
                // answers `PSUBSCRIBE` and then drops — an ACL denial, a
                // `maxclients` refusal, a broker shedding load — spun the client
                // at the speed of the socket: 7 539 dials per second, measured.
                // Re-issuing every active pattern and firing the seam is still
                // what happens (FR-003, #271/FR-001); it just no longer happens
                // without a delay.
                this.#scheduleRetry(true, error, 'read fault')
                return
            }
            // Proof the socket WORKS, which an activation completing is not:
            // the streak resets here rather than at the end of `#activate`, or a
            // connect-fault-connect-fault loop would zero its own backoff on
            // every pass and never grow.
            this.#reportRecovery()
            this.#dispatch(reply, generation)
        }
    }

    /**
     * Route a `pmessage` push frame to the pattern's handler, and record a
     * `+psubscribe` acknowledgement against the generation it arrived on.
     *
     * **The generation is a PARAMETER, threaded down from `#readLoop`, never
     * `this.#generation`** (#295). The object in hand IS the generation the
     * frame arrived on, so the route costs no identity predicate. Reaching
     * through the field instead lets a discard landing inside `readReply`
     * record a pattern against a generation that never confirmed it — #245
     * again — and correctness would then need `this.#generation?.conn === conn`
     * plus a `conn` parameter here.
     */
    #dispatch(reply: RespReply, generation: SocketGeneration): void {
        if (reply.type !== 'array') return
        // THE SUBSCRIBE ACKNOWLEDGEMENT. Three elements, not four, which is why
        // the guard below used to discard it: `[ "psubscribe", <pattern>,
        // <count> ]`, and the count is an INTEGER — writing `reply.type ===
        // 'simple'` here produces a branch that never fires, because
        // `+psubscribe` is an array push frame and not a RESP simple string.
        //
        // This is the ONLY write of "the broker acknowledged it". An activation
        // awaits that its frame reached the socket and nothing more, so
        // recording at the write instead is #245: a pattern recorded but never
        // subscribed, and an instance permanently deaf on it.
        if (reply.value.length === 3) {
            const [kind, name, tail] = reply.value
            if (kind.type !== 'bulk' || name.type !== 'bulk') return
            // A `message` PUSH FRAME is also three elements — `[ "message",
            // <channel>, <payload> ]` — and it is a DELIVERY, not an
            // acknowledgement. An exact subscription delivers this shape where
            // a pattern subscription delivers `pmessage`; telling them apart by
            // length alone would route every exact-topic message into the
            // acknowledgement branch and drop it.
            if (kind.value === 'message' && tail.type === 'bulk') {
                this.#deliver(name.value, name.value, tail.value)
                return
            }
            // An acknowledgement's third element is an INTEGER, the subscription
            // count. Both verbs are recorded, because an exact topic is issued
            // with `SUBSCRIBE` and only a glob with `PSUBSCRIBE`.
            if (kind.value === 'subscribe' || kind.value === 'psubscribe') {
                generation.confirm(name.value)
            }
            // An `unsubscribe` / `punsubscribe` acknowledgement is recognised
            // and DELIBERATELY ignored. The erasure was written when the frame
            // was enqueued, not here: acting on it would let a channel
            // re-watched inside the round trip lose the record the re-watch had
            // just made.
            return
        }
        if (reply.value.length !== 4) return
        const [kind, pattern, topic, payload] = reply.value
        if (
            kind.type !== 'bulk' || kind.value !== 'pmessage' ||
            pattern.type !== 'bulk' || topic.type !== 'bulk' ||
            payload.type !== 'bulk'
        ) {
            // A subscribe confirmation or any non-pmessage frame — not delivered.
            return
        }
        this.#deliver(pattern.value, topic.value, payload.value)
    }

    /**
     * Hand one delivery to its recorded handler, containing whatever it throws.
     *
     * The `key` is what the handler was recorded under — a glob for a
     * `pmessage`, the channel itself for a `message` — and the `topic` is
     * always the concrete one the broker delivered. Keeping them apart is what
     * lets a consumer derive the channel from the topic rather than from
     * whatever it happened to subscribe.
     */
    #deliver(key: string, topic: string, payload: string): void {
        const handler = this.patterns.get(key)
        if (!handler) return
        try {
            const result: unknown = handler(topic, payload)
            // ASYNC HANDLERS TOO. `catch` sees a synchronous throw and nothing
            // else, so an `async` handler — or any handler returning a promise
            // — hands back a REJECTED promise that nothing awaits, which is the
            // very unobserved rejection #296 is about. The port's handler type
            // returns `void`, and TypeScript assigns a `Promise<void>` to that
            // happily, so an application reaches this by writing the natural
            // thing. Found at the review gate: containment that covers only
            // half the shapes an application can pass is containment that will
            // be reported as not working.
            if (
                typeof (result as { then?: unknown } | null | undefined)
                    ?.then === 'function'
            ) {
                Promise.resolve(result).catch((error: unknown) =>
                    this.#reportHandlerFault(key, error)
                )
            }
        } catch (error) {
            this.#reportHandlerFault(key, error)
        }
    }

    /**
     * Report a fault raised by an application handler, without letting it
     * escape into the read loop (#296).
     *
     * **Why this exists at all.** `#dispatch` sat outside `#readLoop`'s `try`,
     * so a throw here propagated out of a promise nothing awaited for
     * rejection and Deno terminated the process with code 1. One bug in one
     * application broadcast handler took down the whole server and every
     * unrelated connection on it — and the payload that triggered it arrives
     * from a peer, so the trigger is remote even though the defect is the
     * app's.
     *
     * **Why containment is SAFE here, which is not self-evident.** Dropping a
     * message instead of crashing is fail-OPEN, and one consumer of this seam —
     * `@lockness/realtime`'s control plane — uses it to enforce evictions. It
     * is safe because that consumer has a durable backstop (its revocation
     * reconcile), so a dropped eviction is delayed rather than lost. **A
     * consumer without such a backstop must not rely on this catch.** That is
     * why the line is ERROR with a stable prefix an alert can match, and not a
     * WARN.
     *
     * **What the line may carry, and what it may not.** The pattern and the
     * error. Never `topic`, and never `payload`. `safeForLog` would not make
     * that safe — it is a log-injection encoder, not a redactor, and it
     * truncates at 512 characters, while a realtime control payload is a signed
     * `{kind, target, origin, ts, nonce, mac}` frame that fits comfortably
     * inside that. Logging it would write a replayable authenticated `evict`
     * into the log store, where the per-process replay window that normally
     * guards it does not apply to a restarted instance. `renderError` is
     * required rather than optional for the error itself, because an
     * application's message routinely embeds the payload it choked on.
     *
     * **Throttled, and never detached.** The peer chooses the frame rate, so a
     * handler that throws on every frame is a peer-driven log flood — and a
     * blocked stderr back-pressures this very read loop into missing its
     * liveness window. The first fault per pattern per socket generation is
     * logged in full; the rest are counted. Detaching the handler is not on the
     * table: it would turn a recoverable application defect into permanent
     * silent loss, the same reasoning `#fireReconnect` records for its own
     * seam.
     */
    #reportHandlerFault(pattern: string, error: unknown): void {
        const seen = this.#handlerFaults.get(pattern) ?? 0
        this.#handlerFaults.set(pattern, seen + 1)
        // ONE full report per SOCKET GENERATION, not one per pattern
        // (#295/FR-014).
        //
        // The throttle used to be per pattern, which was one ERROR per
        // generation while a deployment held one prefix-wide subscription.
        // Under per-channel subscribe a single broken handler is registered
        // against every hosted channel, so it becomes one stack trace per
        // channel — three thousand of them — and a blocked stderr
        // back-pressures the read loop past its own liveness window. The
        // containment turns into the outage.
        //
        // ATTRIBUTION IS NOT LOST: `#discardSocket` emits the per-pattern tally
        // before clearing, so suppression bounds the VOLUME without hiding
        // which handlers failed. Collapsing to one key would have bounded the
        // volume by deleting the answer.
        if (this.#handlerFaults.size > 1 || seen > 0) {
            return
        }
        console.error(
            `[redis-subscribe] a handler for ${safeForLog(pattern)} threw; ` +
                'the message was DROPPED and delivery continues. Further ' +
                'faults for this pattern are counted, not logged, until the ' +
                `socket reconnects: ${renderError(error)}`,
        )
    }

    /**
     * Close the subscribe socket and release its resources.
     *
     * Deregisters the shutdown disposable, clears the keepalive and any pending
     * retry, discards the live socket (stopping the read loop), and awaits the
     * loop's unwind so no `conn.read` is left pending. Idempotent.
     *
     * It does **not** await an in-flight dial. Against an unroutable host that
     * waits out the OS SYN budget — ~75s on macOS, ~130s on Linux — which is
     * minutes of blocking at exactly the moment an operator restarts during an
     * outage. The pending dial's own continuation observes `closed` and discards
     * whatever it receives.
     *
     * @returns Resolves once the socket is closed and the read loop has stopped.
     * @example
     * ```typescript
     * await sub.close()
     * ```
     */
    async close(): Promise<void> {
        this.closed = true
        // Unconditional, where `#discardSocket`'s release is conditional. The
        // asymmetry is load-bearing: `close()` is ending the connection, not
        // arbitrating between two generations, so it silences whatever timer is
        // armed without asking whose it is.
        this.#generation?.clearKeepalive()
        this.#clearRetry()
        if (this.#handle) {
            deregisterDisposable(this.#handle)
            this.#handle = undefined
        }
        // Discard what is live; do NOT await `connect()`. A dial in flight to an
        // unreachable host does not fail fast — it waits out the OS SYN budget,
        // ~75s on macOS and ~130s on Linux — and awaiting it made `close()` block
        // for minutes at exactly the moment an operator restarts during an
        // outage. The pending dial's own continuation sees `closed` and discards
        // the socket it receives.
        const live = this.conn.socket
        if (live) this.#discardSocket(live)
        this.loopConn = null
        await this.loopDone
    }
}
