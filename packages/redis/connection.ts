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
    /**
     * Ceiling on each handshake reply (`AUTH`, `SELECT`), in milliseconds.
     *
     * Omitted, the handshake takes `readReply`'s command-path default of 30s —
     * correct for {@link RedisClient}, and wrong for a caller that has named its
     * own liveness window. A subscribe socket passes its window here so a peer
     * that accepts TCP and then answers nothing is detected inside that window
     * rather than 30 seconds later (#274, FR-014).
     *
     * @default undefined - the `readReply` default applies
     */
    handshakeTimeoutMs?: number
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
 * @param timeoutMs - Ceiling on the reply, in milliseconds. Omitted, the
 *   command-path default in `resp.ts` applies — correct for `RedisClient`, and
 *   wrong for a caller that has named its own liveness window.
 * @returns The parsed RESP reply.
 * @throws {RespServerError} On a framed server error or an in-sync parse fault.
 * @throws {RespFramingError} On an abandoned frame (the socket is desynced).
 * @throws {Error} On a wire fault or read timeout.
 * @example
 * ```typescript
 * const reply = await exchange(conn, ['PING'])
 * ```
 */
export function exchange(
    conn: Deno.Conn,
    args: string[],
    timeoutMs?: number,
): Promise<RespReply> {
    return writeFrame(conn, encodeCommand(args)).then(() =>
        timeoutMs === undefined ? readReply(conn) : readReply(conn, timeoutMs)
    )
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
     * opens ONE socket — **paired with the socket it produced** (#287).
     *
     * `conn` is `null` while the dial is running and is filled in the same
     * statement that sets {@link connection}, so the pairing is established
     * atomically and a dial that has not settled is not owned by any socket.
     *
     * **Why a pair rather than `if (this.connection === conn)`.** That guard is
     * in fact sufficient for every state reachable today — `connect()`
     * short-circuits on a non-null `connection`, so a replacement dial can only
     * START once `connection` is null, and a stale discard therefore compares
     * against `null` and leaves the dial alone. It is correct by an inference
     * about a short-circuit two methods away. Three things make that inference
     * a bad thing to depend on:
     *
     * - A future path that nulls `connection` independently reintroduces the
     *   cancellation, silently and with every test still green.
     * - `connectPromise` is **never cleared on success** — only in the `p.catch`
     *   below — so after a settled dial the two fields describe one generation
     *   through different mechanisms at different instants.
     * - #286's write deadline makes a LATE discard of an already-replaced
     *   socket routine, which is what turned this from unreachable into the
     *   next guard to give way.
     *
     * Dropped on rejection and on {@link discard} of **its own** socket, so the
     * next connect retries.
     */
    private pending:
        | { promise: Promise<Deno.Conn>; conn: Deno.Conn | null }
        | null = null
    private readonly config: {
        hostname: string
        port: number
        password?: string
        db: number
        tls: boolean
        handshakeTimeoutMs?: number
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
            handshakeTimeoutMs: config.handshakeTimeoutMs,
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
        return this.connection !== null || this.pending !== null
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
        if (!this.pending) {
            const p = (async () => {
                // ONE deadline for dial + AUTH + SELECT, fixed before the first
                // of them, so the window bounds the activation rather than each
                // step of it.
                const budget = this.config.handshakeTimeoutMs
                const deadline = budget === undefined
                    ? undefined
                    : Date.now() + budget
                const conn = await this.#dial(deadline)
                try {
                    if (this.config.password) {
                        await exchange(
                            conn,
                            ['AUTH', this.config.password],
                            this.#remaining(deadline),
                        )
                    }
                    if (this.config.db !== 0) {
                        await exchange(
                            conn,
                            ['SELECT', String(this.config.db)],
                            this.#remaining(deadline),
                        )
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
                // The pairing, established in the same statement that publishes
                // the socket: from here on this dial is owned by `conn`, and a
                // discard of any other generation cannot cancel it.
                if (this.pending) this.pending.conn = conn
                return conn
            })()
            // Self-heal: drop the cached promise on rejection so the next connect
            // retries rather than re-awaiting a permanently-failed open. The
            // `=== p` guard keeps the single-flight — concurrent callers still
            // await one open.
            p.catch(() => {
                if (this.pending?.promise === p) this.pending = null
            })
            this.pending = { promise: p, conn: null }
        }
        return this.pending.promise
    }

    /**
     * Milliseconds left before `deadline`, or `undefined` when unbounded.
     *
     * One budget for the whole activation, not one per step. Applied per step it
     * multiplied: the dial, `AUTH` and `SELECT` each got the full value, so a
     * stalling peer cost up to three times the configured window before the read
     * loop's own deadline even started.
     */
    #remaining(deadline: number | undefined): number | undefined {
        if (deadline === undefined) return undefined
        return Math.max(1, deadline - Date.now())
    }

    /**
     * Open the socket, bounded by the activation's shared deadline.
     *
     * Neither `Deno.connect` nor `Deno.connectTls` takes a deadline or an abort
     * signal, so the bound is a race. A peer that completes the TCP handshake and
     * then stalls the TLS one would otherwise wedge the connection **permanently
     * and silently** — no error, no retry, no log line, which is the same shape
     * as the defect this connection's liveness window exists to remove.
     *
     * The losing dial is abandoned, not cancelled — nothing can cancel it. Its
     * continuation closes whatever socket eventually arrives, so the fd is
     * released rather than leaked.
     *
     * @param deadline - Epoch ms by which the socket must be open, or
     *   `undefined` for `RedisClient`'s unbounded behaviour.
     */
    #dial(deadline: number | undefined): Promise<Deno.Conn> {
        const open = this.config.tls
            ? Deno.connectTls({
                hostname: this.config.hostname,
                port: this.config.port,
            })
            : Deno.connect({
                hostname: this.config.hostname,
                port: this.config.port,
            })
        const budget = this.#remaining(deadline)
        if (budget === undefined) return open

        return new Promise<Deno.Conn>((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(
                    new Error(
                        `Redis dial to ${this.config.hostname}:${this.config.port} ` +
                            `did not complete within ${budget}ms`,
                    ),
                )
            }, budget)
            Deno.unrefTimer(timer)
            // This handler is also the rejection sink for `open`, so no ordering
            // of (timeout, resolve, reject) can leave an unhandled rejection.
            open.then(
                (conn) => {
                    clearTimeout(timer)
                    resolve(conn)
                },
                (error) => {
                    clearTimeout(timer)
                    reject(error)
                },
            )
        }).catch((error) => {
            // THIS is what returns the abandoned dial's fd — a socket that
            // arrives after the race was lost belongs to nobody.
            open.then(
                (conn) => {
                    try {
                        conn.close()
                    } catch {
                        // Already closed by the failure itself.
                    }
                },
                () => {},
            )
            throw error
        })
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
        // Only this socket's own dial. An unsettled dial (`conn: null`) is not
        // cancellable by any discard, by construction rather than by inference
        // — see {@link pending}. Clearing this unconditionally cancelled
        // whatever dial happened to be in flight, so the next `connect()` saw
        // no cached promise and dialled again: the single-flight invariant
        // gone, and with `tls` defaulting to false, one more cleartext AUTH on
        // the wire (#287).
        if (this.pending?.conn === conn) this.pending = null
    }
}
