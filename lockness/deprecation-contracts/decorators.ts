/**
 * @lockness/deprecation-contracts - Decorators
 * 
 * Expressive decorators to trigger deprecation notices on classes, 
 * methods, and accessors.
 */

import { triggerDeprecation } from './index.ts'

export interface DeprecationOptions {
    version: string
    message: string
    package?: string
}

/**
 * @Deprecated decorator
 * 
 * Mark a class, method, or accessor as deprecated.
 * A notice will be triggered when the decorated item is used.
 * 
 * @example
 * ```ts
 * @Deprecated('1.2.0', 'Use AuthService instead')
 * class OldService {}
 * ```
 */
// deno-lint-ignore no-explicit-any
export function Deprecated(version: string, message: string, pkg?: string): any
// deno-lint-ignore no-explicit-any
export function Deprecated(options: DeprecationOptions): any
// deno-lint-ignore no-explicit-any
export function Deprecated(arg1: string | DeprecationOptions, arg2?: string, arg3?: string): any {
    const options: DeprecationOptions = typeof arg1 === 'string'
        ? { version: arg1, message: arg2!, package: arg3 }
        : arg1

    return function (target: unknown, context: ClassDecoratorContext | ClassMethodDecoratorContext | ClassAccessorDecoratorContext) {
        const name = String(context.name)

        if (context.kind === 'class') {
            // deno-lint-ignore no-explicit-any
            const OriginalClass = target as any
            return class extends OriginalClass {
                // deno-lint-ignore no-explicit-any
                constructor(...args: any[]) {
                    triggerDeprecation(
                        options.package || 'app',
                        options.version,
                        options.message,
                    )
                    super(...args)
                }
            }
        }

        if (context.kind === 'method') {
            const originalMethod = target as (...args: unknown[]) => unknown
            return function (this: unknown, ...args: unknown[]) {
                triggerDeprecation(
                    options.package || 'app',
                    options.version,
                    `${name}() is deprecated. ${options.message}`,
                )
                return originalMethod.apply(this, args)
            }
        }

        if (context.kind === 'accessor') {
            const originalAccessor = target as { get: () => unknown; set: (value: unknown) => void }
            return {
                get(this: unknown) {
                    triggerDeprecation(
                        options.package || 'app',
                        options.version,
                        `Accessing deprecated property "${name}". ${options.message}`,
                    )
                    return originalAccessor.get.call(this)
                },
                set(this: unknown, value: unknown) {
                    triggerDeprecation(
                        options.package || 'app',
                        options.version,
                        `Setting deprecated property "${name}". ${options.message}`,
                    )
                    return originalAccessor.set.call(this, value)
                }
            }
        }

        return target
    }
}
