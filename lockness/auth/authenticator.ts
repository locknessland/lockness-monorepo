/**
 * @lockness/auth - Authenticator
 * 
 * Main authenticator class that manages multiple authentication guards.
 * Inspired by AdonisJS authenticator architecture.
 */

import type { Context } from 'hono'
import type {
    Authenticatable,
    AuthClientResponse,
    AuthConfig,
    GuardContract,
    GuardFactory,
} from './types.ts'
import { AuthenticationRequiredError, UnauthorizedAccessError } from './errors.ts'

/**
 * Authenticator manages multiple authentication guards and provides
 * a unified interface for authentication across different methods.
 * 
 * @example
 * const auth = new Authenticator(ctx, {
 *   default: 'web',
 *   guards: {
 *     web: sessionGuardFactory,
 *     api: tokenGuardFactory
 *   }
 * })
 * 
 * await auth.authenticate()
 * console.log(auth.user)
 */
export class Authenticator<Guards extends Record<string, GuardFactory>> {
    /**
     * Configuration with default guard and available guards
     */
    #config: AuthConfig<Guards>

    /**
     * HTTP context for the current request
     */
    #ctx: Context

    /**
     * Cache of instantiated guards for the current request
     */
    #guardsCache: Partial<Record<keyof Guards, GuardContract<any>>> = {}

    /**
     * Name of the guard that was used for the last authentication attempt
     */
    #authenticationAttemptedViaGuard?: keyof Guards

    /**
     * Name of the guard that successfully authenticated the request
     */
    #authenticatedViaGuard?: keyof Guards

    /**
     * Get the name of the default guard
     */
    get defaultGuard(): keyof Guards {
        return this.#config.default
    }

    /**
     * Get the name of the guard that authenticated the request
     */
    get authenticatedViaGuard(): keyof Guards | undefined {
        return this.#authenticatedViaGuard
    }

