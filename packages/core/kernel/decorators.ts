/**
 * @fileoverview Boot lifecycle decorators for Lockness kernel.
 *
 * This module provides decorators for organizing application initialization logic:
 * - `@OnBoot` - Mark methods to be executed during kernel bootstrap with priority ordering
 *
 * @module @lockness/core/kernel/decorators
 * @since 0.1.27
 *
 * @example Basic usage
 * ```typescript
 * import { OnBoot, runBootHooks, App } from '@lockness/core'
 *
 * class AppKernel {
 *     @OnBoot({ priority: 100 })
 *     async connectDatabase(app: App) {
 *         await db.connect()
 *     }
 *
 *     @OnBoot({ priority: 50 })
 *     async seedData(app: App) {
 *         await runSeeders()
 *     }
 * }
 *
 * // Execute boot hooks
 * const kernel = new AppKernel()
 * const app = new App()
 * await runBootHooks(kernel, app)
 * ```
 */

/**
 * Type for a boot hook method.
 * Must be an async or sync function that receives the App instance.
 *
 * @template TApp - The App type (defaults to object for flexibility)
 */
export type BootHookMethod<TApp = object> = (app: TApp) => void | Promise<void>

/**
 * Boot hook metadata stored on kernel class.
 * Contains information about the decorated method and its execution priority.
 */
export interface BootHookMeta {
    /** Method name to execute */
    readonly method: string
    /** Execution priority (higher values execute first) */
    readonly priority: number
}

/**
 * Type for a class constructor that may have boot hooks registered.
 * Used internally to access the KERNEL_BOOT_HOOKS symbol property.
 */
export interface BootHooksContainer {
    [KERNEL_BOOT_HOOKS]?: BootHookMeta[]
}

/**
 * Symbol to store boot hooks on kernel class.
 * Used as a private property key to avoid conflicts with user-defined properties.
 *
 * @internal
 */
export const KERNEL_BOOT_HOOKS: unique symbol = Symbol('kernel:bootHooks')

/**
 * Configuration options for the @OnBoot decorator.
 */
export interface OnBootOptions {
    /**
     * Execution priority. Higher values execute first.
     *
     * Methods with higher priority values are executed before those with lower values.
     * Methods with equal priority maintain their registration order.
     *
     * @default 0
     *
     * @remarks
     * Recommended priority ranges:
     * | Range   | Use Case                                        |
     * |---------|-------------------------------------------------|
     * | 100+    | Critical infrastructure (database, cache)       |
     * | 50-99   | Data initialization (seeders, migrations)        |
     * | 20-49   | Service registration (tasks, event listeners)    |
     * | 0-19    | Final setup (logging, metrics, notifications)    |
     *
     * @example
     * ```typescript
     * class Kernel {
     *     @OnBoot({ priority: 100 }) // Runs first
     *     async database(app: App) { }
     *
     *     @OnBoot({ priority: 50 })  // Runs second
     *     async cache(app: App) { }
     *
     *     @OnBoot()                  // Runs last (priority: 0)
     *     async logging(app: App) { }
     * }
     * ```
     */
    priority?: number
}

/**
 * Mark a method to be executed during kernel bootstrap.
 *
 * Methods decorated with `@OnBoot` are collected and executed in priority order
 * (highest first) during application initialization via `runBootHooks()`.
 * Each method receives the `App` instance as its first parameter.
 *
 * This decorator uses TC39 Stage 3 decorators natively supported by Deno 2+.
 * No `experimentalDecorators` flag is needed.
 *
 * @param options - Configuration options for the boot hook
 * @returns A method decorator function
 *
 * @throws {Error} If applied to a non-method (class, field, accessor)
 *
 * @see {@link runBootHooks} - Execute all registered boot hooks
 * @see {@link getBootHooks} - Retrieve boot hook metadata
 * @since 0.1.27
 *
 * @example Priority-based initialization
 * ```typescript
 * import { OnBoot, runBootHooks, App } from '@lockness/core'
 * import { container } from '@lockness/container'
 * import { Database } from '@lockness/drizzle'
 *
 * class AppKernel {
 *     @OnBoot({ priority: 100 })
 *     async connectDatabase(app: App) {
 *         const db = container.get<Database>(Database)
 *         await db.connect(Deno.env.get('DATABASE_URL')!)
 *         console.log('✅ Database connected')
 *     }
 *
 *     @OnBoot({ priority: 50 })
 *     async seedData(app: App) {
 *         if (app.isDevelopment) {
 *             await runSeeders()
 *             console.log('🌱 Database seeded')
 *         }
 *     }
 *
 *     @OnBoot() // priority: 0 (default)
 *     async logStartup(app: App) {
 *         console.log('🚀 Application started')
 *     }
 * }
 *
 * // Usage
 * const kernel = new AppKernel()
 * const app = new App()
 * await runBootHooks(kernel, app)
 * ```
 *
 * @example Conditional execution based on environment
 * ```typescript
 * class AppKernel {
 *     @OnBoot({ priority: 30 })
 *     async setupDevTools(app: App) {
 *         if (app.isDevelopment) {
 *             enableDevtools(app)
 *             console.log('🔧 Devtools enabled')
 *         }
 *     }
 * }
 * ```
 */
export function OnBoot(
    options: OnBootOptions = {},
): <This, Args extends [app: object, ...rest: unknown[]], Return>(
    originalMethod: (this: This, ...args: Args) => Return,
    context: ClassMethodDecoratorContext<
        This,
        (this: This, ...args: Args) => Return
    >,
) => (this: This, ...args: Args) => Return {
    return function <
        This,
        Args extends [app: object, ...rest: unknown[]],
        Return,
    >(
        originalMethod: (this: This, ...args: Args) => Return,
        context: ClassMethodDecoratorContext<
            This,
            (this: This, ...args: Args) => Return
        >,
    ): (this: This, ...args: Args) => Return {
        // Validate decorator is applied to a method
        if (context.kind !== 'method') {
            throw new Error(
                `@OnBoot can only decorate methods, received: ${context.kind}`,
            )
        }

        const methodName = String(context.name)
        const priority = options.priority ?? 0

        // Use addInitializer to register hooks when class is instantiated
        // This runs after the class definition is complete
        context.addInitializer(function () {
            const instance = this as object
            const constructor =
                (instance as { constructor: BootHooksContainer })
                    .constructor

            // Initialize hooks array if this is the first @OnBoot decorator
            if (!constructor[KERNEL_BOOT_HOOKS]) {
                constructor[KERNEL_BOOT_HOOKS] = []
            }

            // Check if this hook is already registered (avoid duplicates on multiple instantiations)
            const hooks = constructor[KERNEL_BOOT_HOOKS]!
            const alreadyRegistered = hooks.some((h) => h.method === methodName)
            if (!alreadyRegistered) {
                hooks.push({
                    method: methodName,
                    priority,
                })
            }
        })

        return originalMethod
    }
}
