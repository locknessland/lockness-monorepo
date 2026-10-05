/**
 * @fileoverview The `db:status` policy (#439): which journal entries the
 * database has applied, read from drizzle-orm's bookkeeping table and judged
 * by drizzle-orm's own rule.
 *
 * drizzle-orm 0.36.4's migrators (pg-core, mysql-core, libsql) all read the
 * latest bookkeeping row (`ORDER BY created_at DESC LIMIT 1`), apply each
 * journal entry whose `when` is greater than that row's `created_at`, and
 * record `(hash, created_at = when)` for each. The stored hash is never
 * compared. So the rule `db:migrate` follows is a high-water mark,
 * `pending ⇔ when > max(created_at)`, and a status computed any other way
 * would disagree with the command it reports on. `status_libsql.test.ts` runs
 * the real migrator to pin that the two agree.
 *
 * | State          | Rule                                                    |
 * | :------------- | :------------------------------------------------------ |
 * | applied        | a row has `created_at == when`                          |
 * | — edited       | applied, but no matching row holds the file's hash      |
 * | pending        | `when > max(created_at)`, or no row at all              |
 * | out of order   | no matching row, and `when < max(created_at)`           |
 * | unknown row    | a row whose `created_at` matches no entry               |
 *
 * Read-only: whether the table exists is asked of the catalogue with one
 * fixed-text query per dialect, and the names are compared here, in
 * TypeScript, so no config value is ever written into SQL as a literal. The
 * migrator itself is never called: it creates the bookkeeping table before
 * it reads. The mechanism stays in the adapters; this module needs only
 * `query`. Internal: no `exports` entry lists it.
 *
 * @module @lockness/drizzle/migration_status
 * @internal
 * @since 0.5.0
 */

import type { Dialect, SchemaMaintenance } from './drivers.ts'
import {
    DEFAULT_BOOKKEEPING_SCHEMA,
    type MigrationEntry,
    type MigrationSettings,
} from './migration_settings.ts'
import { backtick, quote } from './sql_text.ts'

/** Where the bookkeeping table is: a subset of the migration settings. */
export type BookkeepingLocation = Pick<
    MigrationSettings,
    'dialect' | 'table' | 'schema'
>

/** One bookkeeping row, normalised across the three clients. */
export interface BookkeepingRow {
    /** The hash the migrator recorded: the file's SHA-256 when it ran. */
    readonly hash: string
    /** The entry's `when`, as the migrator recorded it. */
    readonly createdAt: bigint
}

/** What `db:status` says about one journal entry. */
export type EntryState = 'applied' | 'pending' | 'out-of-order'

/** One journal entry and its state. */
export interface EntryStatus {
    /** The journal entry. */
    readonly entry: MigrationEntry
    /** Whether `db:migrate` applied it, will apply it, or never will. */
    readonly state: EntryState
    /** Applied, but its file changed since: `db:migrate` will not re-run it. */
    readonly edited: boolean
}

/**
 * The status of every journal entry against one database. Only ever built
 * from rows read from that database; `tableExists: false` means it was never
 * migrated.
 */
export interface MigrationStatus {
    /** Every journal entry, in journal order. */
    readonly entries: readonly EntryStatus[]
    /** Rows no journal entry matches: applied elsewhere, or a deleted file. */
    readonly unknownRows: readonly BookkeepingRow[]
    /** Whether the bookkeeping table was found. */
    readonly tableExists: boolean
}

/** The report `db:status` prints, and the failure it throws when one is due. */
export interface StatusReport {
    /** The lines to print, in order. */
    readonly lines: readonly string[]
    /** The count of unapplied entries, as the last line; absent on success. */
    readonly failure: string | undefined
}

// =============================================================================
// SQL
// =============================================================================

/**
 * The fixed catalogue query that lists the tables the bookkeeping table could
 * be. No config value is in it; the match is made by {@link findTable}.
 *
 * - postgres: every table of `pg_catalog.pg_tables`, with its schema. A
 *   database never migrated has no bookkeeping schema, which is no match.
 * - mysql: the tables of `DATABASE()`, the database the url names (#456).
 * - sqlite: the tables of `main`.
 *
 * @param dialect - The runtime dialect.
 * @returns The statement.
 *
 * @example
 * ```ts
 * catalogueQuery('sqlite') // "SELECT name FROM sqlite_master WHERE type = 'table'"
 * ```
 */
