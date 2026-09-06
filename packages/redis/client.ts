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
import { nextDelay } from './backoff.ts'
import {
    RespCommandTooLargeError,
    type RespReply,
    RespServerError,
} from './resp.ts'

/**
 * The default shutdown-drain priority for a client's disposable. Matches the
 * session driver's historical value so its lifecycle ordering is unchanged.
 */
const DEFAULT_DISPOSABLE_PRIORITY = 60

/** Refuse a cadence that would silently disable the backoff (#299). */
function assertCadence(value: number, name: string): number {
    if (!Number.isFinite(value) || value <= 0) {
        throw new RangeError(
            `RedisClient: ${name} must be positive and finite, got ${value}`,
        )
    }
    return value
}

/**
 * Connection settings for a {@link RedisClient}.
 *
 * `hostname` is required; the rest carry Redis defaults. `tls` opts into a
 * TLS-wrapped socket with certificate validation ON — the client ships no
 * trust-all escape hatch (FR-016).
 */
export interface RedisClientConfig extends AuthenticatedConnectionConfig {
    /**
     * First-attempt ceiling for the post-failure refusal window, in ms (#299).
     * @default 250
     */
    retryBaseMs?: number
    /**
     * The refusal window's own ceiling, in ms.
     * @default 30000
     */
    retryMaxMs?: number
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
     * Consecutive failures since the last **survived** exchange (#299).
     *
     * Here rather than in `AuthenticatedConnection`, which is shared with
     * `RedisSubscribeConnection`: state there would give the subscribe socket a
     * streak nothing resets. See `#serializedExchange`'s guard.
     */
    #attempts = 0
    /** Epoch instant the refusal window ends; 0 when dials are allowed. */
    #windowUntil = 0
    /** The delay that produced the current window — the survival threshold. */
    #lastDelayMs = 0
    /** The socket the last exchange ran on, so a new one can be detected. */
    #liveConn: Deno.Conn | null = null
    /** When {@link #liveConn} was established — the survival clock's origin. */
    #connOpenedAt = 0
    /** Completed exchanges on {@link #liveConn}. One is not proof. */
    #successesOnConn = 0
    /** Whether this window has already been logged. One line per window. */
    #refusalLogged = false
    readonly #retryBaseMs: number
    readonly #retryMaxMs: number
    /** Whether `AUTH` travels in cleartext, for the refusal warning. */
    readonly #cleartextAuth: boolean
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
        // Validated BEFORE the connection is built, because an unvalidated
        // cadence fails this control OPEN and silently: `NaN` makes the ceiling
        // `NaN`, the delay `NaN`, the window instant `NaN`, and
        // `Date.now() < NaN` is FALSE — the guard never fires and the backoff
        // does not exist, with every test green. The asymmetry matters: the
        // same `NaN` on the subscribe path reaches `setTimeout(cb, NaN)` and
        // produces a LOUD hot loop; here it produces silence indistinguishable
        // from health.
        this.#retryBaseMs = assertCadence(
            config.retryBaseMs ?? 250,
            'retryBaseMs',
        )
        this.#retryMaxMs = assertCadence(
            config.retryMaxMs ?? 30_000,
            'retryMaxMs',
        )
        if (this.#retryMaxMs < this.#retryBaseMs) {
            throw new RangeError(
                'RedisClient: retryMaxMs must be >= retryBaseMs, got ' +
                    `${this.#retryMaxMs} < ${this.#retryBaseMs}`,
            )
        }
        this.#cleartextAuth = Boolean(config.password) && !config.tls
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
        // THE GUARD, and it is here rather than in `connect()` on purpose
        // (#299). `AuthenticatedConnection` is shared with
        // `RedisSubscribeConnection`, which calls `connect()` and `discard()`
        // and would never call the reset below — so a guard there would give
        // the subscribe socket a streak that only ever grows, pinning it at the
        // ceiling for the life of the process. That is the permanent deafness
        // #275 exists to remove. `connection.ts` already disclaims this
        // responsibility in its own header.
        const waitMs = this.#refusedFor()
        if (waitMs > 0) {
            this.#reportRefusal(waitMs)
            throw new Error(
                `Redis ${
                    safeForLog(this.hostname)
                } is backing off after ${this.#attempts} consecutive ` +
                    `failure(s); retrying in ${waitMs}ms. This rejects rather ` +
                    'than waits — a caller is holding this promise.',
            )
        }
        const conn = await this.connect()
        // The socket's establishment instant, NOT this exchange's start. An
        // earlier version stamped it here, after `connect()` resolved, so the
        // survival check measured one round-trip: against a broker answering in
        // a millisecond it was always under the threshold, the reset branch was
        // unreachable, and `#attempts` was monotonic for the life of the
        // process. A review seat reproduced it — fifty consecutive successful
        // GETs did not move the counter. `subscriber.ts` measures the same
        // thing the same way, from `#loopStartedAt`.
        if (conn !== this.#liveConn) {
            this.#liveConn = conn
            this.#connOpenedAt = Date.now()
            this.#successesOnConn = 0
        }
        try {
            const reply = await exchange(conn, args)
            this.#successesOnConn++
            this.#reportHealthy()
            return reply
        } catch (error) {
            // TWO exemptions, and the second is not optional (#300).
            //
            // `RespServerError` is kept because the reply was fully drained and
            // the socket is in sync. `RespCommandTooLargeError` is kept because
            // NOTHING WAS WRITTEN — the frame was refused inside
            // `encodeCommand`, before the socket was touched. Without this
            // clause the rule here ("everything that is not a
            // `RespServerError` is a desync") closes a healthy authenticated
            // socket over a caller-side input error, which with #299's backoff
            // then refuses every consumer sharing this client. A refusal that
            // costs a reconnect is worse than the 30-second timeout it
            // replaced.
            if (
                !(error instanceof RespServerError) &&
                !(error instanceof RespCommandTooLargeError)
            ) {
                this.conn.discard(conn)
                // The window is armed by a FAULTED exchange, not by `discard`
                // itself — two of that method's three callers are not faults
                // (`close()` below, and the subscribe path's own
                // `#discardSocket`).
                this.#armWindow(error)
            }
            throw error
        }
    }

    /** Milliseconds left in the refusal window, or 0 when a dial is allowed. */
    #refusedFor(): number {
        if (this.#windowUntil === 0) return 0
        const left = this.#windowUntil - Date.now()
        return left > 0 ? left : 0
    }

    /**
     * Open a refusal window after a faulted exchange.
     *
     * The counter increments **here**, once per window, rather than at each
     * failure site: `command()` chains on `commandTail`, so N queued commands
     * call `connect()` strictly sequentially and the connection's single-flight
     * never merges them — without this, one outage would count N times and
     * inflate the ceiling for attempts that never happened.
     */
    #armWindow(error: unknown): void {
        this.#attempts++
        // THE FIRST FAULT OPENS NO WINDOW. A transient blip — one reset socket
        // — must not refuse the very next command; the plan's own edge case
        // says so ("attempt one is immediate, or the fix costs latency on every
        // cold start"), and two session tests said so louder: they assert a
        // mid-stream fault self-heals on the next command, which is correct
        // behaviour and which an eager window broke.
        //
        // The bound still holds against a wedged peer, one dial later: fault
        // one re-dials immediately, fault two opens the window, and everything
        // after is refused.
        if (this.#attempts < 2) {
            this.#windowUntil = 0
            this.#lastDelayMs = 0
            return
        }
        const delay = nextDelay(
            this.#attempts,
            this.#retryBaseMs,
            this.#retryMaxMs,
        )
        this.#windowUntil = Date.now() + delay
        this.#lastDelayMs = delay
        this.#refusalLogged = false
        const cleartext = this.#cleartextAuth
            ? ' (AUTH is being re-sent in cleartext on every attempt — tls is off)'
            : ''
        console.warn(
            `[redis:${safeForLog(this.disposableName)}] command failed at ${
                safeForLog(this.hostname)
            }, attempt ${this.#attempts}, refusing new dials for ${delay}ms` +
                `${cleartext}: ${renderError(error)}`,
        )
    }

    /**
     * Reset the streak — but only on **survival, not arrival**.
     *
     * A completed exchange alone is not proof: a broker that answers one
     * command and then wedges would zero the streak on every cycle, so the
     * ceiling would never leave its floor and the client would re-dial — and
     * re-send `AUTH` in cleartext — several times a second, forever, from a
     * five-byte reply. `subscriber.ts` records the same correction on its own
     * path: *"a throttle that resets itself is not a throttle."*
     *
     * The socket must therefore have been live longer than the delay that
     * produced it. That makes an attacker's cost scale with the ceiling: to
     * keep it pinned they must hold the socket healthy for longer than the
     * current delay, which is indistinguishable from being healthy.
     */
    #reportHealthy(): void {
        if (this.#attempts === 0) return
        // TWO conditions, and the second is what closes the oscillation.
        //
        // Age alone is not enough. A peer that answers one command per socket
        // just past the base cadence and then faults satisfies an age test on
        // every cycle, so the streak returns to 0 each time, never reaches the
        // two that opens a window, and the client re-dials forever — re-sending
        // AUTH in cleartext each time. That is #299 at a slower rate, and a
        // review seat found it after the clock was fixed.
        //
        // Requiring more than one exchange on the SAME socket is what a peer
        // behaving that way cannot satisfy: to reset the throttle it has to
        // serve two commands in a row, which is indistinguishable from working.
        const threshold = Math.max(this.#lastDelayMs, this.#retryBaseMs)
        if (Date.now() - this.#connOpenedAt < threshold) return
        if (this.#successesOnConn < 2) return
        this.#attempts = 0
        this.#windowUntil = 0
        this.#lastDelayMs = 0
    }

    /** One line per window, not one per refused command. */
    #reportRefusal(waitMs: number): void {
        if (this.#refusalLogged) return
        this.#refusalLogged = true
        console.warn(
            `[redis:${safeForLog(this.disposableName)}] refusing commands at ${
                safeForLog(this.hostname)
            } for a further ${waitMs}ms (attempt ${this.#attempts})`,
        )
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
