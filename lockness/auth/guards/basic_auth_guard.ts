/**
 * @lockness/auth - Basic Auth Guard
 * 
 * HTTP Basic Authentication guard using the Authorization header.
 * Suitable for temporary authentication during development or simple API endpoints.
 */

import type { Context } from 'hono'
import type { EventEmitter } from '@lockness/events'
import type {
    Authenticatable,
    AuthClientResponse,
    BasicAuthGuardOptions,
    BasicAuthUserProviderContract,
    GuardContract,
    GUARD_KNOWN_EVENTS,
    PROVIDER_REAL_USER,
    BasicAuthGuardEvents,
} from '../types.ts'
import {
    InvalidCredentialsError,
    UnauthorizedAccessError,
    AuthenticationRequiredError,
} from '../errors.ts'

/**
 * Basic Auth Guard implements HTTP Basic Authentication.
 * Credentials are sent as base64-encoded in the Authorization header.
 * 
 * @warning Not suitable for production. Use for development only.
 * 
 * @example
 * const guard = new BasicAuthGuard(
 *   'basic',
 *   ctx,
 *   userProvider,
 *   { realm: 'Protected Area' },
 *   emitter
 * )
 * 
 * const user = await guard.authenticate()
 */
export class BasicAuthGuard<UserProvider extends BasicAuthUserProviderContract<Authenticatable>>
    implements GuardContract<UserProvider[typeof PROVIDER_REAL_USER]> {
    /**
     * Type signature for events
     */
    declare [GUARD_KNOWN_EVENTS]: BasicAuthGuardEvents<UserProvider[typeof PROVIDER_REAL_USER]>

    /**
     * Guard driver name
     */
    readonly driverName = 'basic_auth'

    /**
     * Guard name (e.g., 'basic')
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
    #options: Required<BasicAuthGuardOptions>

    /**
     * Event emitter
     */
    #emitter?: EventEmitter<BasicAuthGuardEvents<UserProvider[typeof PROVIDER_REAL_USER]>>

    /**
     * Currently authenticated user
     */
    user?: UserProvider[typeof PROVIDER_REAL_USER]

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
        options?: BasicAuthGuardOptions,
        emitter?: EventEmitter<BasicAuthGuardEvents<UserProvider[typeof PROVIDER_REAL_USER]>>,
    ) {
        this.#name = name
        this.#ctx = ctx
        this.#userProvider = userProvider
        this.#emitter = emitter
        this.#options = {
            realm: options?.realm ?? 'Secured Area',
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
     * Extract and decode credentials from Authorization header
     */
    #extractCredentials(): { email: string; password: string } | null {
        const authHeader = this.#ctx.req.header('Authorization')
        if (!authHeader) {
            return null
        }

        const [prefix, encoded] = authHeader.split(' ')
        if (prefix !== 'Basic' || !encoded) {
            return null
        }

        try {
            const decoded = atob(encoded)
            const [email, password] = decoded.split(':')

            if (!email || !password) {
                return null
            }

            return { email, password }
        } catch {
            return null
        }
    }

    /**
     * Send WWW-Authenticate challenge header
     */
    #sendChallenge(): never {
        this.#ctx.header('WWW-Authenticate', `Basic realm="${this.#options.realm}"`)
        throw new UnauthorizedAccessError('Authentication required')
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

        const credentials = this.#extractCredentials()
        if (!credentials) {
            const error = new UnauthorizedAccessError('Missing or invalid Authorization header')
            this.#emitter?.emit('basic_auth:authentication_failed', { error })
            this.#sendChallenge()
        }

        const user = await this.#userProvider.findByCredentials(
            credentials.email,
            credentials.password,
        )

        if (!user) {
            const error = new InvalidCredentialsError('Invalid credentials')
            this.#emitter?.emit('basic_auth:authentication_failed', { error })
            this.#sendChallenge()
        }

        this.user = user
        this.isAuthenticated = true

        this.#emitter?.emit('basic_auth:authenticate', { user })

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
     * Authenticate as a client (for testing)
     */
    async authenticateAsClient(
        user: UserProvider[typeof PROVIDER_REAL_USER],
        password = 'password',
    ): Promise<AuthClientResponse> {
        const credentials = btoa(`${user.email}:${password}`)

        return {
            headers: {
                Authorization: `Basic ${credentials}`,
            },
        }
    }
}
