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
    CLIENT_PACKAGE,
    defaultDriverFactories,
    type Dialect,
    type DialectDatabase,
    type DriverFactory,
    resolveDialect,
} from './drivers.ts'

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
    /** The DSN the configured client was built from — held to redact it. */
    #url: string | undefined
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
     * `success: false` therefore means one of two things only: the client
     * package is missing, or the client's constructor rejected the URL. An
     * unreachable host, bad credentials or a database that is down surface at
     * {@link Database.probe} (and so at `/ready`) or at the first query. A
     * failure is rendered through `renderError`, so a driver error cannot
     * spill a DSN's credentials into logs or into the returned result.
     *
     * @param url - Connection URL / DSN.
     * @param options - Optional dialect + silence.
     * @returns Whether the client was configured, and the redacted error if not.
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

        let handle
        try {
            handle = await this.#factories[dialect](url)
        } catch (error) {
            // The driver's adapter/client could not be loaded, or its
            // constructor rejected the URL — name the dialect and the package
            // to install (never a raw stack).
            const message =
                `Failed to initialise the '${dialect}' driver — ensure its client package (${
                    CLIENT_PACKAGE[dialect]
                }) is installed. ${this.#render(error, url)}`
            console.error('❌ Database connection failed:', message)
            return { success: false, error: message }
        }

        this.db = handle.db as DialectDatabase<D>
        this.#close = () => handle.close()
        this.#probe = () => handle.probe()
        this.#url = url
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
     * head-only render: the DSN removed by identity, no cause chain, and none
     * of the original error object's properties.
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
            throw new Error(this.#render(error, this.#url ?? ''))
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

    /**
     * Render a driver failure with the DSN removed by IDENTITY first.
     *
     * `renderError`'s pattern-based redaction is the net for a DSN nobody
     * holds. Here we hold it, so we can do better than a pattern — and we
     * have to. A `/` in the password makes WHATWG `new URL()` throw with the
     * whole DSN in its message, and the pattern must stop at the first raw
     * `@`; a password holding both leaves its tail after that `@` once the
     * pattern has run (`postgres://***:***@<tail>@host/db`).
     *
     * So the exact DSN is removed from the RAW message, before the pattern
     * ever sees it. The earlier order (pattern, then exact replace) could
     * never match a DSN the pattern had already rewritten, which is how that
     * tail leaked.
     *
     * `followCause: false` for a second reason: this string is RETURNED as
     * `ConnectionResult.error` or re-thrown by `probe()`, not only logged, so
     * an application may put it somewhere a log line would never go. That is
     * the same distinction `@lockness/telemetry` draws for a span.
     *
     * @param raw - The driver failure.
     * @param url - The DSN to remove. Empty means none is held: `replaceAll`
     *   with an empty needle would splice the marker between every character.
     * @returns The redacted, head-only render.
     */
    #render(raw: unknown, url: string): string {
        const error = url === '' ? raw : withoutDsn(raw, url)
        return renderError(error, { followCause: false })
    }
}

/**
 * Rebuild a failure as name + message with every occurrence of `url`
 * replaced by a marker, ready for `renderError`.
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
 * @param url - The non-empty DSN to remove.
 * @returns An `Error` (or a string, for a non-`Error` value) without the DSN.
 */
function withoutDsn(error: unknown, url: string): unknown {
    const scrub = (text: string): string =>
        text.replaceAll(
            url,
            '<dsn redacted>',
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
