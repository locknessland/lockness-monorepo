/**
 * @fileoverview Kernel configuration decorators for Lockness framework.
 *
 * This module provides declarative application configuration via the `@Kernel` decorator:
 * - `@Kernel(config)` - Marks a class as the application kernel with configuration
 * - `@DeclareGlobalMiddleware()` - Marks a property as the global middleware list
 *
 * @module @lockness/core/kernel/kernel_decorators
 * @since 0.1.28
 *
 * @example Basic usage
 * ```typescript
 * import { Kernel, DeclareGlobalMiddleware, createApp } from '@lockness/core'
 *
 * @Kernel({
 *     database: { url: Deno.env.get('DATABASE_URL') },
 *     session: { driver: 'cookie', lifetime: 7200 },
 *     devtools: true,
 *     staticDir: 'public',
 *     controllersDir: './app/controller',
 *     middlewaresDir: './app/middleware',
 * })
 * export class AppKernel {
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
 */

import type { CompileConfig, MountPoint } from '../types.ts'

/**
 * Database configuration options
 */
export interface DatabaseConfig {
    /**
     * Database connection URL
     * @example 'postgres://localhost:5432/mydb'
     */
    url?: string

    /**
     * Whether to automatically connect on startup
     * @default true
     */
    autoConnect?: boolean
}

/**
 * Session configuration options
 */
export interface SessionConfig {
    /**
     * Session storage driver
     * @default 'cookie'
     */
    driver?: 'cookie' | 'deno-kv' | 'memory'

    /**
     * Secret key for session encryption/signing
     * @default Deno.env.get('APP_KEY')
     */
    secret?: string

    /**
     * Session lifetime in seconds
     * @default 7200 (2 hours)
     */
    lifetime?: number

    /**
     * Whether to use secure cookies (HTTPS only)
     * @default true in production
     */
    secure?: boolean
}

/**
 * Cache configuration options
 */
export interface CacheConfig {
    /**
     * Cache storage driver
     * @default 'memory'
     */
    driver?: 'memory' | 'deno-kv' | 'redis'

    /**
     * Default time-to-live in seconds
     * @default 3600 (1 hour)
     */
    ttl?: number

    /**
     * Path to the Deno KV database file (for 'deno-kv' driver)
     */
    kvPath?: string

    /**
     * Prefix for all cache keys
     * @default 'lockness'
     */
    prefix?: string
}

/**
 * Shutdown lifecycle configuration options.
 *
 * A **named exported interface**, like {@link DatabaseConfig},
 * {@link SessionConfig} and {@link CacheConfig} beside it — not an inline
 * literal on {@link KernelConfig}. An inline shape gives a consumer building
 * configuration programmatically nothing to import, so the first one that tries
 * declares its own copy and the two drift.
 *
 * @since 0.2.1
 *
 * @example Keep today's behaviour exactly
 * ```typescript
 * @Kernel({ shutdown: { signals: false } })
 * class AppKernel {}
 * ```
 *
 * @example Give teardown longer
 * ```typescript
 * @Kernel({ shutdown: { deadlineMs: 20_000 } })
 * class AppKernel {}
 * ```
 */
export interface ShutdownConfig {
    /**
     * Whether `App.listen()` installs `SIGINT` and `SIGTERM` handlers.
     *
     * **Unset means on** — the strict value, so the behaviour is safe by
     * default rather than by remembering to opt in.
     *
     * Set it to `false` when the application already installs its own signal
     * handlers and you want today's behaviour unchanged. That matters more than
     * it sounds: both handlers would otherwise run *concurrently*, and the
     * first to reach `Deno.exit` ends the process — so a hand-written handler
     * that flushes a buffer or releases a lock can be cut short mid-drain.
     *
     * @default true
     */
    signals?: boolean

    /**
     * How long the whole shutdown sequence may take, in milliseconds.
     *
     * Bounds the server drain **and** the hooks together, not each separately.
     * Must be a finite integer in `[1, 2**31 - 1]`; anything else fails the
     * boot rather than being silently accepted, because `setTimeout` clamps
     * `NaN`, `Infinity`, `0` and any value at or above `2**31` to **1 ms** —
     * which would turn this bound into its own opposite without saying so.
     *
     * @default 10000
     */
    deadlineMs?: number
}

/**
 * Kernel configuration options
 */
export interface KernelConfig {
    /**
     * Database configuration
     * - `boolean`: Enable with default settings
     * - `DatabaseConfig`: Custom database configuration
     * - `undefined`: Skip database setup
     *
     * @example
     * ```typescript
     * // Enable with environment URL
     * database: { url: Deno.env.get('DATABASE_URL') }
     *
     * // Enable with defaults (reads DATABASE_URL from env)
     * database: true
     *
     * // Disable database
     * database: undefined
     * ```
     */
    database?: DatabaseConfig | boolean

