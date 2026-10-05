/**
 * @fileoverview The shape of the remember-me tokens table
 * `DrizzleSessionProvider` writes to, and the runtime check that a table has
 * it (#457).
 *
 * The application owns the table — its DDL, its foreign key, its SQL column
 * names — and hands the provider the Drizzle table object. The contract is on
 * the **JavaScript property names** of that object, not on SQL names: the
 * store builds its queries from the column objects, so `hash:
 * text('token_hash')` is as good as `hash: text('hash')`.
 *
 * @module @lockness/auth-provider/drizzle/remember_tokens_table
 */

// Hard-rule-#2 exception: drizzle-orm is not published on JSR. The range
// matches `@lockness/drizzle` and the kits, so an app resolves one copy.
import type { AnyColumn, Table } from 'drizzle-orm'
import { assertDrizzleTable } from './assert_table.ts'

/** The column properties a remember-me table must carry. */
const REMEMBER_TOKEN_COLUMNS = [
    'id',
    'userId',
    'hash',
    'expiresAt',
    'firstIssuedAt',
    'createdAt',
] as const

/**
 * A Drizzle table (`pgTable`, `mysqlTable` or `sqliteTable`) with the six
 * column properties the remember-me store reads and writes. All are NOT NULL.
 *
 * | Property        | Holds                                                |
 * | :-------------- | :--------------------------------------------------- |
 * | `id`            | primary key                                          |
 * | `userId`        | the owner's id                                       |
 * | `hash`          | SHA-256 of the plaintext, hex — **unique**           |
 * | `expiresAt`     | timestamp                                            |
 * | `firstIssuedAt` | timestamp — the renewal chain's origin, kept by each recycle |
 * | `createdAt`     | timestamp — when this token was issued               |
 *
 * @example
 * ```ts
 * export const rememberMeTokens = pgTable('remember_me_tokens', {
 *     id: serial('id').primaryKey(),
 *     userId: integer('user_id').notNull()
 *         .references(() => users.id, { onDelete: 'cascade' }),
 *     hash: text('token_hash').notNull().unique(),
 *     expiresAt: timestamp('expires_at').notNull(),
 *     firstIssuedAt: timestamp('first_issued_at').notNull(),
 *     createdAt: timestamp('created_at').notNull(),
 * })
 * ```
 */
export type DrizzleRememberTokensTable =
    & Table
    & Readonly<
        Record<
            | 'id'
            | 'userId'
            | 'hash'
            | 'expiresAt'
            | 'firstIssuedAt'
            | 'createdAt',
            AnyColumn
        >
    >

/**
 * Refuse anything that is not a Drizzle table carrying every column property
 * of {@link DrizzleRememberTokensTable}.
 *
 * @param table - The candidate `rememberTokensTable`.
 * @throws {TypeError} When `table` is not a Drizzle table, naming what it is;
 * or when it lacks column properties, naming each missing one.
 *
 * @internal
 */
export function assertRememberTokensTable(
    table: unknown,
): asserts table is DrizzleRememberTokensTable {
    assertDrizzleTable(table, REMEMBER_TOKEN_COLUMNS, 'rememberTokensTable')
}
