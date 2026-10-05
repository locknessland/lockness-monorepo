/**
 * @fileoverview The Drizzle implementation of the remember-me storage port
 * (#457). Internal: `DrizzleSessionProvider` builds it from its options; it is
 * not re-exported from any entry point.
 *
 * @module
 * @internal
 */

// Hard-rule-#2 exception: drizzle-orm is not published on JSR. The range
// matches `@lockness/drizzle` and the kits, so an app resolves one copy.
import { and, eq } from 'drizzle-orm'
import type {
    NewStoredRememberToken,
    RememberTokenStore,
    StoredRememberToken,
} from '../base/session_provider_base.ts'
import { asQueryHandle, type QueryHandle } from './query_handle.ts'
import type { DrizzleRememberTokensTable } from './remember_tokens_table.ts'

/**
 * Stores remember-me tokens in the application's Drizzle table.
 *
 * It uses only the builder subset pg, mysql and sqlite share: an insert is
 * followed by a re-select on the unique hash (mysql has no `RETURNING`).
 * `findByHash` carries no expiry predicate — the base decides expiry. Both
 * deletes are scoped by `userId`.
 */
export class DrizzleRememberTokenStore implements RememberTokenStore {
    /** Resolves the handle; called once per operation, never at construction. */
    readonly #db: () => unknown
    /** The application's table, already checked by the caller. */
    readonly #table: DrizzleRememberTokensTable

    /**
     * @param db - The provider's `db` resolver. Not called here (#427).
     * @param table - A table that passed `assertRememberTokensTable`.
     */
    constructor(db: () => unknown, table: DrizzleRememberTokensTable) {
        this.#db = db
        this.#table = table
    }

    /** The handle, resolved afresh and viewed through the shared subset. */
    get #query(): QueryHandle<NewStoredRememberToken, StoredRememberToken> {
        return asQueryHandle(this.#db())
    }

    /**
     * Insert the row, then read it back by its unique hash.
     *
     * @param record - The row to store.
     * @returns The stored row.
     * @throws {Error} When the row cannot be read back.
     */
    async insert(record: NewStoredRememberToken): Promise<StoredRememberToken> {
        await this.#query.insert(this.#table).values(record)
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
     * @returns The matching row, or `null`.
     */
    async findByHash(hash: string): Promise<StoredRememberToken | null> {
        const t = this.#table
        const rows = await this.#query
            .select({
                id: t.id,
                userId: t.userId,
                hash: t.hash,
                expiresAt: t.expiresAt,
                firstIssuedAt: t.firstIssuedAt,
                createdAt: t.createdAt,
            })
            .from(t)
            .where(eq(t.hash, hash))
            .limit(1)
        return rows[0] ?? null
    }

    /**
     * @param userId - The owner the deletion is scoped by.
     * @param tokenId - The row id.
     */
    async delete(
        userId: string | number,
        tokenId: string | number,
    ): Promise<void> {
        const t = this.#table
        await this.#query.delete(t)
            .where(and(eq(t.id, tokenId), eq(t.userId, userId)))
    }

    /**
     * @param userId - The owner.
     */
    async deleteAllForUser(userId: string | number): Promise<void> {
        const t = this.#table
        await this.#query.delete(t).where(eq(t.userId, userId))
    }
}
