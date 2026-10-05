/**
 * @fileoverview The construction-time check that an option holds a Drizzle
 * table carrying the column properties a provider reads and writes.
 * Internal: not re-exported from any entry point.
 *
 * The access-tokens and remember-me tables are checked the same way, so the
 * check, its messages and its value-free description of a wrong argument live
 * here once.
 *
 * @module
 * @internal
 */

// Hard-rule-#2 exception: drizzle-orm is not published on JSR. The range
// matches `@lockness/drizzle` and the kits, so an app resolves one copy.
import { type AnyColumn, Column, is, Table } from 'drizzle-orm'

/**
 * Refuse anything that is not a Drizzle table carrying every one of
 * `columns` as a column property.
 *
 * The option's type already rejects a table name string at compile time; this
 * check is for the JavaScript caller, and for a table whose columns were
 * renamed, so that the mistake surfaces at construction rather than as a
 * failed query on the first authenticated request. No message quotes the
 * rejected value.
 *
 * @param table - The candidate option value.
 * @param columns - The property names the table must define.
 * @param optionName - The option, as the caller wrote it, for the message.
 * @throws {TypeError} When `table` is not a Drizzle table, naming what it is;
 * or when it lacks column properties, naming each missing one.
 *
 * @example
 * ```ts
 * assertDrizzleTable(accessTokens, ['id', 'hash'], 'tokensTable') // passes
 * assertDrizzleTable('access_tokens', ['id'], 'tokensTable') // TypeError
 * ```
 */
export function assertDrizzleTable<C extends string>(
    table: unknown,
    columns: readonly C[],
    optionName: string,
): asserts table is Table & Readonly<Record<C, AnyColumn>> {
    if (!is(table, Table)) {
        throw new TypeError(
            `${optionName} must be a Drizzle table object (pgTable, mysqlTable or sqliteTable), got ${
                describe(table)
            }`,
        )
    }
    const missing = columns.filter((name) =>
        !is(Reflect.get(table, name), Column)
    )
    if (missing.length > 0) {
        throw new TypeError(
            `${optionName} is missing the column ${
                missing.length === 1 ? 'property' : 'properties'
            } ${missing.map((name) => `"${name}"`).join(', ')}`,
        )
    }
}

/** A short, value-free description of a rejected argument. */
function describe(value: unknown): string {
    if (value === null) return 'null'
    if (typeof value === 'string') {
        return 'a string (a table name is not enough)'
    }
    return typeof value
}
