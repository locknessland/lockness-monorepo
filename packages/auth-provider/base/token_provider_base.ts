/**
 * @fileoverview Abstract base class for token-based (API) authentication providers.
 *
 * Implements shared logic for token generation, verification, and management.
 *
 * @module @lockness/auth-provider/base/token
 */

import type {
    AccessToken,
    Authenticatable,
    PROVIDER_REAL_USER,
    TokenUserProviderContract,
} from '@lockness/auth'

/**
 * Abstract base class for token user providers.
 *
 * Provides shared implementation of:
 * - Token generation (cryptographically secure)
 * - Token hashing using SHA-256
 * - Token lifecycle management
 *
 * Subclasses must implement:
 * - `findUserById()` - Find user by unique identifier
 * - `findByCredentials()` - Find user by email/password
 * - `createToken()` - Create a new access token
 * - `verifyToken()` - Verify and retrieve token
 * - `deleteToken()` - Delete a specific token
 * - `deleteAllTokens()` - Revoke all tokens for a user
 *
 * @typeParam User - The user entity type extending {@link Authenticatable}
 *
 * @example
 * ```ts
 * class MyTokenProvider extends TokenProviderBase<User> {
 *   async findById(id: string | number): Promise<User | null> {
 *     return await db.users.findFirst({ where: { id } })
 *   }
 *   // ... implement other abstract methods
 * }
 * ```
 */
export abstract class TokenProviderBase<User extends Authenticatable>
    implements TokenUserProviderContract<User> {
    /**
     * Symbol to access real user type
     */
    declare [PROVIDER_REAL_USER]: User

    /**
     * Generate a cryptographically secure token value
     */
    // deno-lint-ignore require-await
    protected async generateTokenValue(
        lengthInBytes: number = 40,
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
     * Find user by credentials (email/password) for token generation
     * Must be implemented by subclasses
     */
    abstract findByCredentials(
        email: string,
        password: string,
    ): Promise<User | null>

    /**
     * Create an access token for a user
     * Must be implemented by subclasses
     */
    abstract createToken(
        user: User,
        name: string,
        expiresIn?: number,
    ): Promise<AccessToken>

    /**
     * Verify an access token and return the user
     * Must be implemented by subclasses
     */
    abstract verifyToken(
        tokenValue: string,
    ): Promise<{ user: User; token: AccessToken } | null>

    /**
     * Delete a token
     * Must be implemented by subclasses
     */
    abstract deleteToken(user: User, tokenId: string | number): Promise<void>

    /**
     * Delete all tokens for a user
     * Must be implemented by subclasses
     */
    abstract deleteAllTokens(user: User): Promise<void>
}
