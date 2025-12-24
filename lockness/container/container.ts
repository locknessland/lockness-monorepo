/**
 * Lockness Container - Lightweight Dependency Injection
 *
 * A simple yet powerful DI container for TypeScript/Deno applications.
 * Provides singleton management, constructor injection, and property injection decorators.
 */

// deno-lint-ignore-file no-explicit-any

/**
 * Dependency Injection Container
 *
 * Manages service instances with automatic singleton creation.
 * Services are lazily instantiated on first access.
 */
export class Container {
    private services = new Map<any, any>()

    /**
     * Get or create an instance of a service
     *
     * If the service doesn't exist, it will be automatically instantiated
     * and cached for future requests (singleton pattern).
     *
     * @param ServiceClass - The class to instantiate
     * @returns The singleton instance of the service
     *
     * @example
     * ```typescript
     * const userService = container.get(UserService)
     * ```
     */
    get<T>(ServiceClass: any): T {
        if (!this.services.has(ServiceClass)) {
            this.services.set(ServiceClass, new ServiceClass())
        }
        return this.services.get(ServiceClass)
    }

    /**
     * Manually register a service instance
     *
     * Use this to register pre-configured instances or to override
     * the default instantiation behavior.
     *
     * @param token - The token (usually a class) to register
     * @param instance - The instance to register
     *
     * @example
     * ```typescript
     * const config = new Config({ apiKey: 'secret' })
     * container.set(Config, config)
     * ```
     */
    set(token: any, instance: any): void {
        this.services.set(token, instance)
    }

    /**
     * Check if a service is registered
     *
     * @param token - The token to check
     * @returns True if the service exists
     *
     * @example
     * ```typescript
     * if (container.has(UserService)) {
     *     // service is registered
     * }
     * ```
     */
    has(token: any): boolean {
        return this.services.has(token)
    }

    /**
     * Remove a service from the container
     *
     * @param token - The token to remove
     * @returns True if the service was removed
     *
     * @example
     * ```typescript
     * container.delete(UserService)
     * ```
     */
    delete(token: any): boolean {
        return this.services.delete(token)
    }

    /**
     * Clear all services from the container
     *
     * Useful for testing or resetting application state.
     *
     * @example
     * ```typescript
     * container.clear()
     * ```
     */
    clear(): void {
        this.services.clear()
    }

    /**
     * Get the number of registered services
     *
     * @returns The number of services
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
 * Decorator to mark a class as a Service
 *
 * This is a marker decorator for documentation purposes.
 * The actual singleton behavior is handled by the Container.
 *
 * @example
 * ```typescript
 * @Service()
 * export class UserService {
 *     getUsers() {
 *         return []
 *     }
 * }
 * ```
 */
export function Service(): <T extends new (...args: any[]) => any>(
    target: T,
) => T {
    return function <T extends new (...args: any[]) => any>(target: T): T {
        return target
    }
}

/**
 * Decorator to inject a service into a property
 *
 * Uses the global container to resolve and inject the service.
 * The service is lazily instantiated on first property access.
 *
 * @param ServiceClass - The service class to inject
 * @returns PropertyDecorator
 *
 * @example
 * ```typescript
 * @Service()
 * export class UserController {
 *     @Inject(UserService)
 *     userService!: UserService
 *
 *     getUsers() {
 *         return this.userService.getUsers()
 *     }
 * }
 * ```
 */
export function Inject(ServiceClass: unknown): any {
    return function (_value: any, context: ClassFieldDecoratorContext | ClassAccessorDecoratorContext) {
        if (context.kind === 'accessor') {
            // Accessor decorator
            return {
                get(this: any) {
                    const cacheKey = `_${String(context.name)}_injected`
                    if (!this[cacheKey]) {
                        this[cacheKey] = container.get(ServiceClass)
                    }
                    return this[cacheKey]
                },
                set(this: any, newValue: any) {
                    this[`_${String(context.name)}_injected`] = newValue
                },
            }
        } else {
            // Field decorator
            return function (this: any, initialValue: any) {
                const propertyKey = String(context.name)
                const cacheKey = `_${propertyKey}_injected`

                // Set up a getter on the instance
                Object.defineProperty(this, propertyKey, {
                    get() {
                        if (!this[cacheKey]) {
                            this[cacheKey] = container.get(ServiceClass)
                        }
                        return this[cacheKey]
                    },
                    set(newValue: any) {
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
 * Create a new isolated container instance
 *
 * Useful for testing or when you need multiple container contexts.
 *
 * @returns A new Container instance
 *
 * @example
 * ```typescript
 * const testContainer = createContainer()
 * testContainer.set(Config, mockConfig)
 * ```
 */
export function createContainer(): Container {
    return new Container()
}

/**
 * Bind a service to the global container
 *
 * Helper function for registering services.
 *
 * @param ServiceClass - The service class
 * @param instance - Optional pre-created instance
 *
 * @example
 * ```typescript
 * bind(UserService)
 * bind(Config, new Config({ apiKey: 'secret' }))
 * ```
 */
export function bind<T>(
    ServiceClass: new (...args: any[]) => T,
    instance?: T,
): void {
    if (instance) {
        container.set(ServiceClass, instance)
    } else {
        // Pre-register to ensure singleton
        container.get(ServiceClass)
    }
}

/**
 * Resolve a service from the global container
 *
 * Alias for container.get() for a more fluent API.
 *
 * @param ServiceClass - The service class to resolve
 * @returns The service instance
 *
 * @example
 * ```typescript
 * const userService = resolve(UserService)
 * ```
 */
export function resolve<T>(ServiceClass: new (...args: any[]) => T): T {
    return container.get<T>(ServiceClass)
}