export function catalogueQuery(dialect: Dialect): string {
    switch (dialect) {
        case 'postgres':
            return 'SELECT schemaname AS schema, tablename AS name ' +
                'FROM pg_catalog.pg_tables'
        case 'mysql':
            return 'SELECT table_name AS name FROM information_schema.tables ' +
                'WHERE table_schema = DATABASE()'
        case 'sqlite':
            return "SELECT name FROM sqlite_master WHERE type = 'table'"
    }
}

/**
 * The bookkeeping table's name, quoted for its dialect: `"schema"."table"`
 * on postgres, `` `table` `` on MySQL, `"table"` on sqlite. Used in the row
 * query and in the report header.
 *
 * @param location - Where the table is.
 * @returns The quoted name.
 *
 * @example
 * ```ts
 * bookkeepingName({ dialect: 'postgres', table: 't', schema: 's' }) // '"s"."t"'
 * ```
 */
export function bookkeepingName(location: BookkeepingLocation): string {
    switch (location.dialect) {
        case 'postgres':
            return `${quote(schemaOf(location))}.${quote(location.table)}`
        case 'mysql':
            return backtick(location.table)
        case 'sqlite':
            return quote(location.table)
    }
}

/**
 * The postgres bookkeeping schema: the configured one, or the default the
 * migrator writes to. The settings always fill it in for postgres; the
 * fallback keeps one default rather than a second one, as `reset.ts` does.
 *
 * @param location - Where the table is.
 * @returns The schema holding the bookkeeping table.
 */
function schemaOf(location: BookkeepingLocation): string {
    return location.schema ?? DEFAULT_BOOKKEEPING_SCHEMA
}

/**
 * The query that reads the whole bookkeeping table.
 *
 * @param location - Where the table is.
 * @returns The statement.
 *
 * @example
 * ```ts
 * rowsQuery({ dialect: 'sqlite', table: 'history', schema: undefined })
 * // 'SELECT hash, created_at FROM "history" ORDER BY created_at'
 * ```
 */
export function rowsQuery(location: BookkeepingLocation): string {
    return `SELECT hash, created_at FROM ${
        bookkeepingName(location)
    } ORDER BY created_at`
}

// =============================================================================
// Reading
// =============================================================================

/**
 * Read the bookkeeping table, if it exists: one catalogue query, then, only
 * when the table is there, the whole table.
 *
 * @param maintenance - The connection's read capability.
 * @param location - Where the table is.
 * @returns Every row, normalised; `undefined` when the table does not exist.
 * @throws Whatever `query` throws, or an `Error` when the catalogue or a row
 *   does not answer as expected. No row value is ever quoted.
 *
 * @example
 * ```ts
 * const rows = await readBookkeeping(session, settings) // undefined: never migrated
 * ```
 */
export async function readBookkeeping(
    maintenance: Pick<SchemaMaintenance, 'query'>,
    location: BookkeepingLocation,
): Promise<readonly BookkeepingRow[] | undefined> {
    const catalogue = await maintenance.query(
        catalogueQuery(location.dialect),
    )
    if (!findTable(catalogue, location)) return undefined
    const rows = await maintenance.query(rowsQuery(location))
    try {
        return rows.map(toBookkeepingRow)
    } catch (error) {
        throw new Error(
            `the bookkeeping table ${bookkeepingName(location)} holds a row ` +
                `whose ${messageOf(error)}`,
            { cause: error },
        )
    }
}

/**
 * Whether the catalogue lists the bookkeeping table, by exact name: the
 * schema and the table on postgres, the table alone elsewhere.
 *
 * @param catalogue - The rows of {@link catalogueQuery}.
 * @param location - Where the table should be.
 * @returns True when a row names it.
 * @throws {Error} When a row lacks a text `name` (or, on postgres, `schema`).
 */
