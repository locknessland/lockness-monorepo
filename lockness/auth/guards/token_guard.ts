/**
 * @lockness/auth - Token Guard
 *
 * Token-based authentication for API requests using Bearer tokens.
 * Suitable for mobile apps, SPAs on different domains, or third-party integrations.
 */

import type { Context } from 'hono'
import type { EventEmitter } from '@lockness/events'
import type {
    AccessToken,
    AuthClientResponse,
    Authenticatable,
    GUARD_KNOWN_EVENTS,
    GuardContract,
    PROVIDER_REAL_USER,
    TokenGuardEvents,
    TokenGuardOptions,
    TokenUserProviderContract,
} from '../types.ts'
import {
    AuthenticationRequiredError,
    InvalidTokenError,
    UnauthorizedAccessError,
} from '../errors.ts'

/**
 * Token Guard authenticates requests using Bearer tokens from
 * the Authorization header.
 *
 * @example
 * const guard = new TokenGuard(
 *   'api',
 *   ctx,
 *   userProvider,
 *   { prefix: 'Bearer' },
 *   emitter
 * )
 *
 * const user = await guard.authenticate()
 * console.log('API user:', user.email)
 */
export class TokenGuard<
    UserProvider extends TokenUserProviderContract<Authenticatable>,
> implements GuardContract<UserProvider[typeof PROVIDER_REAL_USER]> {
    /**
     * Type signature for events
     */
    declare [GUARD_KNOWN_EVENTS]: TokenGuardEvents<
        UserProvider[typeof PROVIDER_REAL_USER]
    >

    /**
     * Guard driver name
     */
    readonly driverName = 'token'

    /**
     * Guard name (e.g., 'api')
     */
    #name: string

    /**
     * HTTP context
     */
    #ctx: Context

    /**
     * User provider
     */
    #userProvider: UserProvider

    /**
     * Guard options
     */
    #options: Required<TokenGuardOptions>

    /**
     * Event emitter
     */
    #emitter?: EventEmitter<
        TokenGuardEvents<UserProvider[typeof PROVIDER_REAL_USER]>
    >

    /**
     * Currently authenticated user
     */
    user?: UserProvider[typeof PROVIDER_REAL_USER]

    /**
     * Current access token
     */
    token?: AccessToken

    /**
     * Whether request has been authenticated
     */
    isAuthenticated = false

    /**
     * Whether authentication has been attempted
     */
    authenticationAttempted = false

    constructor(
        name: string,
        ctx: Context,
        userProvider: UserProvider,
        options?: TokenGuardOptions,
        emitter?: EventEmitter<
            TokenGuardEvents<UserProvider[typeof PROVIDER_REAL_USER]>
        >,
    ) {
        this.#name = name
        this.#ctx = ctx
        this.#userProvider = userProvider
        this.#emitter = emitter
        this.#options = {
            tokenType: options?.tokenType ?? 'Bearer',
            prefix: options?.prefix ?? 'Bearer',
        }
    }

    /**
     * Get authenticated user or throw
     */
    getUserOrFail(): UserProvider[typeof PROVIDER_REAL_USER] {
        if (!this.user) {
            throw new AuthenticationRequiredError('User is not authenticated')
        }
        return this.user
    }

    /**
     * Extract token from Authorization header
     */
    #extractToken(): string | null {
        const authHeader = this.#ctx.req.header('Authorization')
        if (!authHeader) {
            return null
        }

        const [prefix, token] = authHeader.split(' ')
        if (prefix !== this.#options.prefix || !token) {
            return null
        }

        return token
    }

    /**
     * Authenticate the current request
     *
     * @throws {UnauthorizedAccessError} When authentication fails
     */
    async authenticate(): Promise<UserProvider[typeof PROVIDER_REAL_USER]> {
        if (this.authenticationAttempted) {
            return this.getUserOrFail()
        }

        this.authenticationAttempted = true

        const tokenValue = this.#extractToken()
        if (!tokenValue) {
            const error = new UnauthorizedAccessError(
                'Missing or invalid authorization token',
            )
            this.#emitter?.emit('token:authentication_failed', { error })
            throw error
        }

        const result = await this.#userProvider.verifyToken(tokenValue)
        if (!result) {
            const error = new InvalidTokenError('Invalid or expired token')
            this.#emitter?.emit('token:authentication_failed', { error })
            throw error
        }

        const { user, token } = result

        this.user = user
        this.token = token
        this.isAuthenticated = true

        this.#emitter?.emit('token:authenticate', { user, token })

        return user
    }

    /**
     * Check if request is authenticated without throwing
     */
    async check(): Promise<boolean> {
        try {
            await this.authenticate()
            return true
        } catch {
            return false
        }
    }

    /**
     * Generate a new token for a user (typically after login)
     *
     * @example
     * const token = await guard.generate('user@example.com', 'password', 'mobile-app')
     * console.log('Token:', token.value)
     */
    async generate(
        email: string,
        password: string,
        tokenName = 'default',
        expiresIn?: number,
    ): Promise<AccessToken> {
        const user = await this.#userProvider.findByCredentials(email, password)
        if (!user) {
            throw new InvalidTokenError('Invalid credentials')
        }

        const token = await this.#userProvider.createToken(
            user,
            tokenName,
            expiresIn,
        )

        this.#emitter?.emit('token:created', { user, token })

        return token
    }

    /**
     * Generate a token for a user by ID (useful after registration)
     *
     * @example
     * const token = await guard.generateForUser(userId, 'web-app')
     */
    async generateForUser(
        userId: string | number,
        tokenName = 'default',
        expiresIn?: number,
    ): Promise<AccessToken> {
        const user = await this.#userProvider.findById(userId)
        if (!user) {
            throw new InvalidTokenError('User not found')
        }

        const token = await this.#userProvider.createToken(
            user,
            tokenName,
            expiresIn,
        )

        this.#emitter?.emit('token:created', { user, token })

        return token
    }

    /**
     * Revoke the current token
     *
     * @example
     * await guard.revoke()
     */
    async revoke(): Promise<void> {
        if (!this.user || !this.token) {
            throw new AuthenticationRequiredError(
                'No authenticated token to revoke',
            )
        }

        await this.#userProvider.deleteToken(this.user, this.token.identifier)

        this.#emitter?.emit('token:deleted', {
            user: this.user,
            tokenId: this.token.identifier,
        })

        this.user = undefined
        this.token = undefined
        this.isAuthenticated = false
    }

    /**
     * Revoke all tokens for the current user
     *
     * @example
     * await guard.revokeAll() // Logout from all devices
     */
    async revokeAll(): Promise<void> {
        if (!this.user) {
            throw new AuthenticationRequiredError('No authenticated user')
        }

        await this.#userProvider.deleteAllTokens(this.user)

        this.user = undefined
        this.token = undefined
        this.isAuthenticated = false
    }

    /**
     * Authenticate as a client (for testing)
     */
    async authenticateAsClient(
        user: UserProvider[typeof PROVIDER_REAL_USER],
        tokenName = 'test',
    ): Promise<AuthClientResponse> {
        const token = await this.#userProvider.createToken(user, tokenName)

        return {
            headers: {
                Authorization: `${this.#options.prefix} ${token.value}`,
            },
        }
    }
}
