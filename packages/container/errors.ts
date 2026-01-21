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
