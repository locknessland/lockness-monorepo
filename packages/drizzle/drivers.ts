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
 * A live connection's handle: the Drizzle instance plus the two operations the
 * `Database` service needs and that differ per client.
 */
export interface DriverHandle {
    /** The Drizzle database instance (typed by the caller per dialect). */
    readonly db: unknown
    /** Close the underlying client. */
    close(): Promise<void>
    /** Issue a lightweight connectivity probe (`SELECT 1`). */
    probe(): Promise<void>
}

/**
 * Opens a connection for one dialect and returns its {@link DriverHandle}. The
 * seam the `Database` service loads a driver through — overridable for tests
 * and for custom drivers.
 */
export type DriverFactory = (url: string) => Promise<DriverHandle>

/** The client package name per dialect, for the missing-driver error message. */
export const CLIENT_PACKAGE: Record<Dialect, string> = {
    postgres: 'postgres',
    mysql: 'mysql2',
    sqlite: '@libsql/client',
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
        const { drizzle } = await import('drizzle-orm/postgres-js')
        const postgres = (await import('postgres')).default
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
        const { drizzle } = await import('drizzle-orm/mysql2')
        const mysql = (await import('mysql2/promise')).default
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
        const { drizzle } = await import('drizzle-orm/libsql')
        const { createClient } = await import('@libsql/client')
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
