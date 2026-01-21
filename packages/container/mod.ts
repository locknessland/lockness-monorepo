/**
 * @fileoverview Lightweight Dependency Injection container for TypeScript/Deno.
 *
 * Provides a simple yet powerful DI container with:
 * - Singleton management with lazy instantiation
 * - Constructor injection via class tokens
 * - Property injection via @Inject decorator
 * - @Service marker decorator for documentation
 *
 * @module @lockness/container
 *
 * @example
 * ```ts
 * import { container, Service, Inject } from '@lockness/container'
 *
 * @Service()
 * class UserRepository {
 *   findAll() { return [] }
 * }
 *
 * @Service()
 * class UserService {
 *   @Inject(UserRepository)
 *   accessor repo!: UserRepository
 *
 *   getUsers() {
 *     return this.repo.findAll()
 *   }
 * }
 *
 * const service = container.get(UserService)
 * ```
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Constructor type for instantiable classes.
 * @typeParam T - The instance type
 */
// deno-lint-ignore no-explicit-any
export type Constructor<T = unknown> = new (...args: any[]) => T

/**
 * Token type for service registration.
 * Can be a class constructor or a symbol/string for interface bindings.
 * @typeParam T - The instance type
 */
export type ServiceToken<T = unknown> = Constructor<T> | symbol | string

// =============================================================================
// Container
// =============================================================================

/**
 * Dependency Injection Container.
 *
 * Manages service instances with automatic singleton creation.
 * Services are lazily instantiated on first access.
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
export class Container {
    /**
     * Internal service registry.
     * @internal
     */
    private readonly services = new Map<ServiceToken, unknown>()

    /**
     * Get or create an instance of a service.
     *
     * If the service doesn't exist and the token is a class constructor,
     * it will be automatically instantiated and cached (singleton pattern).
     *
     * @typeParam T - The service type
     * @param token - The class constructor or token to resolve
     * @returns The singleton instance of the service
     * @throws {TypeError} When token is not a constructor and not registered
     *
     * @example
     * ```ts
     * const userService = container.get(UserService)
     * ```
     */
    get<T>(token: Constructor<T> | ServiceToken<T>): T {
        if (!this.services.has(token)) {
            if (typeof token === 'function') {
                this.services.set(token, new token())
            } else {
                throw new TypeError(
                    `Service not found for token: ${String(token)}`,
                )
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
     * @returns True if the service was registered and has been removed, false if not found
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
 * Global singleton container instance
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

/**
 * Decorator to mark a class as a Service.
 *
 * This is a marker decorator for documentation and IDE support.
 * The actual singleton behavior is handled by the Container when
 * the service is first resolved via `container.get()`.
 *
 * @returns A class decorator that returns the class unchanged
 *
 * @example
 * ```typescript
 * @Service()
 * export class UserService {
 *     private readonly users: User[] = []
 *
 *     getUsers(): User[] {
 *         return this.users
 *     }
 * }
 *
 * // Service is instantiated as singleton on first access
 * const service = container.get(UserService)
 * ```
 */
export function Service(): <T extends Constructor>(target: T) => T {
    return function <T extends Constructor>(target: T): T {
        return target
    }
}

/**
 * Decorator to inject a service into a class property.
 *
 * Uses the global container to resolve and inject the service instance.
 * The service is lazily instantiated on first property access, providing
 * optimal performance and avoiding circular dependency issues.
 *
 * Supports both field decorators and accessor decorators (recommended).
 *
 * @typeParam T - The service type being injected
 * @param ServiceClass - The service class or token to inject
 * @returns A decorator that handles lazy service injection
 *
 * @example Using with accessor (recommended)
 * ```typescript
 * @Service()
 * export class UserController {
 *     @Inject(UserService)
 *     accessor userService!: UserService
 *
 *     getUsers() {
 *         return this.userService.getUsers()
 *     }
 * }
 * ```
 *
 * @example Using with field
 * ```typescript
 * @Service()
 * export class OrderService {
 *     @Inject(UserService)
 *     userService!: UserService
 * }
 * ```
 */
// deno-lint-ignore no-explicit-any
export function Inject<T>(ServiceClass: Constructor<T> | ServiceToken<T>): any {
    return function (
        _value: ClassAccessorDecoratorTarget<unknown, T> | undefined,
        context: ClassFieldDecoratorContext | ClassAccessorDecoratorContext,
    ): ClassAccessorDecoratorResult<unknown, T> | ((initialValue: T) => T) {
        if (context.kind === 'accessor') {
            // Accessor decorator - returns getter/setter pair
            return {
                get(this: Record<string, T>): T {
                    const cacheKey = `_${String(context.name)}_injected`
                    if (!this[cacheKey]) {
                        this[cacheKey] = container.get(ServiceClass) as T
                    }
                    return this[cacheKey]
                },
                set(this: Record<string, T>, newValue: T): void {
                    this[`_${String(context.name)}_injected`] = newValue
                },
            }
        } else {
            // Field decorator - returns initializer function
            return function (this: Record<string, T>, initialValue: T): T {
                const propertyKey = String(context.name)
                const cacheKey = `_${propertyKey}_injected`

                // Set up a getter on the instance for lazy resolution
                Object.defineProperty(this, propertyKey, {
                    get(): T {
                        if (!this[cacheKey]) {
                            this[cacheKey] = container.get(ServiceClass) as T
                        }
                        return this[cacheKey]
                    },
                    set(newValue: T): void {
                        this[cacheKey] = newValue
                    },
                    enumerable: true,
                    configurable: true,
                })

                return initialValue
            }
        }
    }
}

// =============================================================================
// Helper Functions
// =============================================================================

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