    /**
     * Check if the current request has been authenticated
     */
    get isAuthenticated(): boolean {
        if (!this.#authenticationAttemptedViaGuard) {
            return false
        }
        return this.use(this.#authenticationAttemptedViaGuard).isAuthenticated
    }

    /**
     * Get the currently authenticated user
     */
    get user():
        | {
            [K in keyof Guards]: ReturnType<Guards[K]>['user']
        }[keyof Guards]
        | undefined {
        if (!this.#authenticationAttemptedViaGuard) {
            return undefined
        }
        return this.use(this.#authenticationAttemptedViaGuard).user
    }

    /**
     * Check if authentication has been attempted
     */
    get authenticationAttempted(): boolean {
        if (!this.#authenticationAttemptedViaGuard) {
            return false
        }
        return this.use(this.#authenticationAttemptedViaGuard).authenticationAttempted
    }

    constructor(ctx: Context, config: AuthConfig<Guards>) {
        this.#ctx = ctx
        this.#config = config
    }

    /**
     * Get an instance of a specific guard
     * 
     * @example
     * const sessionGuard = auth.use('web')
     * await sessionGuard.authenticate()
     */
    use<K extends keyof Guards>(
        name: K,
    ): ReturnType<Guards[K]> {
        if (!this.#guardsCache[name]) {
            const guardFactory = this.#config.guards[name]
            if (!guardFactory) {
                throw new Error(`Guard "${String(name)}" is not configured`)
            }
            this.#guardsCache[name] = guardFactory(this.#ctx)
        }
        return this.#guardsCache[name] as ReturnType<Guards[K]>
    }

    /**
     * Get the authenticated user or throw an exception
     * 
     * @throws {AuthenticationRequiredError} When authentication hasn't been attempted
     * 
     * @example
     * const user = auth.getUserOrFail()
     * console.log(user.email)
     */
    getUserOrFail(): {
        [K in keyof Guards]: ReturnType<ReturnType<Guards[K]>['getUserOrFail']>
    }[keyof Guards] {
        if (!this.#authenticationAttemptedViaGuard) {
            throw new AuthenticationRequiredError(
                'Cannot access authenticated user. Please call authenticate() first.',
            )
        }

        return this.use(this.#authenticationAttemptedViaGuard).getUserOrFail() as ReturnType<ReturnType<Guards[keyof Guards]>['getUserOrFail']>
    }

    /**
     * Authenticate the request using the default guard
     * 
     * @throws {UnauthorizedAccessError} When authentication fails
     * 
     * @example
     * const user = await auth.authenticate()
     * console.log('Authenticated as:', user.email)
     */
    async authenticate(): Promise<
        {
            [K in keyof Guards]: ReturnType<ReturnType<Guards[K]>['authenticate']>
        }[keyof Guards]
    > {
        return this.authenticateUsing(this.#config.default)
    }

    /**
     * Authenticate using a specific guard
     * 
     * @throws {UnauthorizedAccessError} When authentication fails
     * 
     * @example
     * const user = await auth.authenticateUsing('api')
     * console.log('Authenticated via API token')
     */
    async authenticateUsing<K extends keyof Guards>(
        guardName: K,
    ): Promise<Awaited<ReturnType<ReturnType<Guards[K]>['authenticate']>>> {
        this.#authenticationAttemptedViaGuard = guardName
        this.#authenticatedViaGuard = undefined

        const guard = this.use(guardName)
        const user = await guard.authenticate()

        if (guard.isAuthenticated) {
            this.#authenticatedViaGuard = guardName
        }

        return user as Awaited<ReturnType<ReturnType<Guards[K]>['authenticate']>>
    }

    /**
     * Authenticate using multiple guards (tries each until one succeeds)
     * 
     * @throws {UnauthorizedAccessError} When all guards fail
     * 
     * @example
     * const user = await auth.authenticateUsing(['web', 'api'])
     * console.log('Authenticated via:', auth.authenticatedViaGuard)
     */
    async authenticateUsingAny<K extends keyof Guards>(
        guardNames: K[],
    ): Promise<Awaited<ReturnType<ReturnType<Guards[K]>['authenticate']>>> {
        const errors: Error[] = []

        for (const guardName of guardNames) {
            try {
                return await this.authenticateUsing(guardName)
            } catch (error) {
                errors.push(error as Error)
            }
        }

        throw new UnauthorizedAccessError(
            `Authentication failed using guards: ${guardNames.map(String).join(', ')}`,
        )
    }

    /**
     * Check if the request is authenticated using the default guard
     * 
     * @example
     * if (await auth.check()) {
     *   console.log('User is authenticated')
     * }
     */
    async check(): Promise<boolean> {
        return this.checkUsing(this.#config.default)
    }

    /**
     * Check if request is authenticated using a specific guard
     * 
     * @example
     * if (await auth.checkUsing('api')) {
     *   console.log('Valid API token provided')
     * }
     */
    async checkUsing<K extends keyof Guards>(guardName: K): Promise<boolean> {
        this.#authenticationAttemptedViaGuard = guardName
        this.#authenticatedViaGuard = undefined

        const guard = this.use(guardName)
        const isAuthenticated = await guard.check()

        if (isAuthenticated) {
            this.#authenticatedViaGuard = guardName
        }

        return isAuthenticated
    }

    /**
     * Check if authenticated using any of the specified guards
     * 
     * @example
     * if (await auth.checkUsingAny(['web', 'api'])) {
     *   console.log('User authenticated via web or api')
     * }
     */
    async checkUsingAny<K extends keyof Guards>(guardNames: K[]): Promise<boolean> {
        for (const guardName of guardNames) {
            if (await this.checkUsing(guardName)) {
                return true
            }
        }
        return false
    }

    /**
     * Authenticate a user as a client (for testing)
     * 
     * @example
     * const response = await auth.authenticateAsClient(user)
     * // Use response.cookies, response.headers in tests
     */
    async authenticateAsClient(
        user: Authenticatable,
        guardName?: keyof Guards,
        ...args: unknown[]
    ): Promise<AuthClientResponse> {
        const guard = this.use(guardName || this.#config.default)
        return guard.authenticateAsClient(user, ...args)
    }
}
