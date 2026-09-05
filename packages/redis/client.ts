/**
 * @fileoverview A reusable raw-RESP Redis client owning ONE connection.
 *
 * The connection discipline extracted from the session driver (#145) so a
 * scheduler lock (#219) and a durable queue driver (#220) can reuse it verbatim
 * instead of each re-implementing a socket:
 *
 * - **Lazy, single-flight connect.** {@link RedisClient.connect} caches the
 *   in-flight open so a cold-start burst opens exactly one socket; the handshake
 *   (`AUTH`/`SELECT`) runs once, through a private exchange that bypasses the
 *   command queue so it cannot deadlock against it.
 * - **Serialized commands.** {@link RedisClient.command} chains every exchange
 *   onto a per-connection promise, so two overlapping callers never interleave
 *   their frames on the shared socket — the second's write begins only after the
 *   first's reply is fully drained (Security-S5, #145). The reply reader expects
 *   exactly one reply per command, so this ordering is a correctness invariant,
 *   not a nicety.
 * - **Self-heal.** A wire fault or a {@link RespFramingError} leaves the socket
 *   desynced, so it is closed and dropped; the next command reconnects clean. A
 *   {@link RespServerError} (a complete `-ERR …` reply) leaves the socket in
 *   sync, so it is kept.
 * - **Lifecycle-drain close.** The socket is registered as a disposable only
 *   once it exists, so a client that never connects enrols nothing; shutdown
 *   drains a `QUIT` **after** any in-flight command rather than tearing it out.
 * - **TLS.** {@link RedisClientConfig.tls} wraps the socket with
 *   `Deno.connectTls`, certificate validation ON — there is no trust-all option
 *   (FR-016). With TLS off, sending `AUTH` over plaintext is the operator's
 *   explicit choice, and the constructor raises a one-time startup warning so
 *   the cleartext-credential exposure is not silent (#248).
 *
 * The password is a credential: it authenticates the socket and is otherwise
 * redacted from every log line via `safeForLog`, and folded through
 * `credentialFingerprint` (a per-process-keyed HMAC, see `memo.ts`) before it
 * can enter any connection-memo key (FR-015, #248).
 *
 * @module @lockness/redis/client
 */

import { renderError, safeForLog } from '@lockness/contract'
import {
    deregisterDisposable,
    type DisposableHandle,
    registerDisposable,
} from '@lockness/contract/lifecycle/internal'
import {
    encodeCommand,
    readReply,
    type RespReply,
    RespServerError,
    writeFrame,
} from './resp.ts'

/**
 * The default Redis port, used when {@link RedisClientConfig.port} is omitted.
 */
const DEFAULT_PORT = 6379

/**
 * The default shutdown-drain priority for a client's disposable. Matches the
 * session driver's historical value so its lifecycle ordering is unchanged.
 */
const DEFAULT_DISPOSABLE_PRIORITY = 60

/**
 * Connection settings for a {@link RedisClient}.
 *
 * `hostname` is required; the rest carry Redis defaults. `tls` opts into a
 * TLS-wrapped socket with certificate validation ON — the client ships no
 * trust-all escape hatch (FR-016).
 */
export interface RedisClientConfig {
    /** Redis server hostname. */
    hostname: string
    /**
     * Redis server port.
     * @default 6379
     */
    port?: number
    /**
     * Password for `AUTH`. Never logged in cleartext (redacted via `safeForLog`)
     * and never placed in a memo key in cleartext (folded through
     * `credentialFingerprint`, a per-process-keyed HMAC). Setting this with
     * `tls: false` raises a one-time cleartext-AUTH warning at construction.
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
    /**
     * The name the socket's shutdown disposable registers under, so a host
     * package's lifecycle log names the resource it owns.
     * @default "redis"
     */
    disposableName?: string
    /**
     * The shutdown-drain priority of the socket's disposable.
     * @default 60
     */
    disposablePriority?: number
}

/**
 * A raw-RESP Redis client over a single, self-healing, serialized connection.
 *
 * Safe to memoize and share across a process: `connect()` is single-flighted and
 * `command()` serializes every exchange, so a shared instance never interleaves
 * frames on its one socket. Build the connection-memo key with
 * {@link redisMemoKey} so two configs with different credentials never collapse
 * onto one authenticated socket.
 *
 * @example
 * ```typescript
 * const client = new RedisClient({ hostname: 'localhost', port: 6379 })
 * const reply = await client.command('GET', 'k')
 * if (reply.type === 'nil') {
 *   // miss
 * } else if (reply.type === 'bulk') {
 *   JSON.parse(reply.value)
 * }
 * await client.close()
 * ```
 */
