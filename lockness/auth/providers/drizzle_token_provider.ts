/**
 * @lockness/auth - Drizzle User Provider for Token Guard
 * 
 * User provider for API token authentication using Drizzle ORM.
 */

import { sql } from 'drizzle-orm'
import type { Database } from '@lockness/drizzle'
import type {
    Authenticatable,
    AccessToken,
    TokenUserProviderContract,
    PROVIDER_REAL_USER,
} from '../types.ts'

/**
 * Options for Drizzle Token User Provider
 */
export interface DrizzleTokenProviderOptions<User extends Authenticatable> {
    /**
     * Database instance
     */
    db: Database

    /**
     * Function to find user by ID
     */
    findUserById: (db: Database, id: string | number) => Promise<User | null>

    /**
     * Function to find user by credentials
     */
    findUserByCredentials: (
        db: Database,
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
    implements TokenUserProviderContract<User> {
    /**
     * Symbol to access real user type
     */
    declare [PROVIDER_REAL_USER]: User

    #options: Required<DrizzleTokenProviderOptions<User>>

    constructor(options: DrizzleTokenProviderOptions<User>) {
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
    async findByCredentials(email: string, password: string): Promise<User | null> {
        return await this.#options.findUserByCredentials(this.#options.db, email, password)
    }

    /**
     * Create an access token for a user
     */
    async createToken(
        user: User,
        name: string,
        expiresIn?: number,
    ): Promise<AccessToken> {
        const db = this.#options.db
        const table = this.#options.tokensTable

        // Generate secure random token
        const tokenValue = this.#generateToken()
        const tokenHash = await this.#hashToken(tokenValue)
        const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null

        // Insert token into database
        const result = await db.db.execute(sql`
            INSERT INTO ${sql.identifier(table)} (user_id, name, token_hash, expires_at, created_at, last_used_at)
            VALUES (${user.id}, ${name}, ${tokenHash}, ${expiresAt}, NOW(), NOW())
            RETURNING id, user_id, name, token_hash, expires_at, created_at, last_used_at
        `)

        const row = result[0] as any

        return {
            identifier: row.id,
            name: row.name,
            value: tokenValue,
            hash: row.token_hash,
            userId: row.user_id,
            expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
            createdAt: new Date(row.created_at),
            lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : undefined,
        }
    }

    /**
     * Verify an access token and return user + token info
     */
    async verifyToken(
        tokenValue: string,
    ): Promise<{ user: User; token: AccessToken } | null> {
        const db = this.#options.db
        const table = this.#options.tokensTable
        const tokenHash = await this.#hashToken(tokenValue)

        // Find token in database
        const result = await db.db.execute(sql`
            SELECT id, user_id, name, token_hash, expires_at, created_at, last_used_at
            FROM ${sql.identifier(table)}
            WHERE token_hash = ${tokenHash} AND (expires_at IS NULL OR expires_at > NOW())
        `)

        if (result.length === 0) {
            return null
        }

        const row = result[0] as any

        // Update last used timestamp
        await db.db.execute(sql`
            UPDATE ${sql.identifier(table)}
            SET last_used_at = NOW()
            WHERE id = ${row.id}
        `)

        // Find user
        const user = await this.findById(row.user_id)
        if (!user) {
            return null
        }

        const token: AccessToken = {
            identifier: row.id,
            name: row.name,
            value: tokenValue,
            hash: row.token_hash,
            userId: row.user_id,
            expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
            createdAt: new Date(row.created_at),
            lastUsedAt: new Date(), // Just updated
        }

        return { user, token }
    }

    /**
     * Delete a specific token
     */
    async deleteToken(user: User, tokenId: string | number): Promise<void> {
        const db = this.#options.db
        const table = this.#options.tokensTable

        await db.db.execute(sql`
            DELETE FROM ${sql.identifier(table)}
            WHERE id = ${tokenId} AND user_id = ${user.id}
        `)
    }

    /**
     * Delete all tokens for a user (logout from all devices)
     */
    async deleteAllTokens(user: User): Promise<void> {
        const db = this.#options.db
        const table = this.#options.tokensTable

        await db.db.execute(sql`
            DELETE FROM ${sql.identifier(table)}
            WHERE user_id = ${user.id}
        `)
    }

    /**
     * Generate a cryptographically secure random token
     */
    #generateToken(): string {
        const array = new Uint8Array(this.#options.tokenLength)
        crypto.getRandomValues(array)
        return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('')
    }

    /**
     * Hash a token using SHA-256
     */
    async #hashToken(token: string): Promise<string> {
        const encoder = new TextEncoder()
        const data = encoder.encode(token)
        const hashBuffer = await crypto.subtle.digest('SHA-256', data)
        const hashArray = Array.from(new Uint8Array(hashBuffer))
        return hashArray.map((byte) => byte.toString(16).padStart(2, '0')).join('')
    }
}
