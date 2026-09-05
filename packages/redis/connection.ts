/**
 * @fileoverview The one home for a Redis socket's dial + TLS wrap + `AUTH`/
 * `SELECT` handshake + one-time cleartext-AUTH warning + self-heal discipline
 * (plan §5 "socket dial + TLS + handshake + self-heal", FR-013).
 *
 * Extracted from `RedisClient.connect` so the serialized-command client and the
 * subscribe-mode connection consume **one** copy of the security-critical
 * connect path rather than each re-implementing it — a future fix to Redis auth
 * or TLS then has a single home, not two (A1/S4, `shotgun-surgery`). What lives
 * here:
 *
 * - **Lazy, single-flight connect.** {@link AuthenticatedConnection.connect}
 *   caches the in-flight open so a concurrent cold-start burst opens exactly one
 *   socket; the handshake (`AUTH`/`SELECT`) runs once, on the fresh socket,
 *   before it is published as live.
 * - **TLS.** With `tls: true` the socket is wrapped by `Deno.connectTls`,
 *   certificate validation ON — there is no trust-all option (FR-004). With TLS
 *   off, sending `AUTH` over plaintext is the operator's explicit choice, and
 *   the constructor raises a one-time startup warning so the cleartext-credential
 *   exposure is not silent. The password itself is never logged.
 * - **Self-heal.** {@link AuthenticatedConnection.discard} closes a desynced
 *   socket and drops the cached state, so the next `connect()` opens a fresh one.
 *
 * What does **not** live here: the serialized-command queue and the QUIT-drain
 * close are `RedisClient`'s discipline; the continuous push-frame read loop is
 * the subscribe-mode connection's. Each consumer owns its own command discipline
 * and its own shutdown disposable — this primitive owns only the socket's birth
 * and its self-healing death.
 *
 * @module @lockness/redis/connection
 */

import { safeForLog } from '@lockness/contract'
import { encodeCommand, readReply, type RespReply, writeFrame } from './resp.ts'

/** The default Redis port, used when {@link AuthenticatedConnectionConfig.port} is omitted. */
const DEFAULT_PORT = 6379

/**
 * Connection settings for an {@link AuthenticatedConnection}.
 *
 * `hostname` is required; the rest carry Redis defaults. `tls` opts into a
 * TLS-wrapped socket with certificate validation ON — there is no trust-all
 * escape hatch (FR-004).
 */
export interface AuthenticatedConnectionConfig {
    /** Redis server hostname. */
    hostname: string
    /**
     * Redis server port.
     * @default 6379
     */
    port?: number
    /**
     * Password for `AUTH`. Never logged in cleartext (redacted via `safeForLog`).
     * Setting this with `tls: false` raises a one-time cleartext-AUTH warning at
     * construction.
     */
    password?: string
    /**
     * Database index selected with `SELECT` when non-zero.
     * @default 0
     */
    db?: number
    /**
     * Wrap the socket with TLS (`Deno.connectTls`), certificate validation ON.
     * With TLS off, `AUTH` travels over plaintext — the operator's explicit
     * choice, flagged by a one-time cleartext-AUTH warning when a password is
     * also set.
     * @default false
     */
    tls?: boolean
}

/**
 * One request/reply exchange on an already-open socket: write the frame in full,
 * then drain exactly one RESP reply. Pure — it touches no shared state, so the
 * handshake and any consumer's command path can share it. `resp.ts` owns the
 * framing (`encodeCommand`/`writeFrame`) and the bounded, nil-aware drain
 * (`readReply`).
 *
 * @param conn - The open connection to exchange on.
 * @param args - The command and its arguments, e.g. `['AUTH', 'secret']`.
 * @returns The parsed RESP reply.
 * @throws {RespServerError} On a framed server error or an in-sync parse fault.
 * @throws {RespFramingError} On an abandoned frame (the socket is desynced).
 * @throws {Error} On a wire fault or read timeout.
 * @example
 * ```typescript
 * const reply = await exchange(conn, ['PING'])
 * ```
 */
export function exchange(conn: Deno.Conn, args: string[]): Promise<RespReply> {
    return writeFrame(conn, encodeCommand(args)).then(() => readReply(conn))
}

/**
 * A single, lazily-opened, authenticated Redis socket with a self-heal seam.
 *
 * Not a client: it neither serializes commands nor reads push frames. It hands a
 * live, authenticated {@link Deno.Conn} to whoever asked and, on a fault, lets
 * that consumer {@link AuthenticatedConnection.discard} it so the next
 * {@link AuthenticatedConnection.connect} reconnects clean.
 *
 * @example
 * ```typescript
 * const conn = new AuthenticatedConnection({ hostname: 'localhost', db: 2 })
 * const socket = await conn.connect() // dialled, AUTH/SELECT already run
 * try {
 *   await exchange(socket, ['PING'])
 * } catch (error) {
 *   conn.discard(socket) // desynced — the next connect() reconnects
 *   throw error
 * }
 * ```
 */
