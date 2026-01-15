/**
 * @lockness/auth-provider - Base Token Provider
 *
 * Abstract base class for token-based (API) authentication providers.
 * Implements shared logic for token generation, verification, and management.
 */

import type {
    AccessToken,
    Authenticatable,
    PROVIDER_REAL_USER,
    TokenUserProviderContract,
} from '@lockness/auth'

/**
 * Abstract base class for token user providers
 *
 * Provides shared implementation of:
 * - Token generation (cryptographically secure)
 * - Token hashing
 * - Token lifecycle management
 *
 * Subclasses must implement:
 * - findUserById()
 * - findByCredentials()
 * - createToken()
 * - verifyToken()
 * - deleteToken()
 * - deleteAllTokens()
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
