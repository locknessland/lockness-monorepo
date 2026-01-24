/**
 * @fileoverview Boot hook execution utilities for Lockness kernel.
 *
 * This module provides utilities for running @OnBoot decorated methods:
 * - `runBootHooks()` - Execute all boot hooks in priority order
 * - `getBootHooks()` - Introspect registered boot hooks
 *
 * @module @lockness/core/kernel/boot_runner
 * @since 0.1.27
 *
 * @example
 * ```typescript
 * import { OnBoot, runBootHooks, App } from '@lockness/core'
 *
 * class AppKernel {
 *     @OnBoot({ priority: 100 })
 *     async connectDb(app: App) {
 *         await db.connect()
 *     }
 * }
 *
 * const kernel = new AppKernel()
 * const app = new App()
 * await runBootHooks(kernel, app)
 * ```
 */

import {
    type BootHookMeta,
    type BootHooksContainer,
    KERNEL_BOOT_HOOKS,
} from './decorators.ts'

/**
 * Type constraint for a valid boot hook method.
 * The method must accept an app-like object and return void or Promise<void>.
 *
 * @template TApp - The App type
 */
type BootHookFn<TApp = object> = (app: TApp) => void | Promise<void>

/**
 * Type constraint for objects that can have boot hooks.
 * Requires a constructor that implements BootHooksContainer.
 *
 * @template TApp - The App type used by boot hook methods
 */
interface KernelInstance<TApp = object> {
    constructor: BootHooksContainer
    [key: string]: BootHookFn<TApp> | unknown
}

/**
 * Type for a kernel class constructor.
 */
type KernelConstructor<T = object> =
    & (new (...args: never[]) => T)
    & BootHooksContainer

/**
 * Run all @OnBoot hooks from a kernel instance.
 *
 * This function discovers all methods decorated with `@OnBoot` on the given
 * kernel instance, sorts them by priority (highest first), and executes
 * them sequentially, passing the `App` instance to each method.
 *
 * Hooks are always executed sequentially, even if they are async. This ensures
 * predictable initialization order and allows later hooks to depend on earlier ones.
 *
 * @template T - The kernel instance type
 * @param kernel - Kernel instance with @OnBoot decorated methods
 * @param app - App instance to pass to boot hooks
 * @returns Promise that resolves when all hooks have executed
 *
 * @throws Will rethrow any error thrown by a boot hook, stopping execution of remaining hooks
 *
 * @see {@link OnBoot} - Decorator to mark boot hook methods
 * @see {@link getBootHooks} - Retrieve boot hook metadata
 * @since 0.1.27
 *
 * @example Basic usage
 * ```typescript
 * import { OnBoot, runBootHooks, App } from '@lockness/core'
 *
 * class AppKernel {
 *     @OnBoot({ priority: 100 })
 *     async connectDb(app: App) {
 *         await db.connect()
 *     }
 *
 *     @OnBoot({ priority: 50 })
 *     async seedData(app: App) {
 *         await runSeeders()
 *     }
 * }
 *
 * const kernel = new AppKernel()
 * const app = new App()
 * await runBootHooks(kernel, app)
 * ```
 *
 * @example Error handling
 * ```typescript
 * try {
 *     await runBootHooks(kernel, app)
 *     console.log('✅ Boot complete')
 * } catch (error) {
 *     console.error('❌ Boot failed:', error)
 *     Deno.exit(1)
 * }
 * ```
 *
 * @example With traditional bootstrap function
 * ```typescript
 * export const bootstrap = async (): Promise<App> => {
 *     const app = new App()
 *     await runBootHooks(new AppKernel(), app)
 *     return app
 * }
 * ```
 */
export async function runBootHooks<TKernel extends object, TApp extends object>(
    kernel: TKernel,
    app: TApp,
): Promise<void> {
    const instance = kernel as KernelInstance<TApp>
    const constructor = instance.constructor
    const hooks: BootHookMeta[] = constructor[KERNEL_BOOT_HOOKS] ?? []

    // Sort by priority (highest first)
    const sortedHooks = [...hooks].sort((a, b) => b.priority - a.priority)

    // Execute hooks sequentially, awaiting each one
    for (const hook of sortedHooks) {
        const method = instance[hook.method]
        if (typeof method === 'function') {
            await (method as BootHookFn<TApp>).call(kernel, app)
        }
    }
}

/**
 * Get all registered boot hooks from a kernel class or instance.
 *
 * This function returns the list of boot hooks registered on a kernel
 * class or instance, sorted by their registration order (not priority).
 * Useful for introspection, debugging, and testing.
 *
 * @template T - The kernel type
 * @param kernelOrClass - Kernel instance or class constructor
 * @returns Array of boot hook metadata (method name and priority)
 *
 * @remarks
 * The returned array is NOT sorted by priority. To get execution order,
 * sort by priority descending: `hooks.sort((a, b) => b.priority - a.priority)`
 *
 * @see {@link OnBoot} - Decorator to mark boot hook methods
 * @see {@link runBootHooks} - Execute all registered boot hooks
 * @since 0.1.27
 *
 * @example Get hooks from class constructor
 * ```typescript
 * const hooks = getBootHooks(AppKernel)
 * console.log(`Found ${hooks.length} boot hooks`)
 *
 * hooks.forEach(hook => {
 *     console.log(`  ${hook.method} (priority: ${hook.priority})`)
 * })
 * ```
 *
 * @example Get hooks from instance
 * ```typescript
 * const kernel = new AppKernel()
 * const hooks = getBootHooks(kernel)
 * ```
 *
 * @example Get execution order
 * ```typescript
 * const hooks = getBootHooks(AppKernel)
 *     .sort((a, b) => b.priority - a.priority)
 *
 * console.log('Execution order:')
 * hooks.forEach((hook, i) => {
 *     console.log(`  ${i + 1}. ${hook.method}`)
 * })
 * ```
 */
export function getBootHooks<T extends object>(
    kernelOrClass: T | KernelConstructor<T>,
): readonly BootHookMeta[] {
    const constructor: BootHooksContainer = typeof kernelOrClass === 'function'
        ? (kernelOrClass as KernelConstructor<T>)
        : (kernelOrClass as KernelInstance).constructor

    return constructor[KERNEL_BOOT_HOOKS] ?? []
}
