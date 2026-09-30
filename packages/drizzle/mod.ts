/**
 * @fileoverview Drizzle ORM integration for Lockness framework.
 *
 * Provides database connection management and Drizzle ORM setup for PostgreSQL
 * (default), MySQL, and SQLite — the dialect is resolved from config/URL and its
 * driver is loaded on demand. This module exports the main Database service and
 * CLI command registration.
 *
 * @module @lockness/drizzle
 *
 * @example
 * ```ts
 * import { Database } from '@lockness/drizzle'
 * import { container } from '@lockness/contract'
 *
 * const db = container.get<Database>(Database)
 * await db.connect(Deno.env.get('DATABASE_URL')!)
 *
 * // Use db.db for Drizzle queries
 * const users = await db.db.select().from(usersTable)
 *
 * await db.close()
 * ```
 */

import { Service } from '@lockness/container'
import { renderError } from '@lockness/contract'
import {
    ClientUnavailableError,
    defaultDriverFactories,
    type Dialect,
    type DialectDatabase,
    type DriverFactory,
    resolveDialect,
} from './drivers.ts'
import { inspectDsn, INVALID_DSN_MESSAGE } from './dsn.ts'

export { registerDrizzleCommands } from './cli_commands.ts'
export type {
    CommandRunner,
    CommandSpec,
    DbConnection,
    DrizzleCommandDeps,
    SeederLoader,
} from './cli_commands.ts'
export { Factory } from './factory.ts'
export type { FactoryCreateOptions } from './factory.ts'
export {
    ALLOW_PRODUCTION_FLAG,
    assertNotProduction,
} from './production_guard.ts'
export {
    decodeCursor,
    encodeCursor,
    MalformedCursorError,
    paginate,
} from './paginate.ts'
export type {
    CursorPaginateOptions,
    DecodedCursor,
    OffsetPaginateOptions,
} from './paginate.ts'
export { CLIENT_PACKAGE, resolveDialect } from './drivers.ts'
export type {
    DatabaseSchema,
    Dialect,
    DialectDatabase,
    DriverFactory,
    DriverHandle,
} from './drivers.ts'

// =============================================================================
// Types
// =============================================================================

/**
 * Connection options for the Database service.
 */
export interface ConnectionOptions {
    /** Whether to suppress the success message */
    readonly silent?: boolean
    /**
     * The SQL dialect to connect through. When omitted, it is inferred from the
     * URL scheme (falling back to `postgres`) — see {@link resolveDialect}. The
     * boot path passes `DatabaseConfig.driver` here; the CLI path relies on
     * inference.
     */
    readonly driver?: Dialect
}

/**
 * Result of a database connection attempt.
 */
export interface ConnectionResult {
    /** Whether the connection was successful */
    readonly success: boolean
    /** Error message if connection failed */
    readonly error?: string
}

// =============================================================================
// Database Service
// =============================================================================

/**
 * Database service for managing PostgreSQL connections via Drizzle ORM.
 *
 * This service is registered as a singleton in the DI container and provides
 * a managed connection to PostgreSQL with automatic Drizzle ORM setup.
 *
 * @example
 * ```ts
 * // In a controller or service
 * @Controller('/users')
 * class UserController {
 *   constructor(private database: Database) {}
 *
 *   @Get('/')
 *   async list() {
 *     const users = await this.database.db.select().from(usersTable)
 *     return { users }
 *   }
 * }
 * ```
 */
@Service()
export class Database<D extends Dialect = 'postgres'> {
    /**
     * Drizzle ORM database instance, typed by the dialect. Defaults to
     * `PostgresJsDatabase` (dialect `postgres`), so an unparameterised
     * `Database` and every existing `db.select()` call site is unchanged.
     */
    public db!: DialectDatabase<D>

