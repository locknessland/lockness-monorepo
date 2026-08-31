/**
 * @fileoverview Dependency Injection Container implementation.
 *
 * Provides the core Container class for managing service instances
 * with automatic singleton creation and lazy instantiation.
 *
 * @module @lockness/container/container
 */

import { CircularDependencyError, ServiceNotFoundError } from './errors.ts'
import type { Constructor, ContainerContract, ServiceToken } from './types.ts'

/**
 * Render a token for an error message.
 *
 * @param token - A class constructor, symbol or string token.
 * @returns A human-readable name.
 */
function describeToken(token: ServiceToken | Constructor<unknown>): string {
    if (typeof token === 'function') return token.name || 'AnonymousClass'
    if (typeof token === 'symbol') return token.description ?? 'Symbol()'
    return String(token)
}

/**
 * Dependency Injection Container.
 *
 * Manages service instances with automatic singleton creation.
 * Services are lazily instantiated on first access.
 *
 * @implements {ContainerContract}
 *
 * @example
 * ```ts
 * const container = new Container()
 *
 * // Auto-instantiate on first access
 * const userService = container.get(UserService)
 *
 * // Pre-register with custom instance
 * container.set(Config, new Config({ debug: true }))
 * ```
 */
export class Container implements ContainerContract {
    /**
     * Internal service registry.
     * @internal
     */
    private readonly services = new Map<ServiceToken, unknown>()

    /**
     * Tokens whose constructors are currently running, in entry order.
     *
     * Only the construction path is tracked. `@Inject` resolves on first
     * property *read*, which happens after the constructor returns and is
     * therefore not on this stack — that laziness is what lets ordinary
     * mutual references work, and it is deliberately left alone.
     *
     * @internal
     */
    private readonly constructing: ServiceToken[] = []

    /**
     * Get or create an instance of a service.
     *
     * If the service doesn't exist and the token is a class constructor,
     * it will be automatically instantiated and cached (singleton pattern).
     *
     * @typeParam T - The service type
     * @param token - The class constructor or token to resolve
     * @returns The singleton instance of the service
     * @throws {ServiceNotFoundError} When token is not a constructor and not registered
     * @throws {CircularDependencyError} When a constructor re-enters a
     * construction already in progress
     *
     * @example
     * ```ts
     * // Auto-instantiate class
     * const userService = container.get(UserService)
     *
     * // Get by symbol token (must be pre-registered)
     * const logger = container.get<ILogger>(LOGGER_TOKEN)
     * ```
     */
    get<T>(token: Constructor<T> | ServiceToken<T>): T {
        if (!this.services.has(token)) {
            if (typeof token !== 'function') {
                throw new ServiceNotFoundError(token as symbol | string)
            }

            if (this.constructing.includes(token)) {
                const start = this.constructing.indexOf(token)
                throw new CircularDependencyError([
                    ...this.constructing.slice(start).map(describeToken),
                    describeToken(token),
                ])
            }

            this.constructing.push(token)
            try {
                this.services.set(token, new token())
            } finally {
                this.constructing.pop()
            }
        }
        return this.services.get(token) as T
    }

    /**
     * Manually register a service instance.
     *
     * Use this to register pre-configured instances or to override
     * the default instantiation behavior.
     *
     * @typeParam T - The service type
     * @param token - The token (class, symbol, or string) to register
     * @param instance - The instance to register
     * @returns void
     *
     * @example
     * ```ts
     * const config = new Config({ apiKey: 'secret' })
     * container.set(Config, config)
     *
     * // With symbol token for interfaces
     * const TOKEN = Symbol('ILogger')
     * container.set(TOKEN, new ConsoleLogger())
     * ```
     */
    set<T>(token: Constructor<T> | ServiceToken<T>, instance: T): void {
        this.services.set(token, instance)
    }

    /**
     * Check if a service is registered.
     *
     * @param token - The token to check
     * @returns True if the service exists
     *
     * @example
     * ```ts
     * if (container.has(UserService)) {
     *     // service is registered
     * }
     * ```
     */
    has(token: ServiceToken): boolean {
        return this.services.has(token)
    }

    /**
     * Remove a service from the container.
     *
     * @param token - The service token to remove (class, symbol, or string)
     * @returns `true` if the service was registered and removed, `false` if not found
     *
     * @example
     * ```typescript
     * // Remove by class token
     * container.delete(UserService)
     *
     * // Remove by symbol token
     * container.delete(CONFIG_TOKEN)
     * ```
     */
    delete(token: ServiceToken): boolean {
        return this.services.delete(token)
    }

    /**
     * Clear all services from the container.
     *
     * Removes all registered service instances. Useful for testing
     * or resetting application state between test cases.
     *
     * @returns void
     *
     * @example
     * ```typescript
     * // In test teardown
     * afterEach(() => {
     *     container.clear()
     * })
     * ```
     */
    clear(): void {
        this.services.clear()
    }

    /**
     * Get the number of registered services.
     *
     * @returns The count of currently registered service instances
     *
     * @example
     * ```typescript
     * console.log(`${container.size} services registered`)
     * ```
     */
    get size(): number {
        return this.services.size
    }
}

/**
 * Global singleton container instance.
 *
 * This is the default container used by the @Service and @Inject decorators.
 * You can create your own Container instances if you need isolated contexts.
 *
 * @example
 * ```typescript
 * import { container } from '@lockness/container'
 *
 * const userService = container.get(UserService)
 * ```
 */
export const container: Container = new Container()
