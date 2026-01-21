/**
 * @fileoverview Helper functions for the container.
 *
 * Provides convenience functions for common container operations.
 *
 * @module @lockness/container/helpers
 */

import { Container, container } from './container.ts'
import type { Constructor } from './types.ts'

/**
 * Create a new isolated container instance.
 *
 * Each container maintains its own service registry, useful for:
 * - Unit testing with isolated dependencies
 * - Multi-tenant applications with separate contexts
 * - Feature modules with scoped services
 *
 * @returns A new Container instance with empty registry
 *
 * @see {@link Container} for the container class
 * @see {@link container} for the global singleton instance
 *
 * @example
 * ```typescript
 * // Create isolated container for testing
 * const testContainer = createContainer()
 * testContainer.set(Config, new MockConfig())
 * testContainer.set(UserService, new TestUserService())
 *
 * // Services resolved from testContainer are isolated
 * const service = testContainer.get(UserService)
 * ```
 */
export function createContainer(): Container {
    return new Container()
}

/**
 * Bind a service to the global container.
 *
 * Convenience function for registering services in the global container.
 * If no instance is provided, the service is pre-instantiated to ensure
 * singleton behavior from the start.
 *
 * @typeParam T - The service instance type
 * @param ServiceClass - The service class constructor
 * @param instance - Optional pre-created instance to register
 * @returns void
 *
 * @example Pre-instantiate service
 * ```typescript
 * // Service will be created immediately
 * bind(UserService)
 * ```
 *
 * @example Register with custom instance
 * ```typescript
 * // Register with specific configuration
 * bind(Config, new Config({ apiKey: 'secret', debug: true }))
 * ```
 */
export function bind<T>(ServiceClass: Constructor<T>, instance?: T): void {
    if (instance) {
        container.set(ServiceClass, instance)
    } else {
        // Pre-register to ensure singleton
        container.get(ServiceClass)
    }
}

/**
 * Resolve a service from the global container.
 *
 * Fluent API alias for `container.get()`. Returns the singleton instance
 * of the requested service, creating it if necessary.
 *
 * @typeParam T - The service instance type
 * @param ServiceClass - The service class to resolve
 * @returns The singleton service instance
 *
 * @see {@link container} for the global container instance
 * @see {@link bind} for registering services
 *
 * @example
 * ```typescript
 * // Resolve service with type inference
 * const userService = resolve(UserService)
 * const users = userService.getUsers()
 *
 * // Equivalent to:
 * const userService = container.get(UserService)
 * ```
 */
export function resolve<T>(ServiceClass: Constructor<T>): T {
    return container.get<T>(ServiceClass)
}