    /** The per-dialect driver factories (overridable via {@link Database.setDriverFactory}). */
    #factories: Record<Dialect, DriverFactory> = { ...defaultDriverFactories }
    /** The configured client's close/probe closures, set at connect time. */
    #close: (() => Promise<void>) | undefined
    #probe: (() => Promise<void>) | undefined
    /**
     * What a `probe()` failure must not carry: the DSN the configured client
     * was built from and its whole password, as written and decoded (#425).
     */
    #needles: readonly Needle[] = []
    #connected = false

    /**
     * Override the driver factory for one dialect — the seam for unit tests
     * (a fake driver, no live DB) and for registering a custom driver.
     *
     * A factory must only **construct** its client: a round trip inside it
     * brings back the boot-time wake-up #420 removed. See
     * {@link DriverFactory}.
     *
     * @param dialect - The dialect to override.
     * @param factory - The factory to use for it.
     */
    setDriverFactory(dialect: Dialect, factory: DriverFactory): void {
        this.#factories[dialect] = factory
    }

    /**
     * Configure the database client for the resolved dialect. **Makes no round
     * trip.**
     *
     * The dialect is resolved by {@link resolveDialect} (`options.driver` >
     * URL scheme > `postgres`); the matching driver + client are loaded on
     * demand and the client is constructed. The clients are lazy, so nothing
     * reaches the database until the first query or an explicit
     * {@link Database.probe}: on a scale-to-zero database, booting an app must
     * not wake (and bill) the compute (#420). The name is kept for API
     * stability — it configures, it does not connect.
     *
     * `success: false` therefore means one of three things only, each with a
     * message that cannot carry the DSN's password (#425):
     *
     * - **The DSN was refused** before any driver saw it, because a driver
     *   could misparse where its password ends. The user and password may
     *   hold only `A-Za-z0-9-._~!$&'()*+,;=:` and `%XX`; every other
     *   character must be percent-encoded — for example `^ | { } [ ] < > "
     *   \`, a backtick, a space, a non-ASCII character, a raw `@`, and a `%`
     *   not followed by two hex digits. A raw `@` in the path or query
     *   string, a control character, and a scheme with no `//` (other than
     *   `file:` and `sqlite:`) are refused too. The message is fixed and
     *   quotes nothing from the DSN.
     * - **The client package is missing.** The message names the package and
     *   the import error, which never holds the DSN.
     * - **The client could not be built from the DSN.** Its message may quote
     *   the DSN in a rewritten form, so it is withheld: only the error's name
     *   is shown, and only when it is identifier-shaped.
     *
     * An unreachable host, bad credentials or a database that is down surface
     * at {@link Database.probe} (and so at `/ready`) or at the first query.
     *
     * @param url - Connection URL / DSN.
     * @param options - Optional dialect + silence.
     * @returns Whether the client was configured, and the safe error if not.
     *
     * @example
     * ```ts
     * const db = container.get<Database>(Database)
     * const result = await db.connect(Deno.env.get('DATABASE_URL')!)
     * if (!result.success) console.error('Failed to configure:', result.error)
     * await db.probe() // the one round trip — only where checking is the job
     * ```
     */
    public async connect(
        url: string,
        options: ConnectionOptions = {},
    ): Promise<ConnectionResult> {
        const dialect = resolveDialect(options.driver, url)
        const inspection = inspectDsn(url)
        if (!inspection.ok) return failed(INVALID_DSN_MESSAGE)
        const needles = needlesFor(url, inspection.secrets)

        let handle
        try {
            handle = await this.#factories[dialect](url)
        } catch (error) {
            return failed(configurationFailure(dialect, error, needles))
        }

        this.db = handle.db as DialectDatabase<D>
        this.#close = () => handle.close()
        this.#probe = () => handle.probe()
        this.#needles = needles
        this.#connected = true

        if (!options.silent) {
            console.log(`✅ Database configured (${dialect})`)
        }
        return { success: true }
    }

