/**
 * @fileoverview The SQL dialect surface for the `Database` service — the
 * `Dialect` type, the conditional `DialectDatabase<D>` mapping, the one dialect
 * resolver, and the per-dialect driver factories that load their client
 * **on demand**.
 *
 * **On-demand, and safe.** Each factory `import()`s its Drizzle adapter and
 * client with a **fixed string-literal** specifier — never one composed from
 * config — so (a) config can never steer a module load (security S2) and (b) a
 * Postgres-only app never executes the MySQL/SQLite import, so their client
 * packages (and libsql's native binding) are never loaded at runtime (SC-005).
 *
 * @module @lockness/drizzle/drivers
 * @since 0.2.1
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { MySql2Database } from 'drizzle-orm/mysql2'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'

/**
 * Database schema type for Drizzle ORM — the generic constraint the dialect
 * database types are parameterised by.
 */
export type DatabaseSchema = Record<string, unknown>

/** The SQL dialects the `Database` service can connect through. */
export type Dialect = 'postgres' | 'mysql' | 'sqlite'

/**
 * The Drizzle database type for a given dialect. `postgres` (the default) maps
 * to `PostgresJsDatabase`, so an unparameterised `Database` is unchanged.
 *
 * @typeParam D - The dialect.
 */
export type DialectDatabase<D extends Dialect> = D extends 'mysql'
    ? MySql2Database<DatabaseSchema>
    : D extends 'sqlite' ? LibSQLDatabase<DatabaseSchema>
    : PostgresJsDatabase<DatabaseSchema>

/**
 * A configured client's handle: the Drizzle instance plus the two operations
 * the `Database` service needs and that differ per client.
 */
export interface DriverHandle {
    /** The Drizzle database instance (typed by the caller per dialect). */
    readonly db: unknown
    /** Close the underlying client. */
    close(): Promise<void>
    /**
     * Issue a lightweight connectivity probe (`SELECT 1`) — the handle's one
     * deliberate round trip, made only when `Database.probe()` is called.
     */
    probe(): Promise<void>
}

/**
 * Constructs the client for one dialect and returns its {@link DriverHandle}.
 * This is the seam the `Database` service loads a driver through — overridable
 * for tests (to inject a fake handle) and for registering custom drivers.
 *
 * **A factory constructs only; it must not make a round trip.** `Database`
 * calls it at boot, and on a scale-to-zero database any query at boot wakes and
 * bills the compute on every cold start (#420). The built-in clients are lazy —
 * constructing one opens nothing — and connectivity is checked only by the
 * handle's `probe()`, when a caller whose job is checking asks for it. A custom
 * factory registered through `Database.setDriverFactory` is held to the same
 * contract.
 *
 * Implementations load their adapter + client on demand, so the factory is
 * asynchronous; the returned promise resolves once the client is constructed,
 * not once the database has answered.
 *
 * @param url - The connection URL / DSN for the target database.
 * @returns A promise resolving to the {@link DriverHandle} for the client.
 * @throws If the client package is missing or the client constructor rejects
 * the URL. `Database.connect()` shows only the error's name, never its message,
 * which may quote the DSN; a default factory reports a missing package as an
 * internal `ClientUnavailableError`, whose import error is shown unless it
 * holds the password.
 *
 * @example
 * ```typescript
 * const factory: DriverFactory = async (url) => {
 *     const { drizzle } = await import('drizzle-orm/postgres-js')
 *     const postgres = (await import('postgres')).default
 *     const client = postgres(url)
 *     return {
 *         db: drizzle(client),
 *         close: () => client.end(),
 *         probe: async () => {
 *             await client`SELECT 1`
 *         },
 *     }
 * }
 * ```
 */
export type DriverFactory = (url: string) => Promise<DriverHandle>

/** The client package name per dialect, for the missing-driver error message. */
export const CLIENT_PACKAGE: Record<Dialect, string> = {
    postgres: 'postgres',
    mysql: 'mysql2',
    sqlite: '@libsql/client',
}

/**
 * A default factory could not import its adapter or client package. Internal:
 * not exported from the package.
 *
 * It exists so `Database.connect()` can tell "package missing" apart from
 * "client rejected the configuration" (#425, #427). The two need opposite
 * treatment. An import error names a module and never holds the DSN, so it
 * is shown — unless it holds the password, which a package name can be. A
 * constructor error may quote the DSN in any rewritten form, so
 * its message is withheld. A custom factory cannot raise this error; its
 * failures always take the withheld path.
 *
 * @example
 * ```ts
 * throw new ClientUnavailableError('mysql', importError)
 * ```
 */