export class RedisClient {
    private connection: Deno.Conn | null = null
    /**
     * The in-flight `connect()` promise, cached so a concurrent cold-start burst
     * opens ONE socket. Without it, `connect` is a check-then-act across an
     * `await` and two concurrent first-commands each open and authenticate a
     * socket, orphaning one. Dropped on rejection and on a desync so the next
     * command reconnects.
     */
    private connectPromise: Promise<Deno.Conn> | null = null
    /**
     * The tail of the per-connection command queue. Every `command` chains its
     * exchange onto this promise, so two overlapping calls never interleave their
     * frames on the shared socket — the second's write begins only after the
     * first's reply is fully drained (#145 / Security-S5). The tail swallows so a
     * failed command does not wedge the queue; the returned promise still rejects
     * to its own caller.
     */
    private commandTail: Promise<unknown> = Promise.resolve()
    #handle: DisposableHandle | undefined
    private readonly config: {
        hostname: string
        port: number
        password?: string
        db: number
        tls: boolean
        disposableName: string
        disposablePriority: number
    }

    /**
     * @param config - The connection settings; only `hostname` is required.
     */
    constructor(config: RedisClientConfig) {
        this.config = {
            hostname: config.hostname,
            port: config.port ?? DEFAULT_PORT,
            password: config.password,
            db: config.db ?? 0,
            tls: config.tls ?? false,
            disposableName: config.disposableName ?? 'redis',
            disposablePriority: config.disposablePriority ??
                DEFAULT_DISPOSABLE_PRIORITY,
        }
        // A password with TLS off means `AUTH` travels in cleartext. Warn ONCE
        // here — the constructor runs once per client, so a reconnecting or
        // self-healing client never re-warns; this is a startup notice, not
        // per-connection spam (#248). The password itself is never logged.
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
     * Open (once) and return the authenticated connection.
     *
     * Single-flighted: the in-flight promise is cached so a concurrent burst
     * opens one socket and issues `AUTH`/`SELECT` once. Those handshake commands
     * go through the private {@link RedisClient.#exchange} **directly**, never
     * `command`, so they cannot re-enter and deadlock the command queue that
     * awaits `connect()`. On any failure the socket is closed and the cached
     * promise dropped, so the next command retries (self-heal).
     *
     * @returns The open, authenticated connection.
     * @throws {Error} If the dial, TLS handshake, or `AUTH`/`SELECT` fails; the
     *   cause travels on the rejection and the raw password never appears in it.
     * @example
     * ```typescript
     * await client.connect() // eagerly establish the socket
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
                    // The raw password is never in `error`; log the host only.
                    try {
                        conn.close()
                    } catch {
                        // Already closed by the failure itself.
                    }
                    throw error
                }
                this.connection = conn
                // Registered only once a socket exists, so shutdown releases it.
                // A client owning nothing enrols nothing.
                this.#handle ??= registerDisposable({
                    name: this.config.disposableName,
                    dispose: () => this.close(),
                    priority: this.config.disposablePriority,
                })
                return conn
            })()
            // Self-heal: drop the cached promise on rejection so the next command
            // retries rather than re-awaiting a permanently-failed connect that
            // would brick the memoized client until restart. The `=== p` guard
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
     * full, then drain exactly one RESP reply. Pure — it touches no shared client
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
     * {@link RespServerError} (a complete `-ERR …` reply or an in-sync parse
     * fault, the whole reply off the wire). Every other failure (a wire fault, or
     * a {@link RespFramingError} thrown after the length line but before the
     * payload was drained — possibly 10 MiB and hostile) leaves the socket
     * DESYNCED, so it is closed and both `connection` and `connectPromise` are
     * dropped; the next command reconnects clean.
     *
     * @param args - The command and its arguments, e.g. `('GET', 'k')`.
     * @returns The parsed RESP reply. A bulk keeps `''` distinct from nil.
     * @throws {RespServerError} On a framed server error or in-sync parse fault;
     *   the socket stays framed and is retained.
     * @throws {Error} On any wire/framing fault; the desynced socket is discarded
     *   and the error rethrown to this caller.
     * @example
     * ```typescript
     * await client.command('SETEX', 'k', '3600', JSON.stringify(data))
     * ```
     */
    command(...args: string[]): Promise<RespReply> {
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
     * refers to `conn` (a shutdown `close()` may already have replaced it). The
     * host is logged at WARN so a self-heal is visible; the password never is.
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
     * Close the connection and release its resources.
     *
     * Deregisters the shutdown disposable first (so a shutdown drain does not
     * re-enter), then — if a socket is live or being opened — serializes a `QUIT`
     * through the command queue so it drains **after** any in-flight exchange
     * rather than tearing it out (Security F3). Idempotent: with nothing open it
     * is a no-op, and it never *reopens* a closed socket. A failing `QUIT` is not
     * fatal — the socket is closed regardless.
     *
     * @returns Resolves once the socket is closed (or immediately if none is
     *   open).
     * @example
     * ```typescript
     * await client.close()
     * ```
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
            } catch (error) {
                // QUIT failing does not change the outcome: we close anyway. The
                // host is logged so the failed drain is visible; not swallowed.
                console.warn(
                    `[redis] QUIT failed for ${
                        safeForLog(this.config.hostname)
                    }, closing anyway: ${renderError(error)}`,
                )
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
