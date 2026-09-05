/**
 * @fileoverview A reusable raw-RESP Redis client owning ONE connection.
 *
 * The connection discipline extracted from the session driver (#145) so a
 * scheduler lock (#219) and a durable queue driver (#220) can reuse it verbatim
 * instead of each re-implementing a socket:
 *
 * - **Shared authenticated socket.** The dial + TLS wrap + `AUTH`/`SELECT`
 *   handshake + one-time cleartext-AUTH warning + self-heal live in
 *   {@link AuthenticatedConnection} (FR-013), the one home both this client and
 *   the subscribe-mode connection consume. This client adds the command
 *   discipline on top of it, not a second copy of the connect path.
 * - **Serialized commands.** {@link RedisClient.command} chains every exchange
 *   onto a per-connection promise, so two overlapping callers never interleave
 *   their frames on the shared socket — the second's write begins only after the
 *   first's reply is fully drained (Security-S5, #145). The reply reader expects
 *   exactly one reply per command, so this ordering is a correctness invariant,
 *   not a nicety.
 * - **Self-heal.** A wire fault or a {@link RespFramingError} leaves the socket
 *   desynced, so it is closed and dropped via {@link AuthenticatedConnection.discard};
 *   the next command reconnects clean. A {@link RespServerError} (a complete
 *   `-ERR …` reply) leaves the socket in sync, so it is kept.
 * - **Lifecycle-drain close.** The socket is registered as a disposable only
 *   once it exists, so a client that never connects enrols nothing; shutdown
 *   drains a `QUIT` **after** any in-flight command rather than tearing it out.
 * - **TLS.** {@link RedisClientConfig.tls} wraps the socket with
 *   `Deno.connectTls`, certificate validation ON — there is no trust-all option
 *   (FR-016). With TLS off, sending `AUTH` over plaintext is the operator's
 *   explicit choice, and {@link AuthenticatedConnection} raises a one-time
 *   startup warning so the cleartext-credential exposure is not silent (#248).
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
    AuthenticatedConnection,
    type AuthenticatedConnectionConfig,
    exchange,
} from './connection.ts'
import { type RespReply, RespServerError } from './resp.ts'

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
export interface RedisClientConfig extends AuthenticatedConnectionConfig {
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
    private readonly conn: AuthenticatedConnection
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
    private readonly hostname: string
    private readonly disposableName: string
    private readonly disposablePriority: number

    /**
     * @param config - The connection settings; only `hostname` is required.
     */
    constructor(config: RedisClientConfig) {
        // The dial/TLS/handshake/cleartext-warning/self-heal discipline (and its
        // one-time cleartext-AUTH warning) all live in the shared primitive.
        this.conn = new AuthenticatedConnection(config)
        this.hostname = config.hostname
        this.disposableName = config.disposableName ?? 'redis'
        this.disposablePriority = config.disposablePriority ??
            DEFAULT_DISPOSABLE_PRIORITY
    }

    /**
     * Open (once) and return the authenticated connection, registering the
     * shutdown disposable the first time a socket exists.
     *
     * The dial + `AUTH`/`SELECT` handshake are single-flighted inside the shared
     * {@link AuthenticatedConnection}; this wrapper only enrols the disposable
     * once a socket has actually been established, so a client that never
     * connects enrols nothing.
     *
     * @returns The open, authenticated connection.
     * @throws {Error} If the dial, TLS handshake, or `AUTH`/`SELECT` fails; the
     *   cause travels on the rejection and the raw password never appears in it.
     * @example
     * ```typescript
     * await client.connect() // eagerly establish the socket
     * ```
     */
    async connect(): Promise<Deno.Conn> {
        const conn = await this.conn.connect()
        // Registered only once a socket exists, so shutdown releases it. A client
        // owning nothing enrols nothing. The `??=` runs synchronously after the
        // await, so concurrent connects enrol exactly one disposable.
        this.#handle ??= registerDisposable({
            name: this.disposableName,
            dispose: () => this.close(),
            priority: this.disposablePriority,
        })
        return conn
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
     * DESYNCED, so it is discarded; the next command reconnects clean.
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
            return await exchange(conn, args)
        } catch (error) {
            if (!(error instanceof RespServerError)) this.conn.discard(conn)
            throw error
        }
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
        if (!this.conn.isActive) return Promise.resolve()

        const run = this.commandTail.then(async () => {
            // A desync (or a prior close) may have cleared it while we queued.
            const conn = this.conn.socket
            if (!conn) return
            try {
                await exchange(conn, ['QUIT'])
            } catch (error) {
                // QUIT failing does not change the outcome: we close anyway. The
                // host is logged so the failed drain is visible; not swallowed.
                console.warn(
                    `[redis] QUIT failed for ${
                        safeForLog(this.hostname)
                    }, closing anyway: ${renderError(error)}`,
                )
            }
            // Close the socket and drop the shared state pointing at it.
            this.conn.discard(conn)
        })
        this.commandTail = run.catch(() => {})
        return run
    }
}