function findTable(
    catalogue: readonly Record<string, unknown>[],
    location: BookkeepingLocation,
): boolean {
    return catalogue.some((row) =>
        catalogueText(row, 'name') === location.table &&
        (location.dialect !== 'postgres' ||
            catalogueText(row, 'schema') === schemaOf(location))
    )
}

/**
 * Read a text column from a catalogue row.
 *
 * @param row - The row.
 * @param column - The column.
 * @returns The value.
 * @throws {Error} When it is not a string: nothing is concluded on a guess.
 */
function catalogueText(row: Record<string, unknown>, column: string): string {
    const value = row[column]
    if (typeof value !== 'string') {
        throw new Error(
            `the catalogue returned a row without a text \`${column}\``,
        )
    }
    return value
}

/**
 * Normalise one bookkeeping row. postgres.js returns `int8` as a string,
 * mysql2 returns `BIGINT` as a number, libsql returns `numeric` as a number,
 * and a client in bigint mode returns a bigint: all become a `BigInt`.
 *
 * @param row - The raw row, with `hash` and `created_at`.
 * @returns The row.
 * @throws {Error} When `created_at` is not an integer (null, fractional,
 *   beyond 2^53 as a number, or non-numeric text), or `hash` is not text.
 *   The value is never quoted.
 *
 * @example
 * ```ts
 * toBookkeepingRow({ hash: 'h', created_at: '1700000000000' })
 * // { hash: 'h', createdAt: 1700000000000n }
 * ```
 */
export function toBookkeepingRow(row: Record<string, unknown>): BookkeepingRow {
    const hash = row.hash
    if (typeof hash !== 'string') throw new Error('hash is not text')
    const createdAt = toInteger(row.created_at)
    if (createdAt === undefined) {
        throw new Error('created_at is not an integer')
    }
    return { hash, createdAt }
}

/**
 * A `created_at` as an exact integer, or `undefined` when it is not one.
 *
 * @param value - The raw value.
 * @returns The integer.
 */
function toInteger(value: unknown): bigint | undefined {
    if (typeof value === 'bigint') return value
    if (typeof value === 'number') {
        return Number.isSafeInteger(value) ? BigInt(value) : undefined
    }
    if (typeof value === 'string' && /^-?\d+$/.test(value)) {
        return BigInt(value)
    }
    return undefined
}

// =============================================================================
// Comparing
// =============================================================================

/**
 * Classify each journal entry against the bookkeeping rows, by drizzle-orm's
 * high-water rule. Pure.
 *
 * The decision follows the migrator's own order: an entry newer than every
 * row is pending (it will be applied); otherwise it is applied when a row
 * records its `when`, and out of order when none does (it never will be).
 *
 * @param entries - The journal entries, in journal order.
 * @param rows - Every bookkeeping row; `undefined` when the table is absent.
 * @returns The status.
 *
 * @example
 * ```ts
 * computeMigrationStatus(
 *     [{ tag: '0000_init', when: 1, hash: 'h' }],
 *     undefined,
 * ).entries[0].state // 'pending'
 * ```
 */
export function computeMigrationStatus(
    entries: readonly MigrationEntry[],
    rows: readonly BookkeepingRow[] | undefined,
): MigrationStatus {
    const recorded = rows ?? []
    const highWater = recorded.reduce<bigint | undefined>(
        (max, row) =>
            max === undefined || row.createdAt > max ? row.createdAt : max,
        undefined,
    )
    const statuses = entries.map((entry): EntryStatus => {
        const when = BigInt(entry.when)
        if (highWater === undefined || when > highWater) {
            return { entry, state: 'pending', edited: false }
        }
        const matching = recorded.filter((row) => row.createdAt === when)
        if (matching.length === 0) {
            return { entry, state: 'out-of-order', edited: false }
        }
        return {
            entry,
            state: 'applied',
            edited: !matching.some((row) => row.hash === entry.hash),
        }
    })
    const journaled = new Set(entries.map((entry) => BigInt(entry.when)))
    return {
        entries: statuses,
        unknownRows: recorded.filter((row) => !journaled.has(row.createdAt)),
        tableExists: rows !== undefined,
    }
}

