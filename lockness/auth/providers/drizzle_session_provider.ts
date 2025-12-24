/**
 * @lockness/auth - Drizzle User Provider for Session Guard
 * 
 * User provider that uses Drizzle ORM to find users and manage remember me tokens.
 */

import { sql } from 'drizzle-orm'
import type { Database } from '@lockness/drizzle'
import type {
    Authenticatable,
    RememberMeToken,
    SessionUserProviderContract,
    SessionWithRememberMeProviderContract,
    PROVIDER_REAL_USER,
} from '../types.ts'

/**
 * Options for Drizzle Session User Provider
 */
export interface DrizzleSessionProviderOptions<User extends Authenticatable> {
    /**
     * Database instance
     */
    db: Database

    /**
     * Function to find user by ID
     */
    findUserById: (db: Database, id: string | number) => Promise<User | null>

    /**
     * Function to find user by email and verify password
     */
    findUserByCredentials: (
        db: Database,
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
    implements
    SessionUserProviderContract<User>,
    SessionWithRememberMeProviderContract<User> {
    /**
     * Symbol to access real user type
     */
    declare [PROVIDER_REAL_USER]: User

    #options: Required<DrizzleSessionProviderOptions<User>>

    constructor(options: DrizzleSessionProviderOptions<User>) {
        this.#options = {
            ...options,
            verifyPassword: options.verifyPassword ?? this.#defaultVerifyPassword,
            enableRememberTokens: options.enableRememberTokens ?? false,
            rememberTokensTable: options.rememberTokensTable ?? 'remember_me_tokens',
        }
    }

    /**
     * Default password verification (direct comparison - not secure for production)
     */
    async #defaultVerifyPassword(plain: string, hash: string): Promise<boolean> {
        return plain === hash
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
     * Verify password
     */
    async verifyPassword(plain: string, hash: string): Promise<boolean> {
        return await this.#options.verifyPassword(plain, hash)
    }

    /**
     * Create a remember me token
     */
    async createRememberToken(user: User, expiresIn: number): Promise<RememberMeToken> {
        if (!this.#options.enableRememberTokens) {
            throw new Error('Remember me tokens are not enabled')
        }

        const db = this.#options.db
        const table = this.#options.rememberTokensTable

        // Generate secure random token
        const tokenValue = this.#generateToken()
        const tokenHash = await this.#hashToken(tokenValue)
        const expiresAt = new Date(Date.now() + expiresIn * 1000)

        // Insert token into database
        const result = await db.db.execute(sql`
            INSERT INTO ${sql.identifier(table)} (user_id, token_hash, expires_at, created_at, updated_at)
            VALUES (${user.id}, ${tokenHash}, ${expiresAt}, NOW(), NOW())
            RETURNING id, user_id, token_hash, expires_at, created_at, updated_at
        `)

        const row = result[0] as any

        return {
            identifier: row.id,
            value: tokenValue,
            hash: tokenHash,
            userId: user.id,
            expiresAt: new Date(row.expires_at),
            createdAt: new Date(row.created_at),
            updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
        }
    }

    /**
     * Verify a remember me token
     */
    async verifyRememberToken(
        tokenValue: string,
    ): Promise<{ user: User; token: RememberMeToken } | null> {
        if (!this.#options.enableRememberTokens) {
            return null
        }

        const db = this.#options.db
        const table = this.#options.rememberTokensTable
        const tokenHash = await this.#hashToken(tokenValue)

        // Find token in database
        const result = await db.db.execute(sql`
            SELECT id, user_id, token_hash, expires_at, created_at, updated_at
            FROM ${sql.identifier(table)}
            WHERE token_hash = ${tokenHash} AND expires_at > NOW()
        `)

        if (result.length === 0) {
            return null
        }

        const row = result[0] as any

        // Find user
        const user = await this.findById(row.user_id)
        if (!user) {
            return null
        }

        const token: RememberMeToken = {
            identifier: row.id,
            value: tokenValue,
            hash: row.token_hash,
            userId: row.user_id,
            expiresAt: new Date(row.expires_at),
            createdAt: new Date(row.created_at),
            updatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
        }

        return { user, token }
    }

    /**
     * Delete a remember me token
     */
    async deleteRememberToken(user: User, tokenId: string | number): Promise<void> {
        if (!this.#options.enableRememberTokens) {
            return
        }

        const db = this.#options.db
        const table = this.#options.rememberTokensTable

        await db.db.execute(sql`
            DELETE FROM ${sql.identifier(table)}
            WHERE id = ${tokenId} AND user_id = ${user.id}
        `)
    }

    /**
     * Recycle a remember me token (security feature)
     */
    async recycleRememberToken(
        user: User,
        tokenId: string | number,
        expiresIn: number,
    ): Promise<RememberMeToken> {
        if (!this.#options.enableRememberTokens) {
            throw new Error('Remember me tokens are not enabled')
        }

        // Delete old token
        await this.deleteRememberToken(user, tokenId)

        // Create new token
        return await this.createRememberToken(user, expiresIn)
    }

    /**
     * Generate a cryptographically secure random token
     */
    #generateToken(): string {
        const array = new Uint8Array(40) // 40 bytes = 80 hex characters
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
