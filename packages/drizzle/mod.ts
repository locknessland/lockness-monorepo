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
export { decodeCursor, encodeCursor, paginate } from './paginate.ts'
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
    /** The live connection's close/probe closures, set at connect time. */
    #close: (() => Promise<void>) | undefined
    #probe: (() => Promise<void>) | undefined
    #connected = false

    /**
     * Override the driver factory for one dialect — the seam for unit tests
     * (a fake driver, no live DB) and for registering a custom driver.
     *
     * @param dialect - The dialect to override.
     * @param factory - The factory to use for it.
     */
    setDriverFactory(dialect: Dialect, factory: DriverFactory): void {
        this.#factories[dialect] = factory
    }

    /**
     * Connect to the database through the resolved dialect's driver.
     *
     * The dialect is resolved by {@link resolveDialect} (`options.driver` >
     * URL scheme > `postgres`); the matching driver + client are loaded on
     * demand. A failure to load the client is reported with the package to
     * install; a connection failure is rendered through `renderError` so a
     * driver error cannot spill a DSN's credentials into logs.
     *
     * @param url - Connection URL / DSN.
     * @param options - Optional dialect + silence.
     * @returns Connection result with success status.
     *
     * @example
     * ```ts
     * const db = container.get<Database>(Database)
     * const result = await db.connect(Deno.env.get('DATABASE_URL')!)
     * if (!result.success) console.error('Failed to connect:', result.error)
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
            // The driver's adapter/client could not be loaded or constructed —
            // name the dialect and the package to install (never a raw stack).
            const message =
                `Failed to initialise the '${dialect}' driver — ensure its client package (${
                    CLIENT_PACKAGE[dialect]
                }) is installed. ${renderError(error)}`
            console.error('❌ Database connection failed:', message)
            return { success: false, error: message }
        }

        try {
            this.db = handle.db as DialectDatabase<D>
            this.#close = () => handle.close()
            this.#probe = () => handle.probe()
            await this.#probe()
            this.#connected = true

            if (!options.silent) {
                console.log(`✅ Database connected (${dialect})`)
            }
            return { success: true }
        } catch (error) {
            // Connection/probe failure — renderError drops the error object,
            // stack and cause, so a credential carried on the error cannot leak.
            const message = renderError(error)
            console.error('❌ Database connection failed:', message)
            return { success: false, error: message }
        }
    }

    /**
     * Close the database connection. Safe to call when not connected.
     *
     * @example
     * ```ts
     * await db.close()
     * ```
     */
    public async close(): Promise<void> {
        if (this.#close) {
            await this.#close()
            this.#connected = false
        }
    }

    /**
     * Verify connectivity by issuing a lightweight `SELECT 1` through the active
     * driver.
     *
     * @returns Resolves when the probe succeeds.
     * @throws If no connection is established or the query fails.
     *
     * @example
     * ```ts
     * await db.probe()
     * ```
     */
    public async probe(): Promise<void> {
        if (!this.#probe) {
            throw new Error('Database is not connected')
        }
        await this.#probe()
    }

    /**
     * Check if the database is currently connected.
     *
     * @returns True if a connection has been established.
     */
    public isConnected(): boolean {
        return this.#connected
    }
}