export class ClientUnavailableError extends Error {
    /** The dialect whose client package could not be imported. */
    readonly dialect: Dialect

    /**
     * @param dialect - The dialect whose client package failed to import.
     * @param cause - The import failure. It names a module, never the DSN.
     */
    constructor(dialect: Dialect, cause: unknown) {
        super(
            `The '${dialect}' driver's client package (${
                CLIENT_PACKAGE[dialect]
            }) could not be imported`,
            { cause },
        )
        this.name = 'ClientUnavailableError'
        this.dialect = dialect
    }
}

/**
 * Run a default factory's imports, turning any failure into a
 * {@link ClientUnavailableError}.
 *
 * The imports stay inside the caller's closure, each with its fixed literal
 * specifier, so config still never steers a module load (rule S2). Only the
 * load runs under this wrapper: a failure of the client constructor that
 * follows is not an import failure, and must not be reported as one.
 *
 * @param dialect - The dialect being loaded.
 * @param load - A closure that performs the literal `import()` calls.
 * @returns Whatever `load` resolves to.
 * @throws {ClientUnavailableError} When `load` rejects, with the rejection as
 *   `cause`.
 *
 * @example
 * ```ts
 * const { createClient } = await loadClient(
 *     'sqlite',
 *     () => import('@libsql/client'),
 * )
 * ```
 */
export async function loadClient<T>(
    dialect: Dialect,
    load: () => Promise<T>,
): Promise<T> {
    try {
        return await load()
    } catch (error) {
        throw new ClientUnavailableError(dialect, error)
    }
}

/**
 * Resolve the dialect from an explicit config value and the connection URL, in
 * a fixed precedence: **explicit `driver` wins**, else infer from the URL
 * scheme, else default `postgres`. The one home for this decision (plan §5); the
 * CLI path (URL only) relies on the inference fallback.
 *
 * @param driver - The explicit `DatabaseConfig.driver`, if set.
 * @param url - The connection URL / DSN.
 * @returns The resolved dialect.
 *
 * @example
 * ```typescript
 * resolveDialect(undefined, 'mysql://h/db') // 'mysql'
 * resolveDialect('sqlite', 'postgres://h')  // 'sqlite' (explicit wins)
 * ```
 */
export function resolveDialect(
    driver: Dialect | undefined,
    url: string,
): Dialect {
    if (driver) return driver
    if (url.startsWith('mysql://')) return 'mysql'
    if (
        url.startsWith('file:') || url.startsWith('libsql://') ||
        url.startsWith('sqlite:')
    ) {
        return 'sqlite'
    }
    return 'postgres'
}

/**
 * The real driver factories — one per dialect, each loading its adapter + client
 * on demand via a fixed-literal `import()`.
 */
export const defaultDriverFactories: Record<Dialect, DriverFactory> = {
    postgres: async (url) => {
        const { drizzle, postgres } = await loadClient(
            'postgres',
            async () => ({
                drizzle: (await import('drizzle-orm/postgres-js')).drizzle,
                postgres: (await import('postgres')).default,
            }),
        )
        const client = postgres(url)
        return {
            db: drizzle(client),
            close: () => client.end(),
            probe: async () => {
                await client`SELECT 1`
            },
        }
    },
    mysql: async (url) => {
        const { drizzle, mysql } = await loadClient('mysql', async () => ({
            drizzle: (await import('drizzle-orm/mysql2')).drizzle,
            mysql: (await import('mysql2/promise')).default,
        }))
        const pool = mysql.createPool(url)
        return {
            db: drizzle(pool),
            close: () => pool.end(),
            probe: async () => {
                await pool.query('SELECT 1')
            },
        }
    },
    sqlite: async (url) => {
        const { drizzle, createClient } = await loadClient(
            'sqlite',
            async () => ({
                drizzle: (await import('drizzle-orm/libsql')).drizzle,
                createClient: (await import('@libsql/client')).createClient,
            }),
        )
        const client = createClient({ url })
        return {
            db: drizzle(client),
            close: () => {
                client.close()
                return Promise.resolve()
            },
            probe: async () => {
                await client.execute('SELECT 1')
            },
        }
    },
}
