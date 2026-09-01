/**
 * @fileoverview Kernel loader for bootstrapping Lockness applications.
 *
 * This module provides the `createApp()` function that reads metadata from
 * a `@Kernel` decorated class and bootstraps the application accordingly.
 *
 * @module @lockness/core/kernel/loader
 * @since 0.1.28
 *
 * @example
 * ```typescript
 * import { Kernel, createApp } from '@lockness/core'
 *
 * @Kernel({
 *     database: { url: Deno.env.get('DATABASE_URL') },
 *     session: { driver: 'cookie' },
 *     devtools: true,
 *     controllersDir: './app/controller',
 * })
 * class AppKernel {
 *     @DeclareGlobalMiddleware()
 *     globalMiddlewares = [sessionMiddleware()]
 * }
 *
 * const app = await createApp(AppKernel)
 * app.listen(8888)
 * ```
 */

import type { App } from '../app.ts'
import {
    KERNEL_CONFIG,
    KERNEL_GLOBAL_MIDDLEWARE,
    type KernelConfig,
} from './kernel_decorators.ts'
import { type BootHookMeta, KERNEL_BOOT_HOOKS } from './decorators.ts'
import {
    KERNEL_SHUTDOWN_HOOKS,
    type ShutdownHookMeta,
} from './shutdown_decorators.ts'
import type { BootstrapContext } from './bootstrap/types.ts'
import { runBootstrapSteps } from './bootstrap/registry.ts'

/**
 * Create and bootstrap an App from a decorated Kernel class.
 *
 * This function reads the `@Kernel` configuration metadata and:
 * 1. Connects to the database (if configured)
 * 2. Sets up session management (if configured)
 * 3. Creates an App instance
 * 4. Enables devtools (if configured and in development)
 * 5. Registers global middlewares
 * 6. Executes boot hooks (from @OnBoot decorators)
 * 7. Auto-discovers named middlewares (if middlewaresDir configured)
 * 8. Initializes the app with controllers and static files
 * 9. Collects routes for devtools (if enabled and in development)
 *
 * @template T - The kernel class type
 * @param KernelClass - Kernel class decorated with @Kernel
 * @returns Promise resolving to the bootstrapped App instance
 *
 * @throws {Error} If database connection fails
 * @throws {Error} If required dependencies are missing
 *
 * @see {@link Kernel} - Kernel configuration decorator
 * @see {@link DeclareGlobalMiddleware} - Global middleware declaration
 * @see {@link OnBoot} - Boot hook decorator
 * @since 0.1.28
 *
 * @example Basic usage
 * ```typescript
 * @Kernel({
 *     controllersDir: './app/controller',
 *     staticDir: 'public',
 * })
 * class AppKernel {
 *     @DeclareGlobalMiddleware()
 *     globalMiddlewares = [LoggerMiddleware]
 * }
 *
 * const app = await createApp(AppKernel)
 * app.listen(8888)
 * ```
 *
 * @example With database and session
 * ```typescript
 * @Kernel({
 *     database: { url: Deno.env.get('DATABASE_URL') },
 *     session: { driver: 'cookie', lifetime: 7200 },
 *     devtools: true,
 *     controllersDir: './app/controller',
 * })
 * class AppKernel {
 *     @DeclareGlobalMiddleware()
 *     globalMiddlewares = [
 *         sessionMiddleware(),
 *         LoggerMiddleware,
 *     ]
 * }
 *
 * const app = await createApp(AppKernel)
 * app.listen(8888)
 * ```
 *
 * @example With boot hooks
 * ```typescript
 * @Kernel({ devtools: true })
 * class AppKernel {
 *     @DeclareGlobalMiddleware()
 *     globalMiddlewares = [LoggerMiddleware]
 *
 *     @OnBoot({ priority: 100 })
 *     async connectDatabase(app: App) {
 *         console.log('Connecting to database...')
 *         // Custom database setup
 *     }
 *
 *     @OnBoot({ priority: 50 })
 *     async seedData(app: App) {
 *         if (app.isDevelopment) {
 *             console.log('Seeding database...')
 *         }
 *     }
 * }
 *
 * const app = await createApp(AppKernel)
 * app.listen(8888)
 * ```
 */
export async function createApp<T>(KernelClass: new () => T): Promise<App> {
    // Read @Kernel config (stored at class decoration time)
    const config: KernelConfig = (KernelClass as any)[KERNEL_CONFIG] ?? {}

    // Instantiate kernel FIRST to trigger addInitializer callbacks
    // (this populates KERNEL_GLOBAL_MIDDLEWARE and KERNEL_BOOT_HOOKS)
    const kernel = new KernelClass()

    // Now read metadata that was set by addInitializer
    const globalMiddlewareProp = (KernelClass as any)[
        KERNEL_GLOBAL_MIDDLEWARE
    ]
    const bootHooks: BootHookMeta[] = (KernelClass as any)[
        KERNEL_BOOT_HOOKS
    ] ?? []

    // Read alongside bootHooks, from the same addInitializer pass.
    const shutdownHooks: ShutdownHookMeta[] = (KernelClass as any)[
        KERNEL_SHUTDOWN_HOOKS
    ] ?? []

    // Build bootstrap context
    const context: BootstrapContext = {
        config,
        kernel,
        KernelClass,
        globalMiddlewareProp,
        bootHooks,
        shutdownHooks,
    }

    // Run bootstrap steps sequentially
    await runBootstrapSteps(context)

    // App instance is created and initialized by bootstrap steps
    if (!context.app) {
        throw new Error('Bootstrap failed: App instance not created')
    }

    return context.app
}
