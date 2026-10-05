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
 * The drizzle-orm migrator each handle's `maintenance.migrate` runs (#435) is
 * loaded the same way, and only when `db:fresh` asks for it.
 *
 * @module @lockness/drizzle/drivers
 * @since 0.2.1
 */

import type {
    drizzle as drizzlePostgres,
    PostgresJsDatabase,
} from 'drizzle-orm/postgres-js'
import type postgresClient from 'postgres'
import type { MySql2Database } from 'drizzle-orm/mysql2'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { consoleNoticeReporter, reportNotice } from './notice.ts'

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
    /**
     * The schema-maintenance capability `db:fresh` resets and migrates
     * through (#435). Optional, so a custom {@link DriverFactory} keeps
     * working without it; `db:fresh` refuses a handle that has none.
     */
    readonly maintenance?: SchemaMaintenance
}

/**
 * Where drizzle-orm's migrator keeps its bookkeeping, and the folder it reads.
 * The same three values `drizzle-kit migrate` passes it.
 */
export interface MigrateOptions {
    /** The migrations folder (`out` in `drizzle.config.ts`). It is only read. */
    readonly folder: string
    /** The bookkeeping table (`migrations.table`, default `__drizzle_migrations`). */
    readonly table: string
    /**
     * The bookkeeping schema (`migrations.schema`, default `drizzle`).
     * postgres only; the other dialects ignore it.
     */
    readonly schema?: string
}

/**
 * What `db:fresh` needs from a connection, and nothing more (#435): read the
 * catalogue, run a reset plan in one dedicated session, and apply every
 * migration with the adapter's own drizzle-orm migrator.
 *
 * The policy — what to drop, what to refuse — lives in `reset.ts`; this is
 * only the mechanism, because the session rules differ per client.
 *
 * @example
 * ```ts
 * const rows = await maintenance.query('SELECT 1 AS n') // [{ n: 1 }]
 * await maintenance.execute(['DROP TABLE IF EXISTS "t"'])
 * await maintenance.migrate({
 *     folder: './database/migrations',
 *     table: '__drizzle_migrations',
 * })
 * ```
 */
export interface SchemaMaintenance {
    /**
     * Run one read-only statement and return its rows as plain objects keyed
     * by column name.
     *
     * @param sql - A complete SQL statement; it takes no parameters.
     * @returns The rows.
     * @throws Whatever the client raises.
     */
    query(sql: string): Promise<readonly Record<string, unknown>[]>
    /**
     * Run statements in order on one dedicated session that is discarded
     * afterwards: one transaction on postgres, one write batch on libsql, and
     * on MySQL a connection that is destroyed, never released to the pool
     * (MySQL DDL auto-commits, so it is not atomic there).
     *
     * @param statements - Complete SQL statements, run in order.
     * @returns Resolves once every statement ran.
     * @throws The first statement failure; on postgres and libsql nothing is
     *   kept.
     */
    execute(statements: readonly string[]): Promise<void>
    /**
     * Apply every pending migration through the adapter's own drizzle-orm
     * migrator, on this connection. The folder is only read.
     *
     * @param options - Folder and bookkeeping location.
     * @returns Resolves once every migration was applied.
     * @throws When the folder cannot be read or a migration fails.
     */
    migrate(options: MigrateOptions): Promise<void>
}

/** The one MySQL connection a reset borrows. Internal. */
export interface MysqlSession {
    /** Run one statement. */
    query(sql: string): Promise<unknown>
    /** Close the socket and remove the connection from its pool. */
    destroy(): void
    /** Hand the connection back to the pool — never called by a reset. */
    release(): void
}

/**
 * Run statements on one dedicated MySQL connection, then destroy it.
 *
 * Never released: the plan sets `FOREIGN_KEY_CHECKS = 0`, and a released
 * connection would carry that session setting to the next borrower — also
 * when a statement fails before the plan turns the checks back on.
 *
 * @param pool - Anything that lends a connection.
 * @param statements - The statements, run in order.
 * @returns Resolves once every statement ran.
 * @throws The first statement failure, after the connection is destroyed.
 *
 * @example
 * ```ts
 * await executeOnDedicatedSession(pool, [
 *     'SET FOREIGN_KEY_CHECKS = 0',
 *     'DROP TABLE IF EXISTS `t`',
 * ])
 * ```
 */
export async function executeOnDedicatedSession(
    pool: { getConnection(): Promise<MysqlSession> },
    statements: readonly string[],
): Promise<void> {
    const session = await pool.getConnection()
    try {
        for (const statement of statements) await session.query(statement)
    } finally {
        session.destroy()
    }
}

/** The transaction entry point of a postgres.js client. Internal. */
export interface PostgresTransactor {
    /** Run `run` inside `BEGIN … COMMIT`, rolling back when it rejects. */
    begin<T>(
        run: (tx: { unsafe(sql: string): Promise<unknown> }) => Promise<T>,
    ): Promise<T>
}

/**
 * Run statements inside one postgres transaction: all of them are kept, or
 * none is.
 *
 * @param client - A postgres.js client.
 * @param statements - The statements, run in order.
 * @returns Resolves once the transaction committed.
 * @throws The first statement failure, after the rollback.
 *
 * @example
 * ```ts
 * await executeInTransaction(client, [
 *     'DROP TABLE IF EXISTS "public"."t" CASCADE',
 * ])
 * ```
 */
