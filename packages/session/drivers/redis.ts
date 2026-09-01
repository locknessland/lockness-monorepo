/**
 * @fileoverview Redis session driver.
 *
 * @module @lockness/session/drivers/redis
 */

import { renderError } from '@lockness/contract'
import {
    deregisterDisposable,
    type DisposableHandle,
    registerDisposable,
} from '@lockness/contract/lifecycle/internal'
import type { SessionData, SessionDriver } from '../types.ts'
import {
    encodeCommand,
    readReply,
    type RespReply,
    RespServerError,
    writeFrame,
} from './resp.ts'

/**
 * A failed Redis read — a connection or protocol fault, never a cache miss.
 *
 * `RedisSessionDriver.read` throws this (rather than swallowing the failure as
 * `null`) so an outage is distinguishable from an absent key. Its message is
 * deliberately generic; the underlying cause travels on `.cause` for logs, not
 * for the client, so the framework renders a generic 500 with no RESP text or
 * connection detail (FR-005).
 */
export class RedisReadError extends Error {
    /**
     * @param message - The generic, client-safe message (no RESP or connection
     *   detail); the underlying fault travels on `options.cause` for logs only.
     * @param options - Optional `{ cause }` carrying the originating error.
     */
    constructor(message: string, options?: { cause?: unknown }) {
        super(message, options)
        this.name = 'RedisReadError'
    }
}

/**
 * A short, non-reversible fingerprint of a session id, safe to log.
 *
 * The session id is a bearer credential — `session:<id>` is the Redis key — so
 * the raw value must never reach a log store. `safeForLog` neutralises control
 * characters but passes a hex id through verbatim, so it cannot redact a
 * credential; an FNV-1a fingerprint lets an operator correlate log lines without
 * exposing the token (FR-005, decided at T014).
 *
 * @param sessionId - The raw session id.
 * @returns A `session#<8-hex>` fingerprint that never contains the raw id.
 */
function redactSessionId(sessionId: string): string {
    let hash = 0x811c9dc5
    for (let i = 0; i < sessionId.length; i++) {
        hash ^= sessionId.charCodeAt(i)
        hash = Math.imul(hash, 0x01000193)
    }
    return `session#${(hash >>> 0).toString(16).padStart(8, '0')}`
}

/**
 * Redis session driver.
 *
 * Persistent session storage using Redis server.
 * Implements RESP protocol directly without external dependencies.
 *
 * @remarks
 * The driver holds a single connection whose RESP reply reader expects exactly
 * one reply per command, so overlapping commands must never interleave their
 * frames. This is enforced **inside the driver**: `connect()` is single-flighted
 * (a cold-start burst opens one socket), and `sendCommand` serializes every
 * exchange through a per-connection command queue, so the second command's frame
 * is written only after the first command's reply is fully drained. The driver
 * is therefore safe to memoize and share across requests per process
 * (`drivers/registry.ts`) — the #138 gate that kept it per-request was lifted by
 * this serialization (#145). `connect()`'s own `AUTH`/`SELECT` bypass the queue
 * (via the private `#exchange`) so they cannot deadlock against it.
 *
 * @example
 * ```typescript
 * const driver = new RedisSessionDriver({
 *   hostname: 'localhost',
 *   port: 6379,
 *   password: 'secret',
 *   db: 1,
 * })
 * ```
 */
export class RedisSessionDriver implements SessionDriver {
    private connection: Deno.Conn | null = null
    /**
     * The in-flight `connect()` promise, cached so a concurrent cold-start burst
     * on a shared (memoized) instance opens **one** socket. Without it, `connect`
     * is a check-then-act across an `await` — two concurrent first-commands would
     * each open a socket and authenticate, orphaning one (the race #138 fixed for
     * `Deno.openKv`). Dropped on rejection and on a desync so the next command
     * reconnects.
     */
    private connectPromise: Promise<Deno.Conn> | null = null
    /**
     * The tail of the per-connection command queue. Every `sendCommand` chains
     * its exchange onto this promise, so two overlapping calls never interleave
     * their frames on the shared socket — the second's write begins only after
     * the first's reply is fully drained (#145 / Security-S5). The tail swallows
     * so a failed command does not wedge the queue; the returned promise still
     * rejects to its own caller.
     */
    private commandTail: Promise<unknown> = Promise.resolve()
    #handle: DisposableHandle | undefined
    private readonly config: {
        hostname: string
        port: number
        password?: string
        db?: number
    }

    constructor(config: {
        hostname: string
        port?: number
        password?: string
        db?: number
    }) {
        this.config = {
            hostname: config.hostname,
            port: config.port ?? 6379,
            password: config.password,
            db: config.db ?? 0,
        }
    }

