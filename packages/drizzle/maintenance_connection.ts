/**
 * @fileoverview The three {@link MaintenanceConnection} adapters (#447): how
 * each client runs a maintenance planner and its statements in one unit, on
 * one connection.
 *
 * Internal: no `exports` entry lists this module, so nothing here is public.
 * The adapters take structural clients, so a test can hand them a fake and
 * observe the protocol, and the migrator arrives as a closure: the
 * `import()` of drizzle-orm's migrator stays in `drivers.ts`, with its fixed
 * literal specifier (rule S2).
 *
 * | Dialect  | The unit `execute` opens                       | `close()`                   |
 * | :------- | :--------------------------------------------- | :-------------------------- |
 * | postgres | `BEGIN ISOLATION LEVEL REPEATABLE READ`        | ends the dedicated client   |
 * | mysql    | none, DDL auto-commits: the connection itself  | ends the connection         |
 * | libsql   | `transaction('write')`, `BEGIN IMMEDIATE`      | nothing: the handle's client |
 *
 * @module @lockness/drizzle/maintenance-connection
 */

import type {
    MaintenanceConnection,
    MaintenancePlanner,
    MigrateOptions,
} from './drivers.ts'

/** A catalogue row, keyed by column name. */
type Row = Record<string, unknown>

/** Runs drizzle-orm's migrator on the connection the adapter was built on. */
type Migrator = (options: MigrateOptions) => Promise<void>

// =============================================================================
// postgres
// =============================================================================

/**
 * The isolation the postgres reset transaction runs at. One snapshot for the
 * four catalogue reads, the census baseline and the census check: an object
 * outside the scope that another session drops meanwhile is still seen, so
 * the R7 check measures only what this transaction's own `CASCADE` reached.
 * postgres.js appends it to `begin `, letters and spaces only.
 */
export const REPEATABLE_READ = 'isolation level repeatable read'

/** The statement runner postgres.js hands a transaction scope. */
export interface PostgresStatementRunner {
    /** Run one complete statement and return its rows. */
    unsafe(sql: string): Promise<readonly Row[]>
}

/**
 * The part of a dedicated postgres.js client the adapter drives. The client
 * must hold one connection only (`max: 1`), so every call lands on it.
 */
export interface PostgresMaintenanceClient extends PostgresStatementRunner {
    /**
     * Run `run` inside `BEGIN <options> … COMMIT`, rolling back and
     * re-throwing when it rejects.
     */
    begin(
        options: string,
        run: (tx: PostgresStatementRunner) => Promise<void>,
    ): Promise<void>
    /** End the client and its one connection. */
    end(): Promise<void>
}

/**
 * The postgres connection: reads, the reset transaction and the migrate all
 * run on one dedicated single-connection client.
 *
 * @param client - A dedicated postgres.js client built with `max: 1`.
 * @param migrate - drizzle-orm's migrator over that same client.
 * @returns The connection; `close()` ends the client.
 *
 * @example
 * ```ts
 * const connection = postgresConnection(client, (options) => runMigrator(db, options))
 * ```
 */
export function postgresConnection(
    client: PostgresMaintenanceClient,
    migrate: Migrator,
): MaintenanceConnection {
    return {
        query: (sql) => client.unsafe(sql),
        // The planner reads through `tx`, after BEGIN and before the first
        // DDL statement, so the plan is built from the state it runs against.
        execute: (planner) =>
            client.begin(REPEATABLE_READ, async (tx) => {
                await runPlan(planner, (sql) => tx.unsafe(sql))
            }),
        migrate,
        close: () => client.end(),
    }
}

// =============================================================================
// mysql
// =============================================================================

/** The part of a mysql2 promise connection the adapter drives. */
export interface MysqlMaintenanceClient {
    /** Run one statement: `[rows, fields]`, rows an array for a read. */
    query(sql: string): Promise<readonly [unknown, unknown]>
    /** Close the connection. */
    end(): Promise<void>
}

/**
 * The MySQL connection: one `createConnection`, never a pool member.
 *
 * The plan turns `FOREIGN_KEY_CHECKS` off for the session; a pooled
 * connection would hand that to the next borrower, also when a statement
 * fails before the plan turns the checks back on. A connection that was never
 * in a pool has no next borrower, so the rule holds by construction. MySQL
 * DDL auto-commits, so the unit is the connection itself and a failure
 * part-way keeps what ran before it.
 *
 * @param connection - A connection from `mysql.createConnection`.
 * @param migrate - drizzle-orm's migrator over that same connection.
 * @returns The connection; `close()` ends it.
 *
 * @example
 * ```ts
 * const connection = mysqlConnection(await mysql.createConnection(url), migrator)
 * ```
 */
