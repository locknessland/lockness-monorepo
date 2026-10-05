/**
 * @fileoverview Session-based authentication provider using Drizzle ORM.
 *
 * Extends {@link SessionProviderBase}, which owns the remember-me lifecycle;
 * this class supplies the user lookups and, when the application passes its
 * `rememberTokensTable`, the Drizzle store remember-me tokens live in.
 *
 * @module @lockness/auth-provider/drizzle/session
 */

import type { Authenticatable } from '@lockness/auth'
import { assertDbResolver } from '../base/assert_db_resolver.ts'
import {
    type RememberTokenStore,
    SessionProviderBase,
} from '../base/session_provider_base.ts'
import type { DrizzleDatabase, DrizzleDialect } from './database.ts'
import { DrizzleRememberTokenStore } from './drizzle_remember_token_store.ts'
import {
    assertRememberTokensTable,
    type DrizzleRememberTokensTable,
} from './remember_tokens_table.ts'

/**
 * Configuration options for Drizzle session user provider.
 *
 * @typeParam User - The user entity type extending {@link Authenticatable}
 * @typeParam D - The SQL dialect of the Drizzle handle (`pg` by default), so a
 * `mysql` or `sqlite` `Database` handle from the #214 multi-DB work is accepted.
 */
export interface DrizzleSessionProviderOptions<
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
     * Function to find user by email and verify password
     */
    findUserByCredentials: (
        db: DrizzleDatabase<D>,
        email: string,
        password: string,
    ) => Promise<User | null>

    /**
     * Function to verify password (for custom hashing)
     */
    verifyPassword?: (plain: string, hash: string) => Promise<boolean>

    /**
     * The application's remember-me table — the Drizzle table **object**, not
     * its name. Passing it turns remember-me tokens on; omitting it leaves
     * them off. See {@link DrizzleRememberTokensTable} for the columns it must
     * carry.
     */
    rememberTokensTable?: DrizzleRememberTokensTable
}

/**
 * Drizzle-based user provider for session authentication
 *
 * @example
 * ```ts
 * import { rememberMeTokens } from '@model/user.ts'
 *
 * const provider = new DrizzleSessionProvider({
 *   db: () => database.db,
 *   rememberTokensTable: rememberMeTokens,
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
export class DrizzleSessionProvider<
    User extends Authenticatable,
    D extends DrizzleDialect = 'pg',
> extends SessionProviderBase<User> {
    /** @internal Provider configuration */
    readonly #options: DrizzleSessionProviderOptions<User, D>
    /** @internal Password verification: the option, or the base default. */
    readonly #verifyPassword: (plain: string, hash: string) => Promise<boolean>

    /**
     * @param options - Provider configuration.
     * @throws {TypeError} When `db` is not a function; when
     * `rememberTokensTable` is present but is not a Drizzle table carrying
     * every column property of {@link DrizzleRememberTokensTable}; or when
     * the removed `enableRememberTokens` option is present.
     */
    constructor(options: DrizzleSessionProviderOptions<User, D>) {
        super({ rememberTokens: rememberTokenStore(options) })
        this.#options = options
        this.#verifyPassword = options.verifyPassword ??
            this.defaultVerifyPassword.bind(this)
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
     * Verify password hash.
     *
     * @param plain - The submitted password.
     * @param hash - The stored hash.
     * @returns Whether they match.
     */
    async verifyPassword(plain: string, hash: string): Promise<boolean> {
        return await this.#verifyPassword(plain, hash)
    }
}

/**
 * Check the options and build the remember-me store they ask for, if any.
 * Runs before `super()`, so it cannot touch the instance — and it never calls
 * `db` (#427).
 *
 * @throws {TypeError} See the provider's constructor.
 */
function rememberTokenStore<
    User extends Authenticatable,
    D extends DrizzleDialect,
>(
    options: DrizzleSessionProviderOptions<User, D>,
): RememberTokenStore | undefined {
    assertDbResolver(options.db)
    // Removed in v0.5.0 and refused for one release, so that an old
    // configuration is never silently ignored. Drop this check in v0.6.0.
    if ('enableRememberTokens' in options) {
        throw new TypeError(
            'enableRememberTokens was removed in v0.5.0: pass rememberTokensTable (your Drizzle table object) to turn remember-me tokens on, or omit it to leave them off',
        )
    }
    const table: unknown = options.rememberTokensTable
    if (table === undefined) return undefined
    assertRememberTokensTable(table)
    return new DrizzleRememberTokenStore(options.db, table)
}
