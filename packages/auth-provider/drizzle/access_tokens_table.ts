/**
 * @fileoverview The shape of the access-tokens table `DrizzleTokenProvider`
 * writes to, and the runtime check that a table has it (#452).
 *
 * The application owns the table — its DDL, its foreign key, its SQL column
 * names — and hands the provider the Drizzle table object. The contract is on
 * the **JavaScript property names** of that object, not on SQL names: the
 * provider builds its queries from the column objects, so `hash:
 * text('token_hash')` is as good as `hash: text('hash')`.
 *
 * @module @lockness/auth-provider/drizzle/access_tokens_table
 */

// Hard-rule-#2 exception: drizzle-orm is not published on JSR. The range
// matches `@lockness/drizzle` and the kits, so an app resolves one copy.
import { type AnyColumn, Column, is, Table } from 'drizzle-orm'

/** The column properties a tokens table must carry, in declaration order. */
const ACCESS_TOKEN_COLUMNS = [
    'id',
    'userId',
    'name',
    'hash',
    'expiresAt',
    'lastUsedAt',
    'createdAt',
] as const

/** One of the property names an access-tokens table must define. */
export type AccessTokenColumn = typeof ACCESS_TOKEN_COLUMNS[number]

/**
 * A Drizzle table (`pgTable`, `mysqlTable` or `sqliteTable`) with the seven
 * column properties the token provider reads and writes.
 *
 * | Property     | Holds                                         |
 * | :----------- | :-------------------------------------------- |
 * | `id`         | primary key                                   |
 * | `userId`     | the owner's id                                |
 * | `name`       | the token's label                             |
 * | `hash`       | SHA-256 of the plaintext, hex — **unique**    |
 * | `expiresAt`  | timestamp, NOT NULL                           |
 * | `lastUsedAt` | timestamp, nullable                           |
 * | `createdAt`  | timestamp, NOT NULL                           |
 *
 * @example
 * ```ts
 * export const accessTokens = pgTable('access_tokens', {
 *     id: serial('id').primaryKey(),
 *     userId: integer('user_id').notNull().references(() => users.id),
 *     name: text('name').notNull(),
 *     hash: text('hash').notNull().unique(),
 *     expiresAt: timestamp('expires_at').notNull(),
 *     lastUsedAt: timestamp('last_used_at'),
 *     createdAt: timestamp('created_at').notNull().defaultNow(),
 * })
 * ```
 */
export type DrizzleAccessTokensTable =
    & Table
    & Readonly<Record<AccessTokenColumn, AnyColumn>>

/**
 * Refuse anything that is not a Drizzle table carrying every column property
 * of {@link DrizzleAccessTokensTable}.
 *
 * The type already rejects a table name string at compile time; this check is
 * for the JavaScript caller, and for a table whose columns were renamed, so
 * that the mistake surfaces at construction rather than as a failed query on
 * the first authenticated request.
 *
 * @param table - The candidate `tokensTable`.
 * @throws {TypeError} When `table` is not a Drizzle table, naming what it is;
 * or when it lacks column properties, naming each missing one.
 *
 * @example
 * ```ts
 * assertAccessTokensTable(accessTokens) // passes
 * assertAccessTokensTable('access_tokens') // TypeError
 * ```
 */
export function assertAccessTokensTable(
    table: unknown,
): asserts table is DrizzleAccessTokensTable {
    if (!is(table, Table)) {
        throw new TypeError(
            `tokensTable must be a Drizzle table object (pgTable, mysqlTable or sqliteTable), got ${
                describe(table)
            }`,
        )
    }
    const missing = ACCESS_TOKEN_COLUMNS.filter((name) =>
        !is(Reflect.get(table, name), Column)
    )
    if (missing.length > 0) {
        throw new TypeError(
            `tokensTable is missing the column ${
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