export async function executeInTransaction(
    client: PostgresTransactor,
    statements: readonly string[],
): Promise<void> {
    await client.begin(async (tx) => {
        for (const statement of statements) await tx.unsafe(statement)
    })
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
 * @param options - Per-connection options; see {@link DriverOptions}. A
 * factory written for one parameter still type-checks, and a dialect whose
 * client raises no server notices ignores it.
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
export type DriverFactory = (
    url: string,
    options?: DriverOptions,
) => Promise<DriverHandle>

/**
 * What `Database.connect` hands a {@link DriverFactory} besides the url.
 *
 * @example
 * ```ts
 * // A custom postgres factory installs the routed callback on its client.
 * const factory: DriverFactory = async (url, options) => {
 *     const client = postgres(url, { onnotice: options?.onNotice })
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
export interface DriverOptions {
    /**
     * Receives every server notice the client raises (#454) — postgres only;
     * MySQL and SQLite ignore it. The postgres factory installs it as
     * postgres.js's `onnotice`, and falls back to the console notice policy
     * when it is absent, so a client never prints postgres.js's raw notice
     * object.
     */
    readonly onNotice?: (notice: unknown) => void
}

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
 * Loads the postgres adapter and client — the seam {@link postgresDriverFactory}
 * builds its client through. Internal: a test passes a fake to observe the
 * options the client is constructed with (#454), since drizzle-orm 0.36 exposes
 * no `$client` on a finished handle.
 */
export type PostgresClientLoader = () => Promise<{
    readonly drizzle: typeof drizzlePostgres
    readonly postgres: typeof postgresClient
}>

/** The real loader: both modules, each by its fixed literal specifier (S2). */
const loadPostgresClient: PostgresClientLoader = async () => ({
    drizzle: (await import('drizzle-orm/postgres-js')).drizzle,
    postgres: (await import('postgres')).default,
})

/**
 * The postgres driver factory. Every client it builds reports server notices
 * through {@link DriverOptions.onNotice} — or, when the caller gives none,
 * through the console fallback — never through postgres.js's own default,
 * which dumps the raw notice object on stdout (#454).
 *
 * Internal: not exported from the package. It exists as a test seam, so a
 * test can pass a fake `load` and observe the options the client is built
 * with; `defaultDriverFactories.postgres` is this factory with the real
 * loader.
 *
 * @param load - Loads the adapter and client; the real modules by default.
 *   A load failure becomes a `ClientUnavailableError`.
 * @returns The factory.
 */
export function postgresDriverFactory(
    load: PostgresClientLoader = loadPostgresClient,
): DriverFactory {
    return async (url, options) => {
        const { drizzle, postgres } = await loadClient('postgres', load)
        const client = postgres(url, {
            onnotice: options?.onNotice ??
                ((notice) => reportNotice(notice, consoleNoticeReporter)),
        })
        const db = drizzle(client)
        return {
            db,
            close: () => client.end(),
            probe: async () => {
                await client`SELECT 1`
            },
            maintenance: {
                query: async (sql) => [...await client.unsafe(sql)],
                execute: (statements) =>
                    executeInTransaction(
                        client as unknown as PostgresTransactor,
                        statements,
                    ),
                migrate: async ({ folder, table, schema }) => {
                    const { migrate } = await loadClient(
                        'postgres',
                        () => import('drizzle-orm/postgres-js/migrator'),
                    )
                    await migrate(db, {
                        migrationsFolder: folder,
                        migrationsTable: table,
                        migrationsSchema: schema,
                    })
                },
            },
        }
    }
}

/**
 * The real driver factories — one per dialect, each loading its adapter + client
 * on demand via a fixed-literal `import()`.
 */
export const defaultDriverFactories: Record<Dialect, DriverFactory> = {
    postgres: postgresDriverFactory(),
    mysql: async (url) => {
        const { drizzle, mysql } = await loadClient('mysql', async () => ({
            drizzle: (await import('drizzle-orm/mysql2')).drizzle,
            mysql: (await import('mysql2/promise')).default,
        }))
        const pool = mysql.createPool(url)
        const db = drizzle(pool)
        return {
            db,
            close: () => pool.end(),
            probe: async () => {
                await pool.query('SELECT 1')
            },
            maintenance: {
                query: async (sql) => {
                    const [rows] = await pool.query(sql)
                    return Array.isArray(rows)
                        ? rows as Record<string, unknown>[]
                        : []
                },
                execute: (statements) =>
                    executeOnDedicatedSession(
                        pool as unknown as {
                            getConnection(): Promise<MysqlSession>
                        },
                        statements,
                    ),
                migrate: async ({ folder, table }) => {
                    const { migrate } = await loadClient(
                        'mysql',
                        () => import('drizzle-orm/mysql2/migrator'),
                    )
                    await migrate(db, {
                        migrationsFolder: folder,
                        migrationsTable: table,
                    })
                },
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
        const db = drizzle(client)
        return {
            db,
            close: () => {
                client.close()
                return Promise.resolve()
            },
            probe: async () => {
                await client.execute('SELECT 1')
            },
            maintenance: {
                query: async (sql) => {
                    const result = await client.execute(sql)
                    return result.rows.map((row) =>
                        Object.fromEntries(
                            result.columns.map((column, i) => [column, row[i]]),
                        )
                    )
                },
                // One write batch: libsql runs it as one transaction, so a
                // failed statement keeps nothing.
                execute: async (statements) => {
                    await client.batch([...statements], 'write')
                },
                migrate: async ({ folder, table }) => {
                    const { migrate } = await loadClient(
                        'sqlite',
                        () => import('drizzle-orm/libsql/migrator'),
                    )
                    await migrate(db, {
                        migrationsFolder: folder,
                        migrationsTable: table,
                    })
                },
            },
        }
    },
}
