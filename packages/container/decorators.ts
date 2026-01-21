/**
 * @fileoverview Decorators for dependency injection.
 *
 * Provides `@Service` and `@Inject` decorators for declarative
 * dependency injection in TypeScript classes.
 *
 * @module @lockness/container/decorators
 */

import { container } from './container.ts'
import type { Constructor, ServiceToken } from './types.ts'

/**
 * Decorator to mark a class as a Service.
 *
 * This is a marker decorator for documentation and IDE support.
 * The actual singleton behavior is handled by the Container when
 * the service is first resolved via `container.get()`.
 *
 * @returns A class decorator that returns the class unchanged
 *
 * @see {@link Container.get} for how services are resolved
 * @see {@link Inject} for property injection
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
 * @see {@link Service} for marking classes as services
 * @see {@link container} for the global container instance
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
        /** @internal Cache key for storing the injected instance */
        const cacheKeyPrefix = `_${String(context.name)}_injected`

        if (context.kind === 'accessor') {
            // Accessor decorator - returns getter/setter pair
            return {
                get(this: Record<string, T>): T {
                    if (!this[cacheKeyPrefix]) {
                        this[cacheKeyPrefix] = container.get(ServiceClass) as T
                    }
                    return this[cacheKeyPrefix]
                },
                set(this: Record<string, T>, newValue: T): void {
                    this[cacheKeyPrefix] = newValue
                },
            }
        } else {
            // Field decorator - returns initializer function
            return function (this: Record<string, T>, initialValue: T): T {
                const propertyKey = String(context.name)

                // Set up a getter on the instance for lazy resolution
                Object.defineProperty(this, propertyKey, {
                    get(): T {
                        if (!this[cacheKeyPrefix]) {
                            this[cacheKeyPrefix] = container.get(
                                ServiceClass,
                            ) as T
                        }
                        return this[cacheKeyPrefix]
                    },
                    set(newValue: T): void {
                        this[cacheKeyPrefix] = newValue
                    },
                    enumerable: true,
                    configurable: true,
                })

                return initialValue
            }
        }
    }
}
