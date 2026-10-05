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
import type { AnyColumn, Table } from 'drizzle-orm'
import { assertDrizzleTable } from './assert_table.ts'

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
    & Readonly<
        Record<
            | 'id'
            | 'userId'
            | 'name'
            | 'hash'
            | 'expiresAt'
            | 'lastUsedAt'
            | 'createdAt',
            AnyColumn
        >
    >

/**
 * Refuse anything that is not a Drizzle table carrying every column property
 * of {@link DrizzleAccessTokensTable}. Internal since v0.5.0: the provider runs
 * it at construction, with the same error.
 *
 * @param table - The candidate `tokensTable`.
 * @throws {TypeError} When `table` is not a Drizzle table, naming what it is;
 * or when it lacks column properties, naming each missing one.
 *
 * @internal
 */
export function assertAccessTokensTable(
    table: unknown,
): asserts table is DrizzleAccessTokensTable {
    assertDrizzleTable(table, ACCESS_TOKEN_COLUMNS, 'tokensTable')
}
