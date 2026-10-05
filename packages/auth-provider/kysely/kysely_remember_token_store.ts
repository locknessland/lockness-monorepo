/**
 * @fileoverview The Kysely implementation of the remember-me storage port
 * (#457). Internal: `KyselySessionProvider` builds it from its options; it is
 * not re-exported from any entry point.
 *
 * Kysely has no table object, so the column names are fixed by the
 * framework and the application's DDL must match them:
 *
 * | Column            | Holds                                        |
 * | :---------------- | :------------------------------------------- |
 * | `id`              | primary key                                  |
 * | `user_id`         | the owner's id                               |
 * | `token_hash`      | SHA-256 of the plaintext, hex — **unique**   |
 * | `expires_at`      | timestamp, NOT NULL                          |
 * | `first_issued_at` | timestamp, NOT NULL — the renewal origin     |
 * | `created_at`      | timestamp, NOT NULL                          |
 *
 * @module
 * @internal
 */

import type {
    NewStoredRememberToken,
    RememberTokenStore,
    StoredRememberToken,
} from '../base/session_provider_base.ts'
import type { KyselyDatabase } from './kysely_session_provider.ts'

/** The columns the store selects, in one place. */
const COLUMNS = [
    'id',
    'user_id',
    'token_hash',
    'expires_at',
    'first_issued_at',
    'created_at',
] as const

/** A row as the driver hands it back, before translation. */
type RawRow = Readonly<Record<(typeof COLUMNS)[number], unknown>>

/**
 * Stores remember-me tokens in a Kysely table named by the application.
 *
 * No `.returning()`: an insert is followed by a re-select on the unique
 * `token_hash`, which every dialect supports. `findByHash` carries no
 * `expires_at` predicate — the base decides expiry. Both deletes are scoped by
 * `user_id`. Timestamps a driver returns as strings or numbers are turned into
 * `Date` here, at the edge, because the base reads a non-Date expiry as
 * expired (sqlite would otherwise never verify).
 */
export class KyselyRememberTokenStore implements RememberTokenStore {
    /** Resolves the handle; called once per operation, never at construction. */
    readonly #db: () => KyselyDatabase
    /** The table name, already checked by the caller. */
    readonly #table: string

    /**
     * @param db - The provider's `db` resolver. Not called here (#427).
     * @param table - A non-empty table name.
     */
    constructor(db: () => KyselyDatabase, table: string) {
        this.#db = db
        this.#table = table
    }

    /**
     * Insert the row, then read it back by its unique hash.
     *
     * @param record - The row to store.
     * @returns The stored row.
     * @throws {Error} When the row cannot be read back.
     */
    async insert(record: NewStoredRememberToken): Promise<StoredRememberToken> {
        await this.#db()
            .insertInto(this.#table)
            .values({
                user_id: record.userId,
                token_hash: record.hash,
                expires_at: record.expiresAt,
                first_issued_at: record.firstIssuedAt,
                created_at: record.createdAt,
            })
            .execute()
        const stored = await this.findByHash(record.hash)
        if (!stored) {
            throw new Error(
                'The remember-me token was inserted but could not be read back',
            )
        }
        return stored
    }

    /**
     * @param hash - The hash to match.
     * @returns The matching row, translated, or `null`.
     */
    async findByHash(hash: string): Promise<StoredRememberToken | null> {
        const row: RawRow | undefined = await this.#db()
            .selectFrom(this.#table)
            .select([...COLUMNS])
            .where('token_hash', '=', hash)
            .executeTakeFirst()
        return row ? toStored(row) : null
    }

    /**
     * @param userId - The owner the deletion is scoped by.
     * @param tokenId - The row id.
     */
    async delete(
        userId: string | number,
        tokenId: string | number,
    ): Promise<void> {
        await this.#db()
            .deleteFrom(this.#table)
            .where('id', '=', tokenId)
            .where('user_id', '=', userId)
            .execute()
    }

    /**
     * @param userId - The owner.
     */
    async deleteAllForUser(userId: string | number): Promise<void> {
        await this.#db()
            .deleteFrom(this.#table)
            .where('user_id', '=', userId)
            .execute()
    }
}

/** The port's view of a driver row. */
function toStored(row: RawRow): StoredRememberToken {
    return {
        id: row.id as StoredRememberToken['id'],
        userId: row.user_id as StoredRememberToken['userId'],
        hash: String(row.token_hash),
        expiresAt: toDate(row.expires_at),
        firstIssuedAt: toDate(row.first_issued_at),
        // Only reported, never decided on: an unreadable value stays Invalid.
        createdAt: toDate(row.created_at) ?? new Date(Number.NaN),
    }
}

/**
 * A driver timestamp as a `Date`. A string is parsed; a number is read as
 * epoch milliseconds. Anything else is `null`, which the base denies.
 */
function toDate(value: unknown): Date | null {
    if (value instanceof Date) return value
    if (typeof value === 'string' || typeof value === 'number') {
        return new Date(value)
    }
    return null
}
