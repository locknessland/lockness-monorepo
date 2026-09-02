/**
 * @fileoverview Abstract base class for session-based authentication providers.
 *
 * Implements shared logic for password verification, remember tokens, and user lookup.
 * ORM-specific implementations extend this class.
 *
 * @module @lockness/auth-provider/base/session
 */

import type {
    Authenticatable,
    PROVIDER_REAL_USER,
    RememberMeToken,
    SessionUserProviderContract,
    SessionWithRememberMeProviderContract,
} from '@lockness/auth'

/**
 * Abstract base class for session user providers.
 *
 * Provides shared implementation of:
 * - Password hashing and verification
 * - Remember token generation and verification
 * - Token recycling for security
 *
 * Subclasses must implement:
 * - `findUserById()` - Find user by unique identifier
 * - `findByCredentials()` - Find user by email/password
 * - `verifyPassword()` - Verify password hash
 *
 * If remember tokens are enabled, subclasses should also implement:
 * - `createRememberToken()` - Create a new remember token
 * - `verifyRememberToken()` - Verify and retrieve token
 * - `deleteRememberToken()` - Delete a specific token
 * - `recycleRememberToken()` - Rotate token for security
 *
 * @typeParam User - The user entity type extending {@link Authenticatable}
 *
 * @example
 * ```ts
 * class MySessionProvider extends SessionProviderBase<User> {
 *   async findById(id: string | number): Promise<User | null> {
 *     return await db.users.findFirst({ where: { id } })
 *   }
 *   // ... implement other abstract methods
 * }
 * ```
 */
export abstract class SessionProviderBase<User extends Authenticatable>
    implements
        SessionUserProviderContract<User>,
        SessionWithRememberMeProviderContract<User> {
    /**
     * Symbol to access real user type
     */
    declare [PROVIDER_REAL_USER]: User

    /**
     * Default password verification (direct comparison - NOT secure for production)
     * Subclasses should override this with bcrypt.compare(), argon2, scrypt, etc.
     */
    // deno-lint-ignore require-await
    protected async defaultVerifyPassword(
        plain: string,
        hash: string,
    ): Promise<boolean> {
        return plain === hash
    }

    /**
     * Generate a cryptographically secure token value
     */
    // deno-lint-ignore require-await
    protected async generateTokenValue(
        lengthInBytes: number = 32,
    ): Promise<string> {
        const bytes = new Uint8Array(lengthInBytes)
        crypto.getRandomValues(bytes)
        return Array.from(bytes)
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('')
    }

    /**
     * Hash a token value (should use a fast hash like SHA256)
     */
    protected async hashTokenValue(token: string): Promise<string> {
        const encoder = new TextEncoder()
        const data = encoder.encode(token)
        const hashBuffer = await crypto.subtle.digest('SHA-256', data)
        return Array.from(new Uint8Array(hashBuffer))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('')
    }

    /**
     * Find a user by their unique identifier
     * Must be implemented by subclasses
     */
    abstract findById(id: string | number): Promise<User | null>

    /**
     * Find user by credentials (email/password)
     * Must be implemented by subclasses
     */
    abstract findByCredentials(
        email: string,
        password: string,
    ): Promise<User | null>

    /**
     * Verify password hash
     * Must be implemented by subclasses
     */
    abstract verifyPassword(plain: string, hash: string): Promise<boolean>

    /**
     * Create a remember me token for a user
     * Must be implemented by subclasses that support remember tokens
     */
    abstract createRememberToken(
        user: User,
        expiresIn: number,
    ): Promise<RememberMeToken>

    /**
     * Verify a remember me token and return the user
     * Must be implemented by subclasses that support remember tokens
     */
    abstract verifyRememberToken(
        tokenValue: string,
    ): Promise<{ user: User; token: RememberMeToken } | null>

    /**
     * Delete a remember me token
     * Must be implemented by subclasses that support remember tokens
     */
    abstract deleteRememberToken(
        user: User,
        tokenId: string | number,
    ): Promise<void>

    /**
     * Delete every remember-me token for a user (#147).
     *
     * Called by the guard's per-user eviction so a captured remember-me cookie
     * cannot re-mint a post-eviction session. Subclasses that support remember
     * tokens must drop all of the user's rows.
     */
    abstract deleteAllRememberTokens(user: User): Promise<void>

    /**
     * Recycle a remember me token (for security).
     * Must be implemented by subclasses that support remember tokens.
     *
     * Receives the whole verified token so the renewed token can bare-copy
     * `firstIssuedAt` from it (`new.firstIssuedAt = token.firstIssuedAt`) — the
     * origin the remember-me absolute-lifetime cap is measured from (#146). The
     * guard resolves the origin before calling; the provider does no fallback.
     */
    abstract recycleRememberToken(
        user: User,
        token: RememberMeToken,
        expiresIn: number,
    ): Promise<RememberMeToken>
}
