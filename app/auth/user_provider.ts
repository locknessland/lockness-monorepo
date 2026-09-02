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
    PROVIDER_REAL_USER,
    RememberMeToken,
    SessionWithRememberMeProviderContract,
} from '@lockness/auth'
import { verifyPassword } from '@lockness/auth'

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
export class UserProvider
    implements SessionWithRememberMeProviderContract<User> {
    declare [PROVIDER_REAL_USER]: User

    constructor(private db: Database) {}

    async findById(id: string | number): Promise<User | null> {
        const result = await this.db.db
            .select()
            .from(users)
            .where(eq(users.id, Number(id)))
            .limit(1)

        return result[0] as User || null
    }

    async findByCredentials(
        email: string,
        password: string,
    ): Promise<User | null> {
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
    async createRememberToken(
        user: User,
        expiresIn: number,
    ): Promise<RememberMeToken> {
        // Use DrizzleSessionProvider helper or implement custom logic
        const token = crypto.randomUUID()
        const tokenHash = await this.hashToken(token)
        const now = new Date()
        const expiresAt = new Date(Date.now() + expiresIn * 1000)

        // Insert into remember_me_tokens table
        // TODO: Add schema for remember_me_tokens if not exists

        return {
            identifier: user.id,
            hash: tokenHash,
            userId: user.id,
            expiresAt,
            createdAt: now,
            // A freshly created credential's origin is its creation instant (#146).
            firstIssuedAt: now,
            value: token,
        }
    }

    verifyRememberToken(
        _tokenValue: string,
    ): Promise<
        { user: User; token: import('@lockness/auth').RememberMeToken } | null
    > {
        // Verify token from database
        // TODO: Implement with remember_me_tokens table
        return Promise.resolve(null)
    }

    async recycleRememberToken(
        user: User,
        oldToken: RememberMeToken,
        expiresIn: number,
    ): Promise<RememberMeToken> {
        // Recycle (delete old, create new) for security
        // TODO: Implement
        const token = crypto.randomUUID()
        const tokenHash = await this.hashToken(token)
        const now = new Date()
        const expiresAt = new Date(Date.now() + expiresIn * 1000)

        return {
            identifier: user.id,
            hash: tokenHash,
            userId: user.id,
            expiresAt,
            createdAt: now,
            // Bare-copy the origin forward — renewal never resets the absolute
            // clock (#146). The guard resolved firstIssuedAt before calling.
            firstIssuedAt: oldToken.firstIssuedAt,
            value: token,
        }
    }

    async deleteRememberToken(_user: User, _tokenId: string | number) {
        // Delete token from database
        // TODO: Implement
    }

    deleteAllRememberTokens(_user: User): Promise<void> {
        // Delete every remember-me token for the user (#147) — invalidates a
        // captured remember-me cookie on "log out everywhere / others". A silent
        // no-op would reopen the ASVS 7.4.2 bypass, so this scaffold fails loud
        // until wired to the remember_me_tokens table.
        // TODO: db.delete(rememberMeTokens).where(eq(rememberMeTokens.userId, user.id))
        return Promise.reject(
            new Error(
                'deleteAllRememberTokens is not implemented — wire it to the remember_me_tokens table',
            ),
        )
    }

    private async hashToken(token: string): Promise<string> {
        const encoder = new TextEncoder()
        const data = encoder.encode(token)
        const hashBuffer = await crypto.subtle.digest('SHA-256', data)
        const hashArray = Array.from(new Uint8Array(hashBuffer))
        return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
    }
}