    /**
     * Close the database client. Safe to call when not configured, and safe to
     * call twice; afterwards {@link Database.probe} rejects as not connected.
     *
     * @returns Resolves once the client has closed; immediately when no client
     *   is configured.
     *
     * @example
     * ```ts
     * await db.close()
     * ```
     */
    public async close(): Promise<void> {
        const close = this.#close
        if (!close) return
        this.#close = undefined
        this.#probe = undefined
        this.#connected = false
        await close()
    }

    /**
     * Verify connectivity by issuing a lightweight `SELECT 1` through the
     * configured driver. **The only method that makes a round trip** — call it
     * where checking is the job (`/ready`, `db:check`, an `@OnBoot` hook that
     * wants boot to fail when the database is down), never on a hot path.
     *
     * A driver failure is re-thrown as a new `Error` carrying a redacted,
     * head-only render: the exact DSN and the whole password removed by
     * identity, then the shared pattern; no cause chain, and none of the
     * original error object's properties.
     *
     * @returns Resolves when the probe succeeds.
     * @throws {Error} `Database is not connected` when no client is configured
     *   or after {@link Database.close}; otherwise the redacted driver failure.
     *
     * @example
     * ```ts
     * await db.probe()
     * ```
     */
    public async probe(): Promise<void> {
        const probe = this.#probe
        if (!probe) {
            throw new Error('Database is not connected')
        }
        try {
            await probe()
        } catch (error) {
            throw new Error(renderFailure(error, this.#needles))
        }
    }

    /**
     * Check whether a client is configured and not closed.
     *
     * Since #420 this says nothing about reachability, because
     * {@link Database.connect} makes no round trip. Use {@link Database.probe}
     * to know whether the database answers.
     *
     * @returns True between a successful `connect()` and `close()`.
     */
    public isConnected(): boolean {
        return this.#connected
    }
}

// =============================================================================
// Failure rendering
// =============================================================================

/** A string a failure render must not carry, and what replaces it. */
interface Needle {
    /** The exact text to remove. Never empty. */
    readonly text: string
    /** What replaces each occurrence. */
    readonly marker: string
}

/**
 * The error name shown for a client that could not be built: a plain
 * identifier, so a name an application assigned cannot smuggle text in.
 */
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9]{0,63}$/

/**
 * Log a `connect()` failure and return it as the result.
 *
 * Not a silent path: the failure is logged at ERROR and returned as an
 * explicit `success: false`, whatever `silent` says (#427 owns that option).
 *
 * @param message - A message already known to carry no part of the password.
 * @returns The failed result.
 */
function failed(message: string): ConnectionResult {
    console.error('❌ Database connection failed:', message)
    return { success: false, error: message }
}

/**
 * Word a failure of the driver factory, without its message.
 *
 * A missing client package is named, with the import error: an import error
 * names a module and never holds the DSN. Anything else — the client
 * constructor rejecting the DSN, or any error from a custom factory — may quote
 * the DSN in a form the driver rewrote, which no exact removal can match. So
 * its message, code and cause are withheld, and only its name is shown, when
 * that name is a plain identifier (#425).
 *
 * @param dialect - The dialect whose factory failed.
 * @param error - Whatever the factory threw.
 * @param needles - The DSN and password to remove from an import error.
 * @returns The message for the log and the result.
 */
function configurationFailure(
    dialect: Dialect,
    error: unknown,
    needles: readonly Needle[],
): string {
    if (error instanceof ClientUnavailableError) {
        return `${error.message}: ${renderFailure(error.cause, needles)}`
    }
    const name = identifierName(error)
    return `The '${dialect}' driver could not be configured${
        name === undefined ? '' : ` (${name})`
    }; its message is withheld because it may contain the DSN`
}

/**
 * Read an error's name, if it is a plain identifier.
 *
 * @param error - Whatever a factory threw.
 * @returns The name, or `undefined` for a non-`Error`, an unreadable name, or
 *   a name that is not identifier-shaped.
 */
function identifierName(error: unknown): string | undefined {
    if (!(error instanceof Error)) return undefined
    let name: unknown
    try {
        name = error.name
    } catch {
        // A hostile getter. Its own error is not shown either: it is text
        // nobody vetted. The failure itself is still logged and returned.
        console.warn(
            '⚠️ Database driver error name could not be read; it is omitted',
        )
        return undefined
    }
    return typeof name === 'string' && IDENTIFIER.test(name) ? name : undefined
}

/**
 * The needles for a DSN that passed the check: the DSN itself, then its
 * password as written and as decoded, longest first.
 *
 * Longest first, because a needle removed before one that contains it would
 * break the longer match. Empty values are dropped: `replaceAll` with an empty
 * needle splices the marker between every character.
 *
 * @param url - The accepted DSN.
 * @param secrets - Its password, as written and as decoded.
 * @returns The needles to remove, in removal order.
 */
function needlesFor(url: string, secrets: readonly string[]): Needle[] {
    const needles: Needle[] = [
        {
            text: url,
            marker: '<dsn redacted>',
        },
        ...secrets.map((text) => ({ text, marker: '***' })),
    ]
    return needles
        .filter((needle) => needle.text !== '')
        .sort((a, b) => b.text.length - a.text.length)
}

/**
 * Render a driver failure with the held secrets removed by IDENTITY first.
 *
 * `renderError`'s pattern-based redaction is the net for a DSN nobody holds.
 * Here we hold it, so we can do better than a pattern — and we have to. A
 * driver may echo the password alone, decoded, where no pattern can find it.
 * So the exact DSN and the whole password are removed from the RAW message,
 * before the pattern ever sees it. Fragments of a password are never
 * scrubbed: since #425 a DSN whose password a driver could split is refused
 * at `connect()`, so the driver holds the same password this does.
 *
 * `followCause: false` for a second reason: this string is RETURNED as
 * `ConnectionResult.error` or re-thrown by `probe()`, not only logged, so an
 * application may put it somewhere a log line would never go. That is the
 * same distinction `@lockness/telemetry` draws for a span.
 *
 * @param raw - The driver failure.
 * @param needles - What to remove. Empty means nothing is held, and the
 *   failure goes to `renderError` untouched.
 * @returns The redacted, head-only render.
 */
function renderFailure(raw: unknown, needles: readonly Needle[]): string {
    const error = needles.length === 0 ? raw : withoutSecrets(raw, needles)
    return renderError(error, { followCause: false })
}

/**
 * Rebuild a failure as name + message with every needle replaced by its
 * marker, ready for `renderError`.
 *
 * The result carries no cause and none of the original object's properties —
 * the same head-only shape `renderError(…, { followCause: false })` renders.
 *
 * Reading an arbitrary thrown value can throw (a hostile `message` getter, a
 * Proxy). `renderError` answers that with a sentinel rather than a throw, and
 * so does this: the sentinel is what reaches the result, so the failure is
 * reported, not swallowed.
 *
 * @param error - Whatever the driver threw.
 * @param needles - The non-empty strings to remove, longest first.
 * @returns An `Error` (or a string, for a non-`Error` value) without them.
 */
function withoutSecrets(error: unknown, needles: readonly Needle[]): unknown {
    const scrub = (text: string): string =>
        needles.reduce(
            (scrubbed, needle) =>
                scrubbed.replaceAll(needle.text, needle.marker),
            text,
        )
    try {
        if (error instanceof Error) {
            // Same coercions as `renderError`: an application subclass can
            // assign a non-string `name` or `message`.
            const head = new Error(scrub(String(error.message)))
            head.name = typeof error.name === 'string'
                ? scrub(error.name)
                : 'Error'
            return head
        }
        return scrub(String(error))
    } catch {
        return '[unrenderable error]'
    }
}
