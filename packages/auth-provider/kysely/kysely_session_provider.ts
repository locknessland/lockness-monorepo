/**
 * @fileoverview Session-based authentication provider using Kysely ORM.
 *
 * Extends {@link SessionProviderBase}, which owns the remember-me lifecycle;
 * this class supplies the user lookups and, when the application names its
 * `rememberTokensTable`, the Kysely store remember-me tokens live in.
 *
 * Note: Kysely is an optional peer dependency.
 * Install it separately: `deno add npm:kysely`
 *
 * @module @lockness/auth-provider/kysely/session
 *
 * @example
 * ```ts
 * import { Kysely, PostgresDialect } from 'kysely'
 * import { KyselySessionProvider } from '@lockness/auth-provider/kysely'
 *
 * const db = new Kysely({
 *   dialect: new PostgresDialect({ pool: new Pool(...) })
 * })
 *
 * const provider = new KyselySessionProvider({
 *   db: () => db,
 *   findUserById: async (db, id) => {
 *     return await db.selectFrom('users')
 *       .selectAll()
 *       .where('id', '=', id)
 *       .executeTakeFirst()
 *   },
 *   findUserByCredentials: async (db, email, password) => {
 *     const user = await db.selectFrom('users')
 *       .selectAll()
 *       .where('email', '=', email)
 *       .executeTakeFirst()
 *     if (user && await bcrypt.compare(password, user.password)) {
 *       return user
 *     }
 *     return null
 *   },
 *   rememberTokensTable: 'remember_me_tokens',
 * })
 * ```
 */

import type { Authenticatable } from '@lockness/auth'
import { assertDbResolver } from '../base/assert_db_resolver.ts'
import {
    type RememberTokenStore,
    SessionProviderBase,
} from '../base/session_provider_base.ts'
import { KyselyRememberTokenStore } from './kysely_remember_token_store.ts'

/**
 * Kysely database instance type.
 *
 * Uses `any` because Kysely is an optional peer dependency. The actual type
 * is `Kysely<Database>` where Database is your schema type.
 *
 * Users should cast to their specific `Kysely<Database>` type in callbacks
 * for full type safety.
 *
 * @remarks
 * We use `any` here intentionally as a trade-off between:
 * - Avoiding a hard dependency on Kysely
 * - Allowing the internal implementation to call Kysely methods
 * - Letting users provide properly typed callbacks
 */
// deno-lint-ignore no-explicit-any
export type KyselyDatabase = any

/**
 * Configuration options for Kysely session user provider.
 *
 * Note: Uses {@link KyselyDatabase} type for db parameter to avoid Kysely peer dependency.
 * In your implementation, you can use the full `Kysely<Database>` type.
 *
 * @typeParam User - The user entity type extending {@link Authenticatable}
 */
export interface KyselySessionProviderOptions<User extends Authenticatable> {
    /**
     * Returns the Kysely database instance. Called on every lookup, never at
     * construction: a provider built per request touches nothing until a
     * lookup runs, and follows a reconnect instead of holding a closed client.
     * Uses {@link KyselyDatabase} type - cast to your specific `Kysely<Database>` in callbacks.
     *
     * @example db: () => kysely
     */
    db: () => KyselyDatabase

    /**
     * Function to find user by ID.
     * @param db - The Kysely database instance
     * @param id - The user's unique identifier
     * @returns The user or null if not found
     */
    findUserById: (
        db: KyselyDatabase,
        id: string | number,
    ) => Promise<User | null>

    /**
     * Function to find user by email and verify password.
     * @param db - The Kysely database instance
     * @param email - The user's email address
     * @param password - The plain text password to verify
     * @returns The user if credentials are valid, null otherwise
     */
    findUserByCredentials: (
        db: KyselyDatabase,
        email: string,
        password: string,
    ) => Promise<User | null>

    /**
     * Function to verify password (for custom hashing)
     */
    verifyPassword?: (plain: string, hash: string) => Promise<boolean>

    /**
     * The name of the remember-me table. Passing it turns remember-me tokens
     * on; omitting it leaves them off. Its columns are fixed: `id`,
     * `user_id`, `token_hash` (unique), `expires_at`, `first_issued_at` and
     * `created_at`, the last three NOT NULL timestamps.
     */
    rememberTokensTable?: string
}

/**
 * Kysely-based user provider for session authentication.
 *
 * @typeParam User - The user entity type extending {@link Authenticatable}
 *
 * @example
 * ```ts
 * const provider = new KyselySessionProvider<User>({
 *   db: () => db,
 *   rememberTokensTable: 'remember_me_tokens',
 *   findUserById: async (db, id) => {
 *     const kysely = db as Kysely<Database>
 *     return await kysely.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirst()
 *   },
 *   findUserByCredentials: async (db, email, password) => { ... }
 * })
 * ```
 */
export class KyselySessionProvider<User extends Authenticatable>
    extends SessionProviderBase<User> {
    /** @internal Provider configuration */
    readonly #options: KyselySessionProviderOptions<User>
    /** @internal Password verification: the option, or the base default. */
    readonly #verifyPassword: (plain: string, hash: string) => Promise<boolean>

    /**
     * @param options - Provider configuration.
     * @throws {TypeError} When `db` is not a function; when
     * `rememberTokensTable` is present but is not a non-empty string; or when
     * the removed `enableRememberTokens` option is present.
     */
    constructor(options: KyselySessionProviderOptions<User>) {
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
function rememberTokenStore<User extends Authenticatable>(
    options: KyselySessionProviderOptions<User>,
): RememberTokenStore | undefined {
    assertDbResolver(options.db)
    // Removed in v0.5.0 and refused for one release, so that an old
    // configuration is never silently ignored. Drop this check in v0.6.0.
    if ('enableRememberTokens' in options) {
        throw new TypeError(
            "enableRememberTokens was removed in v0.5.0: pass rememberTokensTable (your table's name) to turn remember-me tokens on, or omit it to leave them off",
        )
    }
    const table: unknown = options.rememberTokensTable
    if (table === undefined) return undefined
    if (typeof table !== 'string' || table === '') {
        throw new TypeError(
            `rememberTokensTable must be a non-empty table name, got ${
                table === '' ? 'an empty string' : describe(table)
            }`,
        )
    }
    return new KyselyRememberTokenStore(options.db, table)
}

/** A short, value-free description of a rejected argument. */
function describe(value: unknown): string {
    return value === null ? 'null' : typeof value
}
