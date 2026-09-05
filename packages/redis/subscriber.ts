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
import { encodeCommand, readReply, type RespReply, writeFrame } from './resp.ts'

/**
 * The default shutdown-drain priority for the subscribe socket's disposable.
 * Mirrors the {@link RedisClient} default so lifecycle ordering is consistent.
 */
const DEFAULT_DISPOSABLE_PRIORITY = 60

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

    /**
     * @param config - The connection settings; only `hostname` is required.
     */
    constructor(config: RedisSubscribeConnectionConfig) {
        this.conn = new AuthenticatedConnection(config)
        this.hostname = config.hostname
        this.disposableName = config.disposableName ?? 'redis-subscribe'
        this.disposablePriority = config.disposablePriority ??
            DEFAULT_DISPOSABLE_PRIORITY
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
        void this.#connectAndSubscribe(pattern)
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
     * The FIRST-CONNECT entry point: dial, issue this one `PSUBSCRIBE`, start the
     * read loop. It does **not** fire the reconnect seam.
     *
     * Split from {@link RedisSubscribeConnection.#reconnectAll} deliberately
     * (#271, plan §5 row 1): the shared body cannot tell its two callers apart,
     * so "is this a reconnect" is decided by WHICH entry point was called, not by
     * a flag threaded through or a state variable read back. Both delegate to
     * {@link RedisSubscribeConnection.#activate}.
     */
    #connectAndSubscribe(pattern: string): Promise<void> {
        return this.#activate([pattern], false)
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
     * Ensure the socket is connected, issue `PSUBSCRIBE` for `toIssue`, and make
     * sure a read loop is draining it. A connect/subscribe failure is logged at
     * WARN (never silent) rather than thrown, because callers are the synchronous
     * `psubscribe` and the background reconnect.
     */
    async #activate(
        toIssue: readonly string[],
        isReconnect: boolean,
    ): Promise<void> {
        if (this.closed) return
        try {
            const conn = await this.conn.connect()
            this.#handle ??= registerDisposable({
                name: this.disposableName,
                dispose: () => this.close(),
                priority: this.disposablePriority,
            })
            for (const pattern of toIssue) {
                await writeFrame(conn, encodeCommand(['PSUBSCRIBE', pattern]))
            }
            if (this.loopConn !== conn && !this.closed) {
                this.loopConn = conn
                this.loopDone = this.#readLoop(conn)
            }
            // The seam fires INSIDE the try and AFTER the re-issue loop, so a
            // reconnect whose PSUBSCRIBE never landed is not reported as one.
            if (isReconnect) await this.#fireReconnect()
        } catch (error) {
            // Terminal either way — nothing here schedules a retry (#275) — but
            // say which, so the log distinguishes "never connected" from "was
            // connected and will not come back".
            const outcome = isReconnect
                ? 'no further reconnect will be attempted'
                : 'this subscription never reached the wire and will not be retried'
            console.warn(
                `[redis-subscribe] PSUBSCRIBE failed at ${
                    safeForLog(this.hostname)
                }, ${outcome}: ${renderError(error)}`,
            )
        }
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
                // Bounded by `resp.ts` (max bulk length + per-reply deadline), so
                // an oversized pushed payload is rejected before dispatch.
                reply = await readReply(conn)
            } catch (error) {
                if (this.closed) return
                console.warn(
                    `[redis-subscribe] read fault on ${
                        safeForLog(this.hostname)
                    }, reconnecting and re-issuing ${this.patterns.size} ` +
                        `subscription(s): ${renderError(error)}`,
                )
                this.conn.discard(conn)
                if (this.loopConn === conn) this.loopConn = null
                // Re-issue EVERY active pattern on the fresh socket (FR-003),
                // then fire the reconnect seam (#271/FR-001).
                void this.#reconnectAll()
                return
            }
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
        if (handler) handler(topic.value, payload.value)
    }

    /**
     * Close the subscribe socket and release its resources.
     *
     * Deregisters the shutdown disposable, resolves any in-flight open, closes the
     * socket (stopping the read loop), and awaits the loop's unwind so no
     * `conn.read` is left pending. Idempotent.
     *
     * @returns Resolves once the socket is closed and the read loop has stopped.
     * @example
     * ```typescript
     * await sub.close()
     * ```
     */
    async close(): Promise<void> {
        this.closed = true
        if (this.#handle) {
            deregisterDisposable(this.#handle)
            this.#handle = undefined
        }
        if (this.conn.isActive) {
            try {
                const conn = await this.conn.connect()
                this.conn.discard(conn)
            } catch (error) {
                // The open was already failing; nothing live to close. Logged so
                // a shutdown-time connect fault is visible, not swallowed.
                console.warn(
                    `[redis-subscribe] close observed a failed open at ${
                        safeForLog(this.hostname)
                    }: ${renderError(error)}`,
                )
            }
        }
        this.loopConn = null
        await this.loopDone
    }
}
