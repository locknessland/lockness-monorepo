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

import { App } from '../app.ts'
import { container } from '@lockness/container'
import {
    KERNEL_CONFIG,
    KERNEL_GLOBAL_MIDDLEWARE,
    type KernelConfig,
} from './kernel_decorators.ts'
import { type BootHookMeta, KERNEL_BOOT_HOOKS } from './decorators.ts'
import { discoverMiddlewares } from '../http/resolver.ts'
import type { ControllerClass } from '../types.ts'

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

    // Step 1: Database connection
    if (config.database) {
        try {
            const drizzleModule = await import('@lockness/drizzle')
            const Database = drizzleModule.Database
            const db = container.get(Database)

            // Determine connection URL
            let url: string | undefined
            if (typeof config.database === 'object' && config.database.url) {
                url = config.database.url
            } else {
                url = Deno.env.get('DATABASE_URL')
            }

            // Connect if URL is available
            if (url) {
                await db.connect(url)
            }
        } catch (error) {
            // Database package not installed - skip database setup
            if (
                error instanceof TypeError &&
                error.message.includes('Cannot resolve')
            ) {
                console.warn(
                    '⚠️ @lockness/drizzle not found - skipping database setup',
                )
            } else {
                // Re-throw other errors (e.g., connection failures)
                throw error
            }
        }
    }

    // Step 2: Session configuration
    if (config.session) {
        try {
            const { configureSession } = await import('@lockness/session')

            // Determine session config
            const sessionConfig = typeof config.session === 'object'
                ? config.session
                : {}

            configureSession({
                driver: sessionConfig.driver ?? 'cookie',
                secret: sessionConfig.secret ?? Deno.env.get('APP_KEY') ??
                    'change-me-in-production',
                lifetime: sessionConfig.lifetime ?? 7200,
                secure: sessionConfig.secure ??
                    (Deno.env.get('APP_ENV') === 'production'),
            })
        } catch (error) {
            // Session package not installed - skip session setup
            if (
                error instanceof TypeError &&
                error.message.includes('Cannot resolve')
            ) {
                console.warn(
                    '⚠️ @lockness/session not found - skipping session setup',
                )
            } else {
                throw error
            }
        }
    }

    // Step 2.5: Cache configuration
    if (config.cache) {
        try {
            const { configureCache } = await import('@lockness/cache')

            // Determine cache config
            const cacheConfig = typeof config.cache === 'object'
                ? config.cache
                : {}

            configureCache({
                driver: cacheConfig.driver ?? 'memory',
                ttl: cacheConfig.ttl ?? 3600,
                prefix: cacheConfig.prefix ?? 'lockness',
                kvPath: cacheConfig.kvPath,
            })
        } catch (error) {
            // Cache package not installed - skip cache setup
            if (
                error instanceof TypeError &&
                error.message.includes('Cannot resolve')
            ) {
                console.warn(
                    '⚠️ @lockness/cache not found - skipping cache setup',
                )
            } else {
                throw error
            }
        }
    }

    // Step 3: Create App instance
    const app = new App()

    // Step 4: Enable devtools in development
    if (config.devtools && app.isDevelopment) {
        try {
            const { enableDevtools } = await import('@lockness/devtools')
            enableDevtools(app.getHono())
        } catch (error) {
            // Devtools package not installed - skip devtools setup
            if (
                error instanceof TypeError &&
                error.message.includes('Cannot resolve')
            ) {
                console.warn(
                    '⚠️ @lockness/devtools not found - skipping devtools setup',
                )
            } else {
                throw error
            }
        }
    }

    // Step 5: Register global middlewares
    if (globalMiddlewareProp && (kernel as any)[globalMiddlewareProp]) {
        const middlewares = (kernel as any)[globalMiddlewareProp]
        if (Array.isArray(middlewares) && middlewares.length > 0) {
            app.useMiddleware(...middlewares)
        }
    }

    // Step 6: Run boot hooks (sorted by priority - highest first)
    if (bootHooks.length > 0) {
        const sortedHooks = [...bootHooks].sort((a, b) =>
            b.priority - a.priority
        )
        for (const hook of sortedHooks) {
            const method = (kernel as any)[hook.method]
            if (typeof method === 'function') {
                await method.call(kernel, app)
            }
        }
    }

    // Step 7: Auto-discover named middlewares from middlewaresDir
    if (config.middlewaresDir) {
        await discoverMiddlewares(config.middlewaresDir)
    }

    // Step 7.5: Register event listeners
    // - Auto-discover from listenersDir (default: ./app/listener)
    // - Register explicit event listener classes from config.listeners
    try {
        const { discoverListeners, registerListeners } = await import(
            '../events/listener_discovery.ts'
        )

        // Auto-discover from directory
        const listenersDir = config.listenersDir ?? './app/listener'
        await discoverListeners(listenersDir)

        // Register explicit listener classes (from packages or production builds)
        if (config.listeners && config.listeners.length > 0) {
            const count = registerListeners(
                config.listeners as Parameters<typeof registerListeners>[0],
            )
            if (count > 0) {
                console.log(
                    `✓ Registered ${count} explicit event listener(s)`,
                )
            }
        }
    } catch (error) {
        // Silently skip if directory doesn't exist or events package not available
        if (
            error instanceof Deno.errors.NotFound ||
            (error instanceof TypeError &&
                error.message.includes('Cannot resolve'))
        ) {
            // Expected conditions - no action needed
        } else {
            // Log unexpected errors but continue bootstrap
            console.error('⚠️  Error discovering listeners:', error)
        }
    }

    // Step 8: Emit KernelBooted event
    try {
        const { dispatcher, KernelBooted } = await import('@lockness/events')
        await dispatcher().emit(
            new KernelBooted(
                Deno.env.get('APP_NAME') ?? 'Lockness',
                Deno.env.get('APP_ENV') ?? 'development',
            ),
        )
    } catch (error) {
        // Events package not available - silently skip
        if (
            error instanceof TypeError &&
            error.message.includes('Cannot resolve')
        ) {
            // Expected - events package not installed
        } else {
            // Log unexpected errors but continue
            console.error('⚠️  Error emitting KernelBooted event:', error)
        }
    }

    // Step 9: Initialize app with controllers and static files
    await app.init({
        controllersDir: app.isDevelopment ? config.controllersDir : undefined,
        controllers: app.isDevelopment
            ? undefined
            : (config.controllers as ControllerClass[] | undefined),
        staticDir: config.staticDir,
        middlewaresDir: config.middlewaresDir,
        mountPoint: config.mountPoint,
    })

    // Step 9: Collect routes for devtools (after app.init)
    if (config.devtools && app.isDevelopment) {
        try {
            const { collectAppRoutes } = await import('@lockness/devtools')
            collectAppRoutes(app)
        } catch (_error) {
            // Devtools package not installed - already warned above
        }
    }

    return app
}