    /**
     * Open (once) and return the authenticated connection.
     *
     * Single-flighted: the in-flight promise is cached so a concurrent burst
     * opens one socket and issues `AUTH`/`SELECT` once. Those handshake commands
     * go through the private {@link RedisSessionDriver.#exchange} **directly**,
     * never `sendCommand`, so they cannot re-enter and deadlock the command queue
     * that awaits `connect()`. On any failure the socket is closed and the cached
     * promise dropped, so the next command retries (self-heal).
     */
    private connect(): Promise<Deno.Conn> {
        if (this.connection) return Promise.resolve(this.connection)
        if (!this.connectPromise) {
            const p = (async () => {
                const conn = await Deno.connect({
                    hostname: this.config.hostname,
                    port: this.config.port,
                })
                try {
                    if (this.config.password) {
                        await this.#exchange(conn, [
                            'AUTH',
                            this.config.password,
                        ])
                    }
                    if (this.config.db !== 0) {
                        await this.#exchange(conn, [
                            'SELECT',
                            String(this.config.db),
                        ])
                    }
                } catch (error) {
                    // The handshake failed on a fresh socket that was never
                    // published to `this.connection`; close it and let the
                    // rejection propagate (the `p.catch` below resets the memo).
                    try {
                        conn.close()
                    } catch {
                        // Already closed by the failure itself.
                    }
                    throw error
                }
                this.connection = conn
                // Registered only once a socket exists, so shutdown releases it.
                // A driver owning nothing enrols nothing.
                this.#handle ??= registerDisposable({
                    name: 'session:redis',
                    dispose: () => this.close(),
                    priority: 60,
                })
                return conn
            })()
            // Self-heal: drop the cached promise on rejection so the next command
            // retries rather than re-awaiting a permanently-failed connect that
            // would brick the memoized driver until restart. The `=== p` guard
            // keeps the single-flight — concurrent callers still await one open.
            p.catch(() => {
                if (this.connectPromise === p) this.connectPromise = null
            })
            this.connectPromise = p
        }
        return this.connectPromise
    }

    /**
     * One request/reply exchange on an already-open socket: write the frame in
     * full, then drain exactly one RESP reply. Pure — it touches no shared driver
     * state, so it is reused by both `connect()` (for `AUTH`/`SELECT`, outside
     * the command queue) and the serialized command path. `resp.ts` owns the
     * framing (`encodeCommand`/`writeFrame`) and the bounded, nil-aware drain
     * (`readReply`, #139).
     */
    #exchange(conn: Deno.Conn, args: string[]): Promise<RespReply> {
        return writeFrame(conn, encodeCommand(args)).then(() => readReply(conn))
    }

    /**
     * Issue a command on the shared connection, serialized against every other
     * command so their frames never interleave (Security-S5).
     *
     * The exchange runs as one link in a per-connection promise chain: it
     * `await`s `connect()` **inside** the serialized section (so a command queued
     * behind a desync re-establishes the socket freshly) and then exchanges.
     * The connection is kept ONLY when the socket is left in sync — exactly
     * `RespServerError` (a complete `-ERR …` reply or an in-sync parse fault, the
     * whole reply off the wire). Every other failure (a wire fault, or a
     * `RespFramingError` thrown after the length line but before the payload was
     * drained — possibly 10 MiB and hostile) leaves the socket DESYNCED, so it is
     * closed and both `connection` and `connectPromise` are dropped; the next
     * command reconnects clean (FR-005).
     */
    private sendCommand(args: string[]): Promise<RespReply> {
        const run = this.commandTail.then(() => this.#serializedExchange(args))
        // The tail must always settle so the next command runs; the returned
        // `run` still rejects to this caller (no silent catch).
        this.commandTail = run.catch(() => {})
        return run
    }

    async #serializedExchange(args: string[]): Promise<RespReply> {
        const conn = await this.connect()
        try {
            return await this.#exchange(conn, args)
        } catch (error) {
            if (!(error instanceof RespServerError)) {
                this.#discardConnection(conn)
            }
            throw error
        }
    }

    /**
     * Close a desynced socket and drop the shared state pointing at it, so the
     * next `connect()` opens a fresh one. Clears `connection` only if it still
     * refers to `conn` (a shutdown `close()` may already have replaced it).
     */
    #discardConnection(conn: Deno.Conn): void {
        try {
            conn.close()
        } catch {
            // Already closed by the failure itself; nothing to free.
        }
        if (this.connection === conn) this.connection = null
        this.connectPromise = null
    }

    /**
     * Read a session by id.
     *
     * @param sessionId - The session identifier (the `session:<id>` Redis key).
     * @returns The stored session data, or `null` for a genuine cache miss (a
     *   RESP nil reply) only.
     * @throws {RedisReadError} On any connection or protocol failure — logged
     *   once at ERROR with the id redacted, then rethrown, so an outage is never
     *   mistaken for a miss (FR-005).
     */
    async read(sessionId: string): Promise<SessionData | null> {
        try {
            const reply = await this.sendCommand([
                'GET',
                `session:${sessionId}`,
            ])
            // A RESP nil bulk is the ONLY cache miss — return null, no log.
            if (reply.type === 'nil') return null
            if (reply.type === 'bulk' || reply.type === 'simple') {
                return JSON.parse(reply.value) as SessionData
            }
            // Any other reply to a GET is a protocol violation, not a miss.
            throw new Error(`unexpected RESP reply for GET: ${reply.type}`)
        } catch (error) {
            // Every failure — connection down, protocol error, corrupt JSON —
            // is logged ONCE at ERROR with a redacted id (never the raw
            // `session:<id>`, a bearer credential) and rethrown as a typed error
            // (FR-005). Only the genuine nil above returns null. The upstream
            // framework handler renders this without re-logging, as a generic
            // 500 carrying no RESP text or connection detail.
            console.error(
                `[session] redis read failed for ${
                    redactSessionId(sessionId)
                }: ${renderError(error)}`,
            )
            throw new RedisReadError('session read failed', { cause: error })
        }
    }

    /**
     * Write a session with a fresh expiry, via `SETEX`.
     *
     * @param sessionId - The session identifier.
     * @param data - The session data to store (serialised to JSON).
     * @param lifetime - The session lifetime in seconds (the `SETEX` expiry).
     */
    async write(
        sessionId: string,
        data: SessionData,
        lifetime: number,
    ): Promise<void> {
        await this.sendCommand([
            'SETEX',
            `session:${sessionId}`,
            String(lifetime),
            JSON.stringify(data),
        ])
    }

    /**
     * Destroy a session, via `DEL`.
     *
     * @param sessionId - The session identifier to delete.
     */
    async destroy(sessionId: string): Promise<void> {
        await this.sendCommand(['DEL', `session:${sessionId}`])
    }

    /**
     * Atomic id rotation, server-side, in one round-trip.
     *
     * `GET` the old key; if present, `SET` the new key with the same value and a
     * fresh `EX <lifetime>`, then `DEL` the old key. Because a Redis Lua script
     * runs as one indivisible unit, no failure path can leave the authenticated
     * data on the new id while the attacker-known old id also still resolves
     * (FR-011). The session bytes never leave the server — they move key-to-key
     * inside Redis — and `EVAL` is one command / one reply, so it needs no
     * array-reply parsing added to the one-reply-per-command client (#145).
     */
    private static readonly REGENERATE_SCRIPT = [
        "local v = redis.call('GET', KEYS[1])",
        'if v then',
        "  redis.call('SET', KEYS[2], v, 'EX', ARGV[1])",
        "  redis.call('DEL', KEYS[1])",
        'end',
        'return 1',
    ].join('\n')

    async regenerate(
        oldId: string,
        newId: string,
        lifetime: number,
    ): Promise<void> {
        // Lifetime is the passed param — never `config.db`, which defaults to 0
        // and produced `SETEX <key> 0` (a login-500) in the pre-#139 body.
        await this.sendCommand([
            'EVAL',
            RedisSessionDriver.REGENERATE_SCRIPT,
            '2',
            `session:${oldId}`,
            `session:${newId}`,
            String(lifetime),
        ])
    }

    /**
     * Close the connection and release its resources.
     *
     * Deregisters the shutdown disposable first (so a shutdown drain does not
     * re-enter), then — if a socket is live or being opened — serializes a `QUIT`
     * through the command queue so it drains **after** any in-flight exchange
     * rather than tearing it out (Security F3). Idempotent: with nothing open it
     * is a no-op, and it never *reopens* a closed socket. A failing `QUIT` is not
     * fatal — the socket is closed regardless.
     */
    close(): Promise<void> {
        if (this.#handle) {
            deregisterDisposable(this.#handle)
            this.#handle = undefined
        }
        // Nothing live and nothing being opened → do not reopen a socket.
        if (!this.connection && !this.connectPromise) return Promise.resolve()

        const run = this.commandTail.then(async () => {
            // A desync (or a prior close) may have cleared it while we queued.
            const conn = this.connection
            if (!conn) return
            try {
                await this.#exchange(conn, ['QUIT'])
            } catch {
                // QUIT failing does not change the outcome: we close anyway.
            }
            try {
                conn.close()
            } catch {
                // Already closed by the QUIT round-trip or a concurrent close.
            }
            if (this.connection === conn) this.connection = null
            this.connectPromise = null
        })
        this.commandTail = run.catch(() => {})
        return run
    }
}
