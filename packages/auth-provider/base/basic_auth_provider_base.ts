/**
 * @lockness/auth-provider - Base Basic Auth Provider
 *
 * Abstract base class for HTTP Basic Authentication providers.
 * Implements shared logic for credential verification.
 */

import type {
    Authenticatable,
    BasicAuthUserProviderContract,
    PROVIDER_REAL_USER,
} from '@lockness/auth'

/**
 * Abstract base class for basic auth user providers
 *
 * Provides shared implementation of:
 * - Password hashing and verification
 *
 * Subclasses must implement:
 * - findUserById()
 * - findByCredentials()
 * - verifyPassword()
 */
export abstract class BasicAuthProviderBase<User extends Authenticatable>
    implements BasicAuthUserProviderContract<User> {
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
}