// =============================================================================
// Rendering
// =============================================================================

/** The width of the state column, `out of order` plus three spaces. */
const STATE_WIDTH = 15

/** How each state is labelled in the listing. */
const STATE_LABEL: Readonly<Record<EntryState, string>> = {
    applied: 'applied',
    pending: 'pending',
    'out-of-order': 'out of order',
}

/** The warning after an edited entry. */
const EDITED_NOTE =
    '⚠️ edited after it was applied; db:migrate will not re-run it'

/** The warning after an out-of-order entry. */
const OUT_OF_ORDER_NOTE = '⚠️ older than the latest applied migration; ' +
    'db:migrate will not apply it'

/**
 * Render a status as the lines `db:status` prints, and the failure it throws
 * when any entry is pending or out of order. The url is never in it: the
 * header names the bookkeeping table, and the tags come from the journal.
 *
 * @param status - The computed status.
 * @param location - Where the bookkeeping table is, for the header.
 * @returns The lines, and the count of unapplied entries as the failure.
 *
 * @example
 * ```ts
 * const { lines, failure } = renderMigrationStatus(status, settings)
 * ```
 */
export function renderMigrationStatus(
    status: MigrationStatus,
    location: BookkeepingLocation,
): StatusReport {
    const lines = [
        `📊 Migration status (bookkeeping table ${bookkeepingName(location)})`,
    ]
    if (!status.tableExists) {
        lines.push(
            '  The bookkeeping table does not exist: this database has ' +
                'never been migrated',
        )
    }
    const tagWidth =
        Math.max(0, ...status.entries.map((s) => s.entry.tag.length)) + 5
    for (const { entry, state, edited } of status.entries) {
        const note = edited
            ? EDITED_NOTE
            : state === 'out-of-order'
            ? OUT_OF_ORDER_NOTE
            : ''
        lines.push(
            `  ${STATE_LABEL[state].padEnd(STATE_WIDTH)}${
                entry.tag.padEnd(tagWidth)
            }${note}`.trimEnd(),
        )
    }
    if (status.unknownRows.length > 0) {
        const n = status.unknownRows.length
        lines.push(
            `  ⚠️ ${n} applied migration${n === 1 ? ' is' : 's are'} not in ` +
                `the journal (recorded at ${
                    status.unknownRows.map((row) => recordedAt(row.createdAt))
                        .join(', ')
                })`,
        )
    }

    const total = status.entries.length
    const pending = status.entries.filter((s) => s.state === 'pending').length
    const outOfOrder = status.entries.filter((s) => s.state === 'out-of-order')
        .length
    const unapplied = pending + outOfOrder
    if (unapplied === 0) {
        lines.push(
            total === 0
                ? '✅ The journal lists no migrations'
                : total === 1
                ? '✅ The one migration is applied'
                : `✅ All ${total} migrations are applied`,
        )
        return { lines, failure: undefined }
    }
    const parts = [
        pending > 0 ? `${pending} pending` : '',
        outOfOrder > 0 ? `${outOfOrder} out of order` : '',
    ].filter((part) => part !== '')
    return {
        lines,
        failure:
            `${unapplied} of ${total} migration${total === 1 ? '' : 's'} ` +
            `${unapplied === 1 ? 'is' : 'are'} not applied: ${
                parts.join(', ')
            }`,
    }
}

/** The largest magnitude, in milliseconds, a `Date` can hold. */
const MAX_DATE_MS = 8_640_000_000_000_000n

/**
 * When a row was recorded, as an ISO date: drizzle-kit timestamps its
 * entries in milliseconds. A value no `Date` can hold is shown as it is.
 *
 * @param createdAt - The row's `created_at`.
 * @returns The rendering.
 */
function recordedAt(createdAt: bigint): string {
    const magnitude = createdAt < 0n ? -createdAt : createdAt
    return magnitude <= MAX_DATE_MS
        ? new Date(Number(createdAt)).toISOString()
        : `created_at ${createdAt}`
}

/**
 * The message of a thrown value.
 *
 * @param error - Whatever was thrown.
 * @returns Its message, or its string form.
 */
function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}
