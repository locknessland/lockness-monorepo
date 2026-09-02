/**
 * @fileoverview Session-based authentication provider using Drizzle ORM.
 *
 * Extends {@link SessionProviderBase} to inherit shared token and password logic.
 *
 * @module @lockness/auth-provider/drizzle/session
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { Authenticatable, RememberMeToken } from '@lockness/auth'
import { SessionProviderBase } from '../base/session_provider_base.ts'

/**
 * Configuration options for Drizzle session user provider.
 *
 * @typeParam User - The user entity type extending {@link Authenticatable}
 */
export interface DrizzleSessionProviderOptions<User extends Authenticatable> {
    /**
     * Drizzle database instance (from @lockness/drizzle Database service)
     */
    db: PostgresJsDatabase<Record<string, unknown>>

    /**
     * Function to find user by ID
     */
    findUserById: (
        db: PostgresJsDatabase<Record<string, unknown>>,
        id: string | number,
    ) => Promise<User | null>

    /** \n     * Function to find user by email and verify password
     */
    findUserByCredentials: (
        db: PostgresJsDatabase<Record<string, unknown>>,
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
 * Drizzle-based user provider for session authentication
 *
 * @example
 * const provider = new DrizzleSessionProvider({
 *   db,
 *   findUserById: async (db, id) => {
 *     return await db.query.users.findFirst({
 *       where: (users, { eq }) => eq(users.id, id)
 *     })
 *   },
 *   findUserByCredentials: async (db, email, password) => {
 *     const user = await db.query.users.findFirst({
 *       where: (users, { eq }) => eq(users.email, email)
 *     })
 *     if (user && await bcrypt.compare(password, user.password)) {
 *       return user
 *     }
 *     return null
 *   },
 *   enableRememberTokens: true
 * })
 */
export class DrizzleSessionProvider<User extends Authenticatable>
    extends SessionProviderBase<User> {
    /** @internal Provider configuration */
    readonly #options: Required<DrizzleSessionProviderOptions<User>>
    /** @internal Whether remember tokens are enabled */
    readonly #enableRememberTokens: boolean

    constructor(options: DrizzleSessionProviderOptions<User>) {
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
     * Note: This is a base implementation. Override in subclass with actual table schema.
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
        const now = new Date()
        const expiresAt = new Date(Date.now() + expiresIn)

        // This is a placeholder - subclasses should implement with their table schema
        // Example: await this.#options.db.insert(rememberTokensTable).values({ ... })
        // For now, just return the token structure
        return {
            identifier: tokenValue,
            value: tokenValue,
            hash,
            userId: user.id,
            expiresAt,
            createdAt: now,
            // A freshly created credential's origin is its creation instant (#146).
            firstIssuedAt: now,
        }
    }

    /**
     * Verify a remember me token and return the user
     * Note: This is a base implementation. Override in subclass with actual table schema.
     */
    async verifyRememberToken(
        tokenValue: string,
    ): Promise<{ user: User; token: RememberMeToken } | null> {
        if (!this.#enableRememberTokens) {
            return null
        }

        const _hash = await this.hashTokenValue(tokenValue)

        // This is a placeholder - subclasses should implement with their table schema
        // Example: const token = await this.#options.db.select().from(rememberTokensTable).where(...)
        // For now, return null
        return null
    }

    /**
     * Delete a remember me token
     * Note: This is a base implementation. Override in subclass with actual table schema.
     */
    // deno-lint-ignore require-await
    async deleteRememberToken(
        _user: User,
        _tokenId: string | number,
    ): Promise<void> {
        if (!this.#enableRememberTokens) {
            return
        }

        // This is a placeholder - subclasses should implement with their table schema
        // Example: await this.#options.db.delete(rememberTokensTable).where(...)
    }

    /**
     * Delete every remember-me token for a user (#147).
     *
     * Note: This is a base implementation. Override in a subclass with the actual
     * table schema — e.g. `db.delete(rememberTokensTable).where(eq(userId, u.id))`.
     *
     * @param _user - The token owner whose remember-me credentials to drop.
     */
    // deno-lint-ignore require-await
    async deleteAllRememberTokens(_user: User): Promise<void> {
        if (!this.#enableRememberTokens) {
            return
        }

        // A silent no-op here would reopen the ASVS 7.4.2 remember-me re-mint
        // bypass #147 exists to close — "log out everywhere" would leave the
        // user's tokens live. Force a schema-carrying subclass to override it
        // (unlike the read/create placeholders, this is security-critical).
        throw new Error(
            'deleteAllRememberTokens must be overridden with your remember-me table schema — ' +
                'e.g. db.delete(rememberTokensTable).where(eq(rememberTokensTable.userId, user.id))',
        )
    }

    /**
     * Recycle a remember me token (for security)
     */
    async recycleRememberToken(
        user: User,
        token: RememberMeToken,
        expiresIn: number,
    ): Promise<RememberMeToken> {
        if (!this.#enableRememberTokens) {
            throw new Error(
                'Remember tokens are not enabled for this provider',
            )
        }

        // Delete old token
        await this.deleteRememberToken(user, token.identifier)

        // Create new token, then bare-copy the origin forward so the absolute
        // clock is never reset by renewal (#146). No fallback here — the guard
        // resolved firstIssuedAt before calling.
        const fresh = await this.createRememberToken(user, expiresIn)
        return { ...fresh, firstIssuedAt: token.firstIssuedAt }
    }
}
