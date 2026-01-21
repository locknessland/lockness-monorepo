/**
 * @fileoverview Type definitions for the container package.
 *
 * Provides core types and interfaces for dependency injection.
 *
 * @module @lockness/container/types
 */

/**
 * Constructor type for instantiable classes.
 *
 * Represents any class that can be instantiated with `new`.
 *
 * @typeParam T - The instance type created by the constructor
 *
 * @example
 * ```typescript
 * class UserService {}
 *
 * const ctor: Constructor<UserService> = UserService
 * const instance = new ctor()
 * ```
 */
// deno-lint-ignore no-explicit-any
export type Constructor<T = unknown> = new (...args: any[]) => T

/**
 * Token type for service registration.
 *
 * A token can be:
 * - A class constructor (most common)
 * - A symbol (for interface bindings)
 * - A string (for named bindings)
 *
 * @typeParam T - The instance type associated with this token
 *
 * @example
 * ```typescript
 * // Class token
 * const token1: ServiceToken<UserService> = UserService
 *
 * // Symbol token for interface
 * const token2: ServiceToken<ILogger> = Symbol('ILogger')
 *
 * // String token
 * const token3: ServiceToken<Config> = 'app.config'
 * ```
 */
export type ServiceToken<T = unknown> = Constructor<T> | symbol | string

/**
 * Read-only container interface.
 *
 * Provides read-only access to the container for resolving services.
 * Useful for dependency injection where only resolution is needed.
 *
 * @example
 * ```typescript
 * function bootstrap(container: ContainerReader) {
 *     const userService = container.get(UserService)
 *     console.log(`Container has ${container.size} services`)
 * }
 * ```
 */
export interface ContainerReader {
    /**
     * Get a service instance by its token.
     *
     * @typeParam T - The service type
     * @param token - The service token (class, symbol, or string)
     * @returns The singleton instance of the service
     */
    get<T>(token: Constructor<T> | ServiceToken<T>): T

    /**
     * Check if a service is registered.
     *
     * @param token - The service token to check
     * @returns True if the service is registered
     */
    has(token: ServiceToken): boolean

    /**
     * Number of registered services.
     */
    readonly size: number
}

/**
 * Write-only container interface.
 *
 * Provides write access to the container for registering services.
 * Useful for setup/configuration phases.
 *
 * @example
 * ```typescript
 * function configure(container: ContainerWriter) {
 *     container.set(Config, new Config({ debug: true }))
 * }
 * ```
 */
export interface ContainerWriter {
    /**
     * Register a service instance.
     *
     * @typeParam T - The service type
     * @param token - The service token
     * @param instance - The instance to register
     */
    set<T>(token: Constructor<T> | ServiceToken<T>, instance: T): void

    /**
     * Remove a service from the container.
     *
     * @param token - The service token to remove
     * @returns True if the service was removed
     */
    delete(token: ServiceToken): boolean

    /**
     * Remove all services from the container.
     */
    clear(): void
}

/**
 * Full container interface combining read and write operations.
 *
 * @example
 * ```typescript
 * function setupContainer(container: IContainer) {
 *     // Write
 *     container.set(Config, new Config())
 *
 *     // Read
 *     const config = container.get(Config)
 *
 *     // Check
 *     if (container.has(UserService)) {
 *         container.delete(UserService)
 *     }
 * }
 * ```
 */
export interface IContainer extends ContainerReader, ContainerWriter {}