export function mysqlConnection(
    connection: MysqlMaintenanceClient,
    migrate: Migrator,
): MaintenanceConnection {
    const read = async (sql: string): Promise<readonly Row[]> => {
        const [rows] = await connection.query(sql)
        return Array.isArray(rows) ? rows as Row[] : []
    }
    return {
        query: read,
        execute: (planner) =>
            runPlan(planner, read, (sql) => connection.query(sql)),
        migrate,
        close: () => connection.end(),
    }
}

// =============================================================================
// libsql
// =============================================================================

/** A libsql result set: column names, and rows indexed like them. */
export interface LibsqlResult {
    /** The column names, in order. */
    readonly columns: readonly string[]
    /** The rows, each indexable by column position. */
    readonly rows: ReadonlyArray<ArrayLike<unknown>>
}

/** The part of a libsql transaction the adapter drives. */
export interface LibsqlMaintenanceTransaction {
    /** Run one statement inside the transaction. */
    execute(sql: string): Promise<LibsqlResult>
    /** Commit. */
    commit(): Promise<void>
    /** Roll back when still open, and give the connection back. */
    close(): void
}

/** The part of a libsql client the adapter drives. */
export interface LibsqlMaintenanceClient {
    /** Run one statement on the client. */
    execute(sql: string): Promise<LibsqlResult>
    /** Open a write transaction: `BEGIN IMMEDIATE` on a `file:` database. */
    transaction(mode: 'write'): Promise<LibsqlMaintenanceTransaction>
}

/**
 * The libsql connection: a view over the handle's own client, because a
 * `:memory:` database exists only on the client that opened it.
 *
 * The reads and the reset share one write transaction, which keeps every
 * other writer out between the catalogue read and the last `DROP`. The
 * migrate then runs on the same database through libsql's own `migrate`,
 * which turns foreign keys off before its own `BEGIN` — something it cannot
 * do inside ours, since SQLite ignores that pragma in a transaction.
 *
 * @param client - The handle's libsql client.
 * @param migrate - drizzle-orm's migrator over that same client.
 * @returns The connection; `close()` does nothing, the client stays the
 *   handle's.
 *
 * @example
 * ```ts
 * const connection = libsqlConnection(client, (options) => runMigrator(db, options))
 * ```
 */
export function libsqlConnection(
    client: LibsqlMaintenanceClient,
    migrate: Migrator,
): MaintenanceConnection {
    return {
        query: async (sql) => rowsOf(await client.execute(sql)),
        execute: async (planner) => {
            const tx = await client.transaction('write')
            try {
                await runPlan(
                    planner,
                    async (sql) => rowsOf(await tx.execute(sql)),
                    (sql) => tx.execute(sql),
                )
                await tx.commit()
            } finally {
                // A rollback unless committed; then it only hands the
                // connection back.
                tx.close()
            }
        },
        migrate,
        close: () => Promise.resolve(),
    }
}

/**
 * A libsql result set as plain objects keyed by column name.
 *
 * @param result - The result set.
 * @returns The rows.
 */
function rowsOf(result: LibsqlResult): Row[] {
    return result.rows.map((row) =>
        Object.fromEntries(result.columns.map((column, i) => [column, row[i]]))
    )
}

// =============================================================================
// Shared
// =============================================================================

/**
 * Build the plan, then run it: no statement runs before the planner has
 * resolved, so a refusal always comes before the first one.
 *
 * @param planner - Builds the statements from reads inside the unit.
 * @param read - Reads inside the unit.
 * @param run - Runs one statement inside the unit; `read` by default.
 * @returns Resolves once every statement ran.
 * @throws The planner's rejection, unchanged, or the first statement failure.
 */
async function runPlan(
    planner: MaintenancePlanner,
    read: (sql: string) => Promise<readonly Row[]>,
    run: (sql: string) => Promise<unknown> = read,
): Promise<void> {
    const statements = await planner(read)
    for (const statement of statements) await run(statement)
}