    /**
     * Session configuration
     * - `boolean`: Enable with default settings
     * - `SessionConfig`: Custom session configuration
     * - `undefined`: Skip session setup
     *
     * @example
     * ```typescript
     * // Custom configuration
     * session: { driver: 'cookie', lifetime: 3600, secure: true }
     *
     * // Enable with defaults
     * session: true
     *
     * // Disable sessions
     * session: undefined
     * ```
     */
    session?: SessionConfig | boolean

    /**
     * Cache configuration
     * - `boolean`: Enable with default settings (memory)
     * - `CacheConfig`: Custom cache configuration
     * - `undefined`: Skip cache setup
     *
     * @example
     * ```typescript
     * // Custom configuration
     * cache: { driver: 'deno-kv', ttl: 86400 }
     *
     * // Enable with defaults (memory)
     * cache: true
     *
     * // Disable cache
     * cache: undefined
     * ```
     */
    cache?: CacheConfig | boolean

    /**
     * Shutdown lifecycle configuration.
     *
     * Omit it and the framework installs `SIGINT`/`SIGTERM` handlers and bounds
     * teardown at 10 seconds — the defaults every application wants. See
     * {@link ShutdownConfig}.
     *
     * @example
     * ```typescript
     * shutdown: { deadlineMs: 20_000 }
     * ```
     */
    shutdown?: ShutdownConfig

    /**
     * Enable devtools in development
     * @default false
     */
    devtools?: boolean

    /**
     * Static files directory
     * @example 'public'
     */
    staticDir?: string

    /**
     * Controllers directory for auto-discovery (development mode)
     * @example './app/controller'
     */
    controllersDir?: string

    /**
     * Explicit controller list (production mode)
     * Use with compiled applications for static imports
     */
    controllers?: unknown[]

    /**
     * Middlewares directory for auto-discovery
     * Scans for classes decorated with @DeclareMiddleware
     * @example './app/middleware'
     */
    middlewaresDir?: string

    /**
     * Listeners directory for auto-discovery
     * Scans for classes with @Listener decorated methods
     * @example './app/listener'
     * @default './app/listener'
     */
    listenersDir?: string

    /**
     * Explicit listener classes to register.
     * Use this to register listeners from packages or for production builds.
     *
     * When provided alongside `listenersDir`, both are used:
     * - Directory listeners are auto-discovered
     * - Explicit listeners are registered directly
     *
     * @example
     * ```typescript
     * import { DevtoolsListener } from '@lockness/devtools'
     * import { CacheInvalidationListener } from '@lockness/cache'
     *
     * @Kernel({
     *     listeners: [
     *         DevtoolsListener,
     *         CacheInvalidationListener,
     *     ],
     * })
     * ```
     */
    listeners?: unknown[]

    /**
     * Directory scanned for classes with `@Schedule` decorated methods.
     *
     * Defaults to {@link DEFAULT_SCHEDULES_DIR} — linked rather than restated,
     * so the path has one home. A missing directory is a no-op.
     *
     * **Must be a constant in application source.** Its contents are imported
     * and executed at boot under the process's permissions, so an
     * environment-derived value turns configuration into code execution.
     *
     * @example './app/schedule'
     */
    schedulesDir?: string

    /**
     * Explicit classes carrying `@Schedule` methods.
     *
     * Used alongside `schedulesDir` for packages and for compiled builds, where
     * directory scanning is unavailable.
     *
     * @example
     * ```typescript
     * @Kernel({ schedules: [ReportService, CleanupService] })
     * ```
     */
    schedules?: unknown[]

    /**
     * Mount point for URL prefixing (i18n, multi-tenancy).
     *
     * When defined, the application is accessible under the mount point's pattern
     * in addition to the root path. This is typically used for i18n.
     *
     * For API versioning, prefer using `@Controller('/api/:version')` instead.
     *
     * @example i18n routing
     * ```typescript
     * @Kernel({
     *     mountPoint: {
     *         // Constrain the params — an open `/:a/:b` matches any two
     *         // leading segments and hands unrelated paths to the middleware.
     *         pattern: `/${constrainedParam('langId', validLanguages)}/${
     *             constrainedParam('countryId', validCountries)
     *         }`,
     *         middleware: i18nMiddleware,
     *     },
     * })
     * ```
     */
    mountPoint?: MountPoint

    /**
     * Binary compilation configuration.
     * Use this to orchestrate the `deno compile` process.
     */
    compile?: CompileConfig
}

