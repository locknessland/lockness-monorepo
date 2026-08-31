/**
 * @fileoverview Custom error classes for the container package.
 *
 * Provides typed errors for better error handling and debugging.
 *
 * @module @lockness/container/errors
 */

/**
 * Error thrown when a service cannot be resolved from the container.
 *
 * This error is thrown when attempting to resolve a token (symbol or string)
 * that has not been registered in the container.
 *
 * @extends {Error}
 *
 * @example
 * ```typescript
 * import { container, ServiceNotFoundError } from '@lockness/container'
 *
 * const TOKEN = Symbol('ILogger')
 *
 * try {
 *     container.get(TOKEN)
 * } catch (error) {
 *     if (error instanceof ServiceNotFoundError) {
 *         console.error('Token not found:', error.token)
 *     }
 * }
 * ```
 */
export class ServiceNotFoundError extends Error {
    /**
     * The token that could not be resolved.
     * @readonly
     */
    readonly token: symbol | string

    /**
     * Creates a new ServiceNotFoundError.
     *
     * @param token - The token that could not be resolved
     */
    constructor(token: symbol | string) {
        super(`Service not found for token: ${String(token)}`)
        this.name = 'ServiceNotFoundError'
        this.token = token
    }
}

/**
 * Error thrown when resolving a service re-enters a construction already in
 * progress.
 *
 * The container instantiates lazily and caches, so a service graph that loops
 * back on itself is only a fault when a **constructor** reaches for a
 * dependency whose own construction is still on the stack. Without this guard
 * that case recurses until the runtime gives up with
 * `RangeError: Maximum call stack size exceeded`, which names neither the
 * container nor the services involved.
 *
 * `@Inject` installs a lazy, cached property getter, so the far more common
 * shape — two services holding references to each other and reading them
 * *after* construction — resolves normally and never reaches this error.
 *
 * @extends {Error}
 *
 * @example
 * ```typescript
 * import { container, CircularDependencyError } from '@lockness/container'
 *
 * try {
 *     container.get(OrderService)
 * } catch (error) {
 *     if (error instanceof CircularDependencyError) {
 *         // "OrderService → BillingService → OrderService"
 *         console.error(error.chain.join(' → '))
 *     }
 * }
 * ```
 */
export class CircularDependencyError extends Error {
    /**
     * The construction chain, opening and closing on the repeated service.
     * @readonly
     */
    readonly chain: readonly string[]

    /**
     * @param chain - Names of the services on the construction stack, ending
     * with the one that was re-entered.
     */
    constructor(chain: readonly string[]) {
        super(
            `Circular dependency while constructing services: ${
                chain.join(' → ')
            }. ` +
                'A constructor is reading a dependency whose own construction ' +
                'has not finished. Inject it with @Inject so it resolves on ' +
                'first access instead, or break the cycle.',
        )
        this.name = 'CircularDependencyError'
        this.chain = chain
    }
}
