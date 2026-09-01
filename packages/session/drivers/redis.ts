/**
 * @fileoverview Redis session driver.
 *
 * @module @lockness/session/drivers/redis
 */

import { renderError } from '@lockness/contract'
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
 * Commands must be issued one at a time per instance: the driver holds a single
 * connection and its RESP reply reader expects exactly one reply per command,
 * so two overlapping `sendCommand` calls would interleave frames and desync the
 * socket. The framework satisfies this by constructing one driver per request
 * and awaiting each call (`session/middleware.ts`); a consumer using this class
 * directly must serialize its own calls. Per-connection command serialization,
 * single-flight connect and per-process memoization of this driver are tracked
 * in
 * {@link https://github.com/locknessland/lockness-monorepo/issues/145 | #145}.
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

    private async connect(): Promise<Deno.Conn> {
        if (!this.connection) {
            this.connection = await Deno.connect({
                hostname: this.config.hostname,
                port: this.config.port,
            })

            // Authenticate if password provided
            if (this.config.password) {
                await this.sendCommand(['AUTH', this.config.password])
            }

            // Select database if specified
            if (this.config.db !== 0) {
                await this.sendCommand(['SELECT', String(this.config.db)])
            }
        }
        return this.connection
    }

    private async sendCommand(args: string[]): Promise<RespReply> {
        const conn = await this.connect()

        // The RESP frame is built and written by `resp.ts` — the one home for
        // "how many bytes an argument occupies" (`encodeCommand`) and "the
        // frame is on the wire in full before a reply is read" (`writeFrame`).
        // A write that fails after partial progress leaves the socket desynced
        // and unrecoverable, so the connection is closed and discarded before
        // the error propagates; the next command reconnects clean (FR-004a).
        // Closing frees the fd and the Redis client slot the half-written frame
        // would otherwise hold.
        try {
            await writeFrame(conn, encodeCommand(args))
        } catch (error) {
            try {
                conn.close()
            } catch {
                // Already closed by the failure itself; nothing to free.
            }
            this.connection = null
            throw error
        }

        // Reply reading and framing live in `resp.ts` too (#139): `readReply`
        // drains the connection until the RESP reply is complete, keeps a nil
        // bulk distinct from an empty one, and is bounded by a max bulk length
        // and a read timeout. The old single-4096-byte read + `.split('\r\n')`
        // `parseResponse` — which truncated any reply past one read and lost the
        // nil-vs-empty distinction — is gone.
        //
        // The connection is kept ONLY when the socket is left in sync, which is
        // exactly `RespServerError`: a complete, well-framed reply the server
        // sent (`-ERR …`) or an in-sync parse fault — the whole reply is off the
        // wire, so the next command's reply is correctly framed. Discarding it
        // there would drop a healthy link on every server-level error.
        //
        // Every other failure leaves the socket DESYNCED, so the connection is
        // closed and discarded and the next command reconnects clean:
        //   - a wire fault (EOF mid-frame, read timeout) — the reply never
        //     completed;
        //   - a `RespFramingError` — an oversized/malformed bulk length or an
        //     unexpected type byte, thrown AFTER the length/type line was read
        //     but BEFORE the declared payload was drained, so unread bytes remain
        //     on the wire. The abandoned payload is NOT drained to resync — it
        //     may be 10 MiB and hostile; closing is the safe resolution.
        try {
            return await readReply(conn)
        } catch (error) {
            if (!(error instanceof RespServerError)) {
                try {
                    conn.close()
                } catch {
                    // Already closed by the failure itself; nothing to free.
                }
                this.connection = null
            }
            throw error
        }
    }

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

    async close(): Promise<void> {
        if (this.connection) {
            await this.sendCommand(['QUIT'])
            this.connection.close()
            this.connection = null
        }
    }
}