export class AuthenticatedConnection {
    private connection: Deno.Conn | null = null
    /**
     * The in-flight `connect()` promise, cached so a concurrent cold-start burst
     * opens ONE socket. Dropped on rejection and on {@link discard} so the next
     * connect retries.
     */
    private connectPromise: Promise<Deno.Conn> | null = null
    private readonly config: {
        hostname: string
        port: number
        password?: string
        db: number
        tls: boolean
    }

    /**
     * @param config - The connection settings; only `hostname` is required.
     */
    constructor(config: AuthenticatedConnectionConfig) {
        this.config = {
            hostname: config.hostname,
            port: config.port ?? DEFAULT_PORT,
            password: config.password,
            db: config.db ?? 0,
            tls: config.tls ?? false,
        }
        // A password with TLS off means `AUTH` travels in cleartext. Warn ONCE
        // here — the constructor runs once per connection object, so a
        // self-healing reconnect never re-warns; this is a startup notice, not
        // per-connection spam. The password itself is never logged.
        if (this.config.password && !this.config.tls) {
            console.warn(
                `[redis] AUTH will be sent in cleartext to ${
                    safeForLog(this.config.hostname)
                }: a password is configured with tls:false. ` +
                    'Enable tls to encrypt the credential in transit.',
            )
        }
    }

    /**
     * The live socket if one is open, else `null`. A consumer's `close()` reads
     * it to drain and release the socket it owns.
     */
    get socket(): Deno.Conn | null {
        return this.connection
    }

    /**
     * Whether a socket is open or currently being opened — the guard a consumer's
     * `close()` uses so it never *reopens* a socket that was never established.
     */
    get isActive(): boolean {
        return this.connection !== null || this.connectPromise !== null
    }

    /**
     * Open (once) and return the authenticated connection.
     *
     * Single-flighted: the in-flight promise is cached so a concurrent burst
     * opens one socket and issues `AUTH`/`SELECT` once, on the fresh socket,
     * before it is published as live. On any failure the socket is closed and the
     * cached promise dropped, so the next connect retries (self-heal).
     *
     * @returns The open, authenticated connection.
     * @throws {Error} If the dial, TLS handshake, or `AUTH`/`SELECT` fails; the
     *   cause travels on the rejection and the raw password never appears in it.
     * @example
     * ```typescript
     * const socket = await conn.connect()
     * ```
     */
    connect(): Promise<Deno.Conn> {
        if (this.connection) return Promise.resolve(this.connection)
        if (!this.connectPromise) {
            const p = (async () => {
                const conn = await (this.config.tls
                    ? Deno.connectTls({
                        hostname: this.config.hostname,
                        port: this.config.port,
                    })
                    : Deno.connect({
                        hostname: this.config.hostname,
                        port: this.config.port,
                    }))
                try {
                    if (this.config.password) {
                        await exchange(conn, ['AUTH', this.config.password])
                    }
                    if (this.config.db !== 0) {
                        await exchange(conn, ['SELECT', String(this.config.db)])
                    }
                } catch (error) {
                    // The handshake failed on a fresh socket never published to
                    // `this.connection`; close it and let the rejection
                    // propagate (the `p.catch` below resets the memo). The raw
                    // password is never in `error`.
                    try {
                        conn.close()
                    } catch {
                        // Already closed by the failure itself.
                    }
                    throw error
                }
                this.connection = conn
                return conn
            })()
            // Self-heal: drop the cached promise on rejection so the next connect
            // retries rather than re-awaiting a permanently-failed open. The
            // `=== p` guard keeps the single-flight — concurrent callers still
            // await one open.
            p.catch(() => {
                if (this.connectPromise === p) this.connectPromise = null
            })
            this.connectPromise = p
        }
        return this.connectPromise
    }

    /**
     * Close a desynced socket and drop the shared state pointing at it, so the
     * next {@link connect} opens a fresh one. Clears `connection` only if it
     * still refers to `conn` (a concurrent reconnect may already have replaced
     * it). Idempotent and safe on an already-closed socket.
     *
     * @param conn - The socket to discard.
     * @example
     * ```typescript
     * conn.discard(socket) // after a wire/framing fault on `socket`
     * ```
     */
    discard(conn: Deno.Conn): void {
        try {
            conn.close()
        } catch {
            // Already closed by the failure itself; nothing to free.
        }
        if (this.connection === conn) this.connection = null
        this.connectPromise = null
    }
}
