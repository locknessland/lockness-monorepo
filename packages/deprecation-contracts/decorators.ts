/**
 * @fileoverview Decorators for marking deprecated code.
 *
 * Provides the `@Deprecated` decorator to mark classes, methods, and accessors
 * as deprecated with automatic deprecation notices.
 *
 * @module @lockness/deprecation-contracts/decorators
 *
 * @example
 * ```ts
 * import { Deprecated } from '@lockness/deprecation-contracts'
 *
 * @Deprecated('1.2.0', 'Use NewService instead')
 * class OldService {}
 *
 * class MyService {
 *     @Deprecated('1.0.0', 'Use newMethod() instead')
 *     oldMethod() {}
 * }
 * ```
 */

import { triggerDeprecation } from './mod.ts'

// =============================================================================
// Types
// =============================================================================

/**
 * Options for the `@Deprecated` decorator.
 *
 * @example
 * ```typescript
 * const options: DeprecationOptions = {
 *     version: '1.2.0',
 *     message: 'Use NewService instead',
 *     package: 'my-package'
 * }
 *
 * @Deprecated(options)
 * class OldService {}
 * ```
 */
export interface DeprecationOptions {
    /**
     * The version when the deprecation was introduced.
     *
     * @example '1.2.0'
     */
    readonly version: string

    /**
     * The deprecation message explaining what to use instead.
     *
     * @example 'Use NewService instead'
     */
    readonly message: string

    /**
     * The package name. Defaults to 'app' if not provided.
     *
     * @example 'my-package'
     */
    readonly package?: string
}

// =============================================================================
// Decorator
// =============================================================================

/**
 * Decorator to mark a class, method, or accessor as deprecated.
 *
 * A deprecation notice will be triggered when the decorated item is used:
 * - **Class**: Notice triggered on instantiation
 * - **Method**: Notice triggered on method call
 * - **Accessor**: Notice triggered on property get/set
 *
 * @param version - The version when the deprecation was introduced
 * @param message - The deprecation message
 * @param pkg - Optional package name (defaults to 'app')
 * @returns A decorator function
 *
 * @example Mark a class as deprecated
 * ```typescript
 * @Deprecated('1.2.0', 'Use AuthService instead')
 * class OldAuthService {}
 *
 * new OldAuthService() // Triggers: Since app 1.2.0: Use AuthService instead
 * ```
 *
 * @example Mark a method as deprecated
 * ```typescript
 * class UserService {
 *     @Deprecated('2.0.0', 'Use findById() instead')
 *     getUser(id: string) { return this.findById(id) }
 * }
 * ```
 *
 * @example Mark an accessor as deprecated
 * ```typescript
 * class Config {
 *     @Deprecated('1.5.0', 'Use getApiKey() method instead')
 *     accessor apiKey = 'secret'
 * }
 * ```
 */
// deno-lint-ignore no-explicit-any
export function Deprecated(version: string, message: string, pkg?: string): any

/**
 * Decorator to mark a class, method, or accessor as deprecated.
 *
 * @param options - The deprecation options object
 * @returns A decorator function
 *
 * @example Using options object
 * ```typescript
 * @Deprecated({
 *     version: '1.2.0',
 *     message: 'Use AuthService instead',
 *     package: 'my-app'
 * })
 * class OldAuthService {}
 * ```
 */
// deno-lint-ignore no-explicit-any
export function Deprecated(options: DeprecationOptions): any

export function Deprecated(
    arg1: string | DeprecationOptions,
    arg2?: string,
    arg3?: string,
    // deno-lint-ignore no-explicit-any
): any {
    const options: DeprecationOptions = typeof arg1 === 'string'
        ? { version: arg1, message: arg2!, package: arg3 }
        : arg1

    return function (
        target: unknown,
        context:
            | ClassDecoratorContext
            | ClassMethodDecoratorContext
            | ClassAccessorDecoratorContext,
    ): unknown {
        const name = String(context.name)
        const packageName = options.package ?? 'app'

        if (context.kind === 'class') {
            // deno-lint-ignore no-explicit-any
            const OriginalClass = target as new (...args: any[]) => any
            return class extends OriginalClass {
                // deno-lint-ignore no-explicit-any
                constructor(...args: any[]) {
                    triggerDeprecation(
                        packageName,
                        options.version,
                        options.message,
                    )
                    super(...args)
                }
            }
        }

        if (context.kind === 'method') {
            const originalMethod = target as (...args: unknown[]) => unknown
            return function (this: unknown, ...args: unknown[]): unknown {
                triggerDeprecation(
                    packageName,
                    options.version,
                    `${name}() is deprecated. ${options.message}`,
                )
                return originalMethod.apply(this, args)
            }
        }

        if (context.kind === 'accessor') {
            const originalAccessor = target as ClassAccessorDecoratorTarget<
                unknown,
                unknown
            >
            return {
                get(this: unknown): unknown {
                    triggerDeprecation(
                        packageName,
                        options.version,
                        `Accessing deprecated property "${name}". ${options.message}`,
                    )
                    return originalAccessor.get.call(this)
                },
                set(this: unknown, value: unknown): void {
                    triggerDeprecation(
                        packageName,
                        options.version,
                        `Setting deprecated property "${name}". ${options.message}`,
                    )
                    originalAccessor.set.call(this, value)
                },
            } satisfies ClassAccessorDecoratorResult<unknown, unknown>
        }

        return target
    }
}