/**
 * Symbol keys for kernel metadata storage
 */
export const KERNEL_CONFIG: unique symbol = Symbol('kernel:config')
export const KERNEL_GLOBAL_MIDDLEWARE: unique symbol = Symbol(
    'kernel:globalMiddleware',
)

/**
 * Type for a kernel class constructor with metadata
 */
export interface KernelClassWithMetadata {
    [KERNEL_CONFIG]?: KernelConfig
    [KERNEL_GLOBAL_MIDDLEWARE]?: string
}

/**
 * Decorator to configure the application kernel.
 *
 * This decorator enables declarative application configuration by storing
 * metadata on the kernel class. The `createApp()` function reads this
 * metadata to bootstrap the application.
 *
 * @param config - Kernel configuration options
 * @returns A class decorator function
 *
 * @throws {Error} If applied to a non-class
 *
 * @see {@link createApp} - Bootstrap app from decorated kernel
 * @see {@link DeclareGlobalMiddleware} - Declare global middleware list
 * @since 0.1.28
 *
 * @example Minimal configuration
 * ```typescript
 * @Kernel({
 *     staticDir: 'public',
 *     controllersDir: './app/controller',
 * })
 * export class AppKernel {
 *     @DeclareGlobalMiddleware()
 *     globalMiddlewares = [LoggerMiddleware]
 * }
 * ```
 *
 * @example Full configuration
 * ```typescript
 * @Kernel({
 *     database: { url: Deno.env.get('DATABASE_URL') },
 *     session: { driver: 'cookie', lifetime: 7200, secure: true },
 *     devtools: true,
 *     staticDir: 'public',
 *     controllersDir: './app/controller',
 *     middlewaresDir: './app/middleware',
 * })
 * export class AppKernel {
 *     @DeclareGlobalMiddleware()
 *     globalMiddlewares = [
 *         sessionMiddleware(),
 *         initializeAuthMiddleware({ ... }),
 *         LoggerMiddleware,
 *     ]
 *
 *     @OnBoot({ priority: 100 })
 *     async setupDatabase(app: App) {
 *         // Custom database setup
 *     }
 * }
 * ```
 */
export function Kernel(
    config: KernelConfig = {},
): <T extends new (...args: unknown[]) => unknown>(
    target: T,
    context: ClassDecoratorContext,
) => T {
    return function <T extends new (...args: unknown[]) => unknown>(
        target: T,
        context: ClassDecoratorContext,
    ): T {
        // Validate decorator is applied to a class
        if (context.kind !== 'class') {
            throw new Error('@Kernel can only decorate classes')
        } // Store configuration on class

        ;(target as any)[KERNEL_CONFIG] = config

        return target
    }
}

/**
 * Declare a property as the global middleware list.
 *
 * Global middlewares are applied to all routes in the order they appear
 * in the array. This decorator marks a property that should contain
 * an array of middleware classes or functions.
 *
 * @returns A field decorator function
 *
 * @see {@link Kernel} - Main kernel configuration decorator
 * @since 0.1.28
 *
 * @example
 * ```typescript
 * @Kernel({ middlewaresDir: './app/middleware' })
 * export class AppKernel {
 *     @DeclareGlobalMiddleware()
 *     globalMiddlewares = [
 *         sessionMiddleware(),
 *         initializeAuthMiddleware({
 *             default: 'web',
 *             guards: { web: (ctx) => new SessionGuard('web', ctx, provider) },
 *         }),
 *         LoggerMiddleware,
 *     ]
 * }
 * ```
 *
 * @example With conditional middleware
 * ```typescript
 * @Kernel({ devtools: true })
 * export class AppKernel {
 *     @DeclareGlobalMiddleware()
 *     get globalMiddlewares() {
 *         const middlewares = [sessionMiddleware()]
 *
 *         if (Deno.env.get('APP_ENV') === 'production') {
 *             middlewares.push(securityHeadersMiddleware())
 *         }
 *
 *         return middlewares
 *     }
 * }
 * ```
 */
export function DeclareGlobalMiddleware(): <This, Value>(
    _target: undefined,
    context: ClassFieldDecoratorContext<This, Value>,
) => (this: This, value: Value) => Value {
    return function <This, Value>(
        _target: undefined,
        context: ClassFieldDecoratorContext<This, Value>,
    ): (this: This, value: Value) => Value {
        const fieldName = context.name

        // Return an initializer function that runs when the field is set
        return function (this: This, value: Value): Value {
            const constructor =
                (this as { constructor: { [key: symbol]: unknown } })
                    .constructor
            constructor[KERNEL_GLOBAL_MIDDLEWARE] = fieldName
            return value
        }
    }
}
