/**
 * @fileoverview Token-based (API) authentication provider using Drizzle ORM.
 *
 * {@link TokenProviderBase} owns the token lifecycle; this class supplies its
 * five storage steps against the access-tokens table the application passes
 * in `tokensTable`. Users stay the application's: they are found through the
 * two callbacks, because the provider cannot know a users schema.
 *
 * @module @lockness/auth-provider/drizzle/token
 */

import type { Authenticatable } from '@lockness/auth'
// Hard-rule-#2 exception: drizzle-orm is not published on JSR. The range
// matches `@lockness/drizzle` and the kits, so an app resolves one copy.
import { and, eq } from 'drizzle-orm'
import {
    type NewStoredAccessToken,
    type StoredAccessToken,
    TokenProviderBase,
} from '../base/token_provider_base.ts'
import { assertDbResolver } from '../base/assert_db_resolver.ts'
import type { DrizzleDatabase, DrizzleDialect } from './database.ts'
import { asQueryHandle, type QueryHandle } from './query_handle.ts'
import {
    assertAccessTokensTable,
    type DrizzleAccessTokensTable,
} from './access_tokens_table.ts'

/**
 * Configuration options for Drizzle token user provider.
 *
 * @typeParam User - The user entity type extending {@link Authenticatable}
 * @typeParam D - The SQL dialect of the Drizzle handle (`pg` by default), so a
 * `mysql` or `sqlite` `Database` handle from the #214 multi-DB work is accepted.
 */
export interface DrizzleTokenProviderOptions<
    User extends Authenticatable,
    D extends DrizzleDialect = 'pg',
> {
    /**
     * Returns the Drizzle database instance (from the @lockness/drizzle
     * `Database` service), typed by dialect `D`. Called on every lookup, never
     * at construction: a provider built per request touches nothing until a
     * lookup runs, and follows a reconnect instead of holding a closed client.
     *
     * @example db: () => container.get<Database>(Database).db
     */
    db: () => DrizzleDatabase<D>

    /**
     * Function to find user by ID
     */
    findUserById: (
        db: DrizzleDatabase<D>,
        id: string | number,
    ) => Promise<User | null>

    /**
     * Function to find user by credentials
     */
    findUserByCredentials: (
        db: DrizzleDatabase<D>,
        email: string,
        password: string,
    ) => Promise<User | null>

    /**
     * The application's access-tokens table — the Drizzle table **object**,
     * not its name. Required: the provider stores and verifies tokens in it.
     * See {@link DrizzleAccessTokensTable} for the columns it must carry.
     */
    tokensTable: DrizzleAccessTokensTable

    /**
     * Token length in random bytes (default: 40, minimum: 16).
     */
    tokenLength?: number
}

/**
 * Drizzle-based user provider for token authentication.
 *
 * @example
 * ```ts
 * import { accessTokens, users } from '@model/user.ts'
 *
 * const provider = new DrizzleTokenProvider({
 *   db: () => database.db,
 *   tokensTable: accessTokens,
 *   findUserById: async (db, id) => {
 *     const [row] = await db.select().from(users)
 *       .where(eq(users.id, Number(id))).limit(1)
 *     return row ?? null
 *   },
 *   findUserByCredentials: async (db, email, password) => {
 *     const [row] = await db.select().from(users)
 *       .where(eq(users.email, email)).limit(1)
 *     return row && await verifyPassword(password, row.password) ? row : null
 *   },
 * })
 * ```
 */
export class DrizzleTokenProvider<
    User extends Authenticatable,
    D extends DrizzleDialect = 'pg',
> extends TokenProviderBase<User> {
    /** @internal Provider configuration */
    readonly #options: DrizzleTokenProviderOptions<User, D>

    /** @internal The tokens table, checked at construction. */
    readonly #table: DrizzleAccessTokensTable

    /**
     * @param options - Provider configuration.
     * @throws {TypeError} When `db` is not a function, or when `tokensTable`
     * is not a Drizzle table carrying every column property of
     * {@link DrizzleAccessTokensTable}.
     * @throws {RangeError} When `tokenLength` is below 16 bytes.
     */
    constructor(options: DrizzleTokenProviderOptions<User, D>) {
        super({ tokenLength: options.tokenLength })
        assertDbResolver(options.db)
        assertAccessTokensTable(options.tokensTable)
        this.#options = options
        this.#table = options.tokensTable
    }

    /**
     * @internal The handle, resolved afresh on every storage step and seen
     * through the builder subset it uses — never cached, so a reconnect is
     * followed and a provider built without a connection touches nothing.
     */
    get #query(): QueryHandle<NewStoredAccessToken, StoredAccessToken> {
        return asQueryHandle(this.#options.db())
    }

    /**
     * Find user by ID.
     *
     * @param id - The user id.
     * @returns The user, or `null`.
     */
    async findById(id: string | number): Promise<User | null> {
        return await this.#options.findUserById(this.#options.db(), id)
    }

    /**
     * Find user by credentials.
     *
     * @param email - The submitted email.
     * @param password - The submitted password.
     * @returns The user, or `null`.
     */
    async findByCredentials(
        email: string,
        password: string,
    ): Promise<User | null> {
        return await this.#options.findUserByCredentials(
            this.#options.db(),
            email,
            password,
        )
    }

    /**
     * Insert the row, then read it back by its unique hash — the portable
     * way to learn the generated id when mysql has no `RETURNING`.
     *
     * @param record - The row to store.
     * @returns The stored row.
     * @throws {Error} When the row cannot be read back.
     */
    protected async insertTokenRecord(
        record: NewStoredAccessToken,
    ): Promise<StoredAccessToken> {
        await this.#query.insert(this.#table).values(record)
        const stored = await this.findTokenRecordByHash(record.hash)
        if (!stored) {
            throw new Error(
                'The access token was inserted but could not be read back',
            )
        }
        return stored
    }

    /**
     * @param hash - The hash to match.
     * @returns The matching row, or `null`.
     */
    protected async findTokenRecordByHash(
        hash: string,
    ): Promise<StoredAccessToken | null> {
        const t = this.#table
        const rows = await this.#query
            .select({
                id: t.id,
                userId: t.userId,
                name: t.name,
                hash: t.hash,
                expiresAt: t.expiresAt,
                lastUsedAt: t.lastUsedAt,
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
    protected async deleteTokenRecord(
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
    protected async deleteTokenRecordsForUser(
        userId: string | number,
    ): Promise<void> {
        const t = this.#table
        await this.#query.delete(t).where(eq(t.userId, userId))
    }

    /**
     * @param tokenId - The row id.
     * @param at - The time of use.
     */
    protected async touchTokenRecord(
        tokenId: string | number,
        at: Date,
    ): Promise<void> {
        const t = this.#table
        await this.#query.update(t).set({ lastUsedAt: at })
            .where(eq(t.id, tokenId))
    }
}
