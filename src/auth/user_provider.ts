/**
 * User Provider for Lockness Auth
 * 
 * Implements SessionUserProviderContract using Drizzle ORM
 */

import type { Database } from '@lockness/drizzle'
import { eq } from 'drizzle-orm'
import { users } from '@model/user.ts'
import type {
    Authenticatable,
    SessionUserProviderContract,
    SessionWithRememberMeProviderContract,
    RememberMeToken,
    PROVIDER_REAL_USER,
} from '@lockness/auth'
import { hashPassword, verifyPassword } from 'lockness'

/**
 * User type matching our database schema
 */
export interface User extends Authenticatable {
    id: number
    email: string
    password: string
    name: string
    createdAt: Date
    updatedAt: Date
}

/**
 * User provider for session-based authentication
 */
export class UserProvider implements SessionWithRememberMeProviderContract<User> {
    declare [PROVIDER_REAL_USER]: User

    constructor(private db: Database) { }

    async findById(id: string | number): Promise<User | null> {
        const result = await this.db.db
            .select()
            .from(users)
            .where(eq(users.id, Number(id)))
            .limit(1)

        return result[0] as User || null
    }

    async findByCredentials(email: string, password: string): Promise<User | null> {
        const result = await this.db.db
            .select()
            .from(users)
            .where(eq(users.email, email))
            .limit(1)

        const user = result[0] as User | undefined

        if (!user) {
            return null
        }

        const isValid = await verifyPassword(password, user.password)
        if (!isValid) {
            return null
        }

        return user
    }

    async verifyPassword(plain: string, hash: string): Promise<boolean> {
        return await verifyPassword(plain, hash)
    }

    // Remember Me Token Methods
    async createRememberToken(user: User, expiresIn: number): Promise<RememberMeToken> {
        // Use DrizzleSessionProvider helper or implement custom logic
        const token = crypto.randomUUID()
        const tokenHash = await this.hashToken(token)
        const expiresAt = new Date(Date.now() + expiresIn * 1000)

        // Insert into remember_me_tokens table
        // TODO: Add schema for remember_me_tokens if not exists

        return {
            identifier: user.id,
            hash: tokenHash,
            userId: user.id,
            expiresAt,
            createdAt: new Date(),
            value: token,
        }
    }

    async verifyRememberToken(tokenValue: string) {
        // Verify token from database
        // TODO: Implement with remember_me_tokens table
        return null
    }

    async recycleRememberToken(user: User, tokenId: string | number, expiresIn: number): Promise<RememberMeToken> {
        // Recycle (delete old, create new) for security
        // TODO: Implement
        const token = crypto.randomUUID()
        const tokenHash = await this.hashToken(token)
        const expiresAt = new Date(Date.now() + expiresIn * 1000)

        return {
            identifier: user.id,
            hash: tokenHash,
            userId: user.id,
            expiresAt,
            createdAt: new Date(),
            value: token,
        }
    }

    async deleteRememberToken(user: User, tokenId: string | number) {
        // Delete token from database
        // TODO: Implement
    }

    private async hashToken(token: string): Promise<string> {
        const encoder = new TextEncoder()
        const data = encoder.encode(token)
        const hashBuffer = await crypto.subtle.digest('SHA-256', data)
        const hashArray = Array.from(new Uint8Array(hashBuffer))
        return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
    }
}
