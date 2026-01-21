/**
 * @fileoverview Session-based authentication provider using Kysely ORM.
 *
 * Extends {@link SessionProviderBase} to inherit shared token and password logic.
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
 *   db,
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
 *   enableRememberTokens: true
 * })
 * ```
 */

import type { Authenticatable, RememberMeToken } from '@lockness/auth'
import { SessionProviderBase } from '../base/session_provider_base.ts'

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
     * Kysely database instance.
     * Uses {@link KyselyDatabase} type - cast to your specific `Kysely<Database>` in callbacks.
     */
    db: KyselyDatabase

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
     * Whether to enable remember me tokens
     */
    enableRememberTokens?: boolean

    /**
     * Table name for remember tokens (default: 'remember_me_tokens')
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
 *   db,
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
    readonly #options: Required<KyselySessionProviderOptions<User>>
    /** @internal Whether remember tokens are enabled */
    readonly #enableRememberTokens: boolean

    constructor(options: KyselySessionProviderOptions<User>) {
        super()
        this.#options = {
            ...options,
            verifyPassword: options.verifyPassword ??
                this.defaultVerifyPassword.bind(this),
            enableRememberTokens: options.enableRememberTokens ?? false,
            rememberTokensTable: options.rememberTokensTable ??
                'remember_me_tokens',
        }
        this.#enableRememberTokens = this.#options.enableRememberTokens
    }

    /**
     * Find user by ID
     */
    async findById(id: string | number): Promise<User | null> {
        return await this.#options.findUserById(this.#options.db, id)
    }

    /**
     * Find user by credentials
     */
    async findByCredentials(
        email: string,
        password: string,
    ): Promise<User | null> {
        return await this.#options.findUserByCredentials(
            this.#options.db,
            email,
            password,
        )
    }

    /**
     * Verify password hash
     */
    async verifyPassword(plain: string, hash: string): Promise<boolean> {
        return await this.#options.verifyPassword(plain, hash)
    }

    /**
     * Create a remember me token for a user
     */
    async createRememberToken(
        user: User,
        expiresIn: number,
    ): Promise<RememberMeToken> {
        if (!this.#enableRememberTokens) {
            throw new Error(
                'Remember tokens are not enabled for this provider',
            )
        }

        const tokenValue = await this.generateTokenValue(32)
        const hash = await this.hashTokenValue(tokenValue)
        const expiresAt = new Date(Date.now() + expiresIn)

        const result = await this.#options.db
            .insertInto(this.#options.rememberTokensTable)
            .values({
                user_id: user.id,
                token_hash: hash,
                expires_at: expiresAt,
                created_at: new Date(),
            })
            .returning('id')
            .executeTakeFirst()

        return {
            identifier: result?.id || tokenValue,
            value: tokenValue,
            hash,
            userId: user.id,
            expiresAt,
            createdAt: new Date(),
        }
    }

    /**
     * Verify a remember me token and return the user
     */
    async verifyRememberToken(
        tokenValue: string,
    ): Promise<{ user: User; token: RememberMeToken } | null> {
        if (!this.#enableRememberTokens) {
            return null
        }

        const hash = await this.hashTokenValue(tokenValue)

        const token = await this.#options.db
            .selectFrom(this.#options.rememberTokensTable)
            .selectAll()
            .where('token_hash', '=', hash)
            .where('expires_at', '>', new Date())
            .executeTakeFirst()

        if (!token) {
            return null
        }

        const user = await this.findById(token.user_id)
        if (!user) return null

        return {
            user,
            token: {
                identifier: token.id,
                value: tokenValue,
                hash,
                userId: user.id,
                expiresAt: token.expires_at,
                createdAt: token.created_at,
            },
        }
    }

    /**
     * Delete a remember me token
     */
    async deleteRememberToken(
        user: User,
        tokenId: string | number,
    ): Promise<void> {
        if (!this.#enableRememberTokens) {
            return
        }

        await this.#options.db
            .deleteFrom(this.#options.rememberTokensTable)
            .where('id', '=', tokenId)
            .where('user_id', '=', user.id)
            .execute()
    }

    /**
     * Recycle a remember me token (for security)
     */
    async recycleRememberToken(
        user: User,
        tokenId: string | number,
        expiresIn: number,
    ): Promise<RememberMeToken> {
        if (!this.#enableRememberTokens) {
            throw new Error(
                'Remember tokens are not enabled for this provider',
            )
        }

        await this.deleteRememberToken(user, tokenId)
        return await this.createRememberToken(user, expiresIn)
    }
}
