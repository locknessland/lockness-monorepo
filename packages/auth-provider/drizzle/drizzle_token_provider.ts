/**
 * @lockness/auth-provider/drizzle - Drizzle Token Provider
 *
 * Token-based (API) authentication provider using Drizzle ORM.
 * Extends TokenProviderBase to inherit shared token generation and hashing logic.
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { AccessToken, Authenticatable } from '@lockness/auth'
import { TokenProviderBase } from '../base/token_provider_base.ts'

/**
 * Options for Drizzle Token User Provider
 */
export interface DrizzleTokenProviderOptions<User extends Authenticatable> {
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

    /**
     * Function to find user by credentials
     */
    findUserByCredentials: (
        db: PostgresJsDatabase<Record<string, unknown>>,
        email: string,
        password: string,
    ) => Promise<User | null>

    /**
     * Table name for access tokens (default: 'access_tokens')
     */
    tokensTable?: string

    /**
     * Token length in bytes (default: 40)
     */
    tokenLength?: number
}

/**
 * Drizzle-based user provider for token authentication
 *
 * @example
 * const provider = new DrizzleTokenProvider({
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
 *   }
 * })
 */
export class DrizzleTokenProvider<User extends Authenticatable>
    extends TokenProviderBase<User> {
    #options: Required<DrizzleTokenProviderOptions<User>>

    constructor(options: DrizzleTokenProviderOptions<User>) {
        super()
        this.#options = {
            ...options,
            tokensTable: options.tokensTable ?? 'access_tokens',
            tokenLength: options.tokenLength ?? 40,
        }
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
     * Create an access token for a user
     * Note: This is a base implementation. Override in subclass with actual table schema.
     */
    async createToken(
        user: User,
        name: string,
        expiresIn: number = 365 * 24 * 60 * 60 * 1000, // 1 year default
    ): Promise<AccessToken> {
        const tokenValue = await this.generateTokenValue(
            this.#options.tokenLength,
        )
        const hash = await this.hashTokenValue(tokenValue)
        const expiresAt = new Date(Date.now() + expiresIn)

        // This is a placeholder - subclasses should implement with their table schema
        // Example: const result = await this.#options.db.insert(accessTokensTable).values({ ... })
        return {
            identifier: `token_${Date.now()}`,
            value: tokenValue,
            hash,
            name,
            userId: user.id,
            expiresAt,
            lastUsedAt: undefined,
            createdAt: new Date(),
        }
    }

    /**
     * Verify an access token and return the user
     * Note: This is a base implementation. Override in subclass with actual table schema.
     */
    async verifyToken(
        tokenValue: string,
    ): Promise<{ user: User; token: AccessToken } | null> {
        const _hash = await this.hashTokenValue(tokenValue)

        // This is a placeholder - subclasses should implement with their table schema
        // Example: const token = await this.#options.db.select().from(accessTokensTable).where(...)
        return null
    }

    /**
     * Delete a token
     * Note: This is a base implementation. Override in subclass with actual table schema.
     */
    async deleteToken(_user: User, _tokenId: string | number): Promise<void> {
        // This is a placeholder - subclasses should implement with their table schema
        // Example: await this.#options.db.delete(accessTokensTable).where(...)
    }

    /**
     * Delete all tokens for a user
     * Note: This is a base implementation. Override in subclass with actual table schema.
     */
    async deleteAllTokens(_user: User): Promise<void> {
        // This is a placeholder - subclasses should implement with their table schema
        // Example: await this.#options.db.delete(accessTokensTable).where(...)
    }
}
