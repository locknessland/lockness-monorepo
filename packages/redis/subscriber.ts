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
 *   inferred: `psubscribe` enters through `#connectAndSubscribe`, the read loop's
 *   fault path through `#reconnectAll`, and only the second fires
 *   {@link RedisSubscribeConnection.onReconnect}. Consumers that must reconcile
 *   what a lost pub/sub frame would have carried hang off that seam.
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
    /** The keepalive interval's id, or `undefined` when no socket is live. */
    #keepaliveTimer: ReturnType<typeof setInterval> | undefined
    /**
     * The socket the armed keepalive belongs to.
     *
     * `#discardSocket` used to clear the keepalive unconditionally, so
     * discarding a STALE socket while a newer one was live disarmed the live
     * one's keepalive — and the idle churn this feature removes came silently
     * back. The timer belongs to a socket, so the clear has to know which.
     */
    #keepaliveConn: Deno.Conn | null = null
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
     * The pending retry chain's reconnect identity, latched **monotonically**:
     * a retry may promote a chain to "reconnect" and never demote it.
     *
     * Both directions were reachable — a `psubscribe` failure carries `false`
     * while the read loop's fault on the same broken socket carries `true` — and
     * only one retry slot exists. Latching upward is the fail-safe choice: the
     * consumer's revocation re-check is idempotent reconciliation, so an extra
     * fire costs one round-trip and a missed one costs enforcement latency.
     */
    #retryIsReconnect = false
    /**
     * The write queue. Every frame reaching the socket is appended here, so
     * `PSUBSCRIBE`, the keepalive `PING` and a retry's re-issue can never
     * interleave at a short-write boundary. Mirrors {@link RedisClient}'s own
     * serialization rather than inventing a second shape.
     *
     * The interleaving that matters is not the noisy one: a corrupted frame that
     * Redis rejects self-heals through the read loop's fault path. A corrupted
     * frame that is still VALID — a `PSUBSCRIBE` on a truncated pattern — raises
     * nothing, and `#dispatch` then routes by the pmessage's own pattern value,
     * so every frame is silently dropped forever.
     */
    #writeChain: Promise<void> = Promise.resolve()
    /**
     * The socket {@link #writeChain} belongs to — the pairing that makes the
     * queue per **generation** rather than per connection object (#286).
     *
     * Mirrors {@link #keepaliveTimer} / {@link #keepaliveConn} deliberately,
     * including the conditional clear in {@link #discardSocket}. An
     * unconditional reset is the shape that was a live defect one field over:
     * discarding a STALE socket while a newer one was live disarmed the live
     * one's keepalive. Here it would delete the live socket's write
     * serialization — the thing that stops two writes splicing at a short-write
     * boundary into a still-valid truncated frame, which raises nothing and
     * drops every message forever.
     */
    #writeChainConn: Deno.Conn | null = null
    /**
     * Handler faults per pattern, for the current socket generation (#296).
     *
     * Cleared in {@link #discardSocket}, so the first fault after every
     * reconnect is logged in full. That reset is what stops a suppression
     * window hiding a security-control failure for the lifetime of a process.
     */
    readonly #handlerFaults = new Map<string, number>()
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
        void this.#connectAndSubscribe()
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
     * The FIRST-CONNECT entry point: dial, issue every recorded pattern, start
     * the read loop. It does **not** fire the reconnect seam.
     *
     * Split from {@link RedisSubscribeConnection.#reconnectAll} deliberately
     * (#271, plan §5): the shared body cannot tell its two callers apart, so "is
     * this a reconnect" is decided by WHICH entry point was called, not by a flag
     * threaded through or a state variable read back.
     *
     * **It issues every recorded pattern, not the one that triggered it** (#245,
     * FR-011). It used to take a single pattern, and that was a live defect: the
     * realtime driver subscribes twice back-to-back over one single-flight dial,
     * so a transient blip rejected both — and with one retry slot, the survivor
     * re-entered here and re-issued only its own pattern. The other sat recorded
     * but never subscribed, leaving the instance permanently deaf on the control
     * topic with a log that had gone quiet. Re-`PSUBSCRIBE` of a live pattern is
     * a no-op on Redis, which `#reconnectAll` has always depended on.
     */
    #connectAndSubscribe(): Promise<void> {
        return this.#activate([...this.patterns.keys()], false)
    }

    /**
     * The RECONNECT entry point: re-dial and re-issue EVERY active pattern
     * (FR-003), then fire the reconnect seam. The seam fires from here and
     * nowhere else, and only once the re-issue has actually succeeded.
     */
    #reconnectAll(): Promise<void> {
        return this.#activate([...this.patterns.keys()], true)
    }

    /**
     * Append a frame to the socket's single write queue.
     *
     * Every writer goes through here — see {@link #writeChain} for why. The chain
     * is kept alive across a rejection so one failed write cannot wedge the queue
     * for the recovery that follows it.
     */
    #write(conn: Deno.Conn, frame: Uint8Array): Promise<void> {
        // MECHANISM 1 — rebase on a generation change, so a new socket's first
        // write does not queue behind a dead socket's backlog. The recovery
        // would otherwise wait for the thing it is recovering from.
        if (this.#writeChainConn !== conn) {
            this.#writeChain = Promise.resolve()
            this.#writeChainConn = conn
        }
        const next = this.#writeChain.then(() => {
            // MECHANISM 2 — re-check INSIDE the queued closure. Rebasing the
            // field does not cancel a write already chained behind an in-flight
            // one, so without this a queued frame still reaches a dead socket.
            //
            // It REJECTS rather than resolving quietly: a silently-dropped
            // write would leave `#activate`'s await unsettled, which is #286's
            // own defect — an activation that neither completes nor fails —
            // relocated into the queue reset.
            if (this.#writeChainConn !== conn) {
                throw new Error(
                    'Redis write abandoned: the socket generation changed ' +
                        'while this frame was queued. Nothing was written.',
                )
            }
            return writeFrame(conn, frame, this.#writeDeadlineMs)
        })
        this.#writeChain = next.then(
            () => {},
            () => {},
        )
        return next
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
        this.#handlerFaults.clear()
        // Conditional, like every other clear in this method. See
        // `#writeChainConn` for what an unconditional one costs.
        if (this.#writeChainConn === conn) {
            this.#writeChain = Promise.resolve()
            this.#writeChainConn = null
        }
        // Only if the timer belongs to THIS socket. See `#keepaliveConn`.
        //
        // Also defensive and also untested: for a STALE socket to be discarded
        // while a newer one is live, an activation holding the old socket would
        // have to outlive a reconnect, and every current path discards before it
        // schedules. The guard is kept because the ownership it encodes is what
        // a future path would otherwise get wrong silently — the failure mode is
        // the #274 idle churn coming back with nothing in the log.
        if (this.#keepaliveConn === conn) this.#clearKeepalive()
        this.conn.discard(conn)
        if (this.loopConn === conn) this.loopConn = null
    }

    /** Stop the keepalive interval, if one is armed. */
    #clearKeepalive(): void {
        if (this.#keepaliveTimer !== undefined) {
            clearInterval(this.#keepaliveTimer)
            this.#keepaliveTimer = undefined
        }
        this.#keepaliveConn = null
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
    #armKeepalive(conn: Deno.Conn): void {
        this.#clearKeepalive()
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
                // message forever (see `#writeChain`).
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
        this.#keepaliveTimer = id
        this.#keepaliveConn = conn
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
        isReconnect: boolean,
    ): Promise<void> {
        if (this.closed) return
        let conn: Deno.Conn | undefined
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
            for (const pattern of toIssue) {
                await this.#write(conn, encodeCommand(['PSUBSCRIBE', pattern]))
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
            if (this.loopConn !== conn) {
                this.loopConn = conn
                this.#loopStartedAt = Date.now()
                this.loopDone = this.#readLoop(conn)
            }
            this.#armKeepalive(conn)
            // The seam fires INSIDE the try and AFTER the re-issue loop, so a
            // reconnect whose PSUBSCRIBE never landed is not reported as one.
            if (isReconnect) await this.#fireReconnect()
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
                return
            }
            // BEFORE the retry, and not optional: `connect()` hands back the
            // cached socket, so a retry that skips this feeds every later attempt
            // the same corpse and loops forever while logging "retrying".
            if (conn) this.#discardSocket(conn)
            this.#scheduleRetry(isReconnect, error)
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
        console.warn(
            `[redis-subscribe] recovered at ${
                safeForLog(this.hostname)
            } after ` +
                `${this.#attempts} failed attempt(s) over ${elapsed}ms; ` +
                `${this.patterns.size} subscription(s) re-issued`,
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
        this.#retryIsReconnect ||= isReconnect
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
            const asReconnect = this.#retryIsReconnect
            this.#retryIsReconnect = false
            void this.#activate([...this.patterns.keys()], asReconnect)
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
    async #readLoop(conn: Deno.Conn): Promise<void> {
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
            this.#dispatch(reply)
        }
    }

    /** Route a `pmessage` push frame to the pattern's handler; ignore the rest. */
    #dispatch(reply: RespReply): void {
        if (reply.type !== 'array' || reply.value.length !== 4) return
        const [kind, pattern, topic, payload] = reply.value
        if (
            kind.type !== 'bulk' || kind.value !== 'pmessage' ||
            pattern.type !== 'bulk' || topic.type !== 'bulk' ||
            payload.type !== 'bulk'
        ) {
            // A subscribe confirmation or any non-pmessage frame — not delivered.
            return
        }
        const handler = this.patterns.get(pattern.value)
        if (!handler) return
        try {
            const result: unknown = handler(topic.value, payload.value)
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
                    this.#reportHandlerFault(pattern.value, error)
                )
            }
        } catch (error) {
            this.#reportHandlerFault(pattern.value, error)
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
        if (seen > 0) {
            // Already reported for this pattern on this socket generation. The
            // count is emitted with the first fault of the NEXT generation, so
            // suppression can never hide the failure indefinitely.
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
        this.#clearKeepalive()
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
