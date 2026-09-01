/**
 * @fileoverview Core Application module for the Lockness Framework.
 *
 * This module provides the main `App` class that orchestrates the framework's
 * components including routing, middleware, controllers, and server lifecycle.
 *
 * @module @lockness/core/app
 * @see {@link App} for the main application class
 *
 * @example
 * ```typescript
 * import { App } from '@lockness/core'
 *
 * const app = new App()
 * await app.init({
 *     controllersDir: './app/controller',
 *     staticDir: 'public',
 * })
 * app.listen(8888)
 * ```
 */

declare const Deno: {
    env: {
        get(key: string): string | undefined
    }
}

import { Hono, jsxRenderer } from 'hono'
import type { Env, ExecutionContext, Schema } from 'hono'
import type {
    AppConfig,
    ControllerClass,
    ErrorHandler,
    MiddlewareInput,
    Module,
    ModuleWithMiddleware,
} from './types.ts'
import { MiddlewareResolver } from './http/resolver.ts'
import { MiddlewareRegistrator } from './http/registrator.ts'
import { ErrorHandlerRegistry } from './exceptions/handler.ts'
import { ExceptionRegistrator } from './exceptions/registrator.ts'
import { ControllerDiscovery } from './routing/discovery.ts'
import { RouteRegistry } from './routing/registry.ts'
import { MountManager } from './routing/mount_manager.ts'
import { StaticFileServer } from './http/static.ts'
import { ServerListener } from './http/server.ts'
import { ShutdownSequence } from './kernel/shutdown_sequence.ts'
import type { ShutdownReport } from './kernel/shutdown_sequence.ts'
import type { ShutdownHookMethod } from './kernel/shutdown_decorators.ts'
import type { ShutdownConfig } from './kernel/kernel_decorators.ts'
import { installShutdownSignals } from './kernel/signals.ts'
import pkg from './deno.json' with { type: 'json' }

/**
 * Information about a registered route.
 *
 * Used for route introspection, debugging, and devtools integration.
 *
 * @example
 * ```typescript
 * const routes = app.getRoutes()
 * routes.forEach(route => {
 *     console.log(`${route.method} ${route.path} -> ${route.controller}.${route.action}`)
 * })
 * ```
 */
export interface RouteInfo {
    /** HTTP method (GET, POST, PUT, DELETE, PATCH, etc.) */
    method: string
    /** Route path pattern (e.g., '/users/:id') */
    path: string
    /** Controller class name */
    controller: string
    /** Controller method name */
    action: string
    /** Applied middleware names */
    middlewares: string[]
    /** Optional route name for named route generation */
    name?: string
}

/**
 * Main application class that orchestrates the Lockness framework.
 *
 * The `App` class implements a dual-layer routing architecture:
 * - **Public Layer (rootHono)**: Handles mount points, static files, and 404 responses
 * - **Internal Layer (hono)**: Where controllers and business logic are registered
 *
 * This architecture enables mounting the same application on multiple URL patterns
 * (e.g., for i18n, API versioning, or multi-tenancy) while sharing controller logic.
 *
 * @example Basic Usage
 * ```typescript
 * const app = new App()
 *
 * await app.init({
 *     controllersDir: './app/controller',
 *     staticDir: 'public',
 * })
 *
 * app.listen(8888)
 * ```
 *
 * @example With Multi-Mount Routing
 * ```typescript
 * const app = new App()
 *
 * await app.init({
 *     controllers: [UserController, ProductController],
 *     staticDir: 'public',
 *     // One mount point, singular. Constrain its params: an open
 *     // `/:a/:b` matches any two leading segments.
 *     mountPoint: {
 *         pattern: `/${constrainedParam('langId', validLanguages)}/${
 *             constrainedParam('countryId', validCountries)
 *         }`,
 *         middleware: i18nMiddleware,
 *     },
 * })
 * ```
 *
 * @example With Fluent API
 * ```typescript
 * const app = new App()
 *
 * app.useMiddleware(LoggerMiddleware, CorsMiddleware)
 *    .useErrorHandler(customErrorHandler)
 *
 * await app.init({ controllers: [UserController] })
 * ```
 *
 * @see {@link RouteInfo} for route introspection
 * @see {@link AppConfig} for configuration options
 */
export class App {
    /**
     * Public layer Hono instance.
     * Handles mount points, static files, and 404 responses.
     * @internal
     */
    private readonly rootHono: Hono<Env, Schema, string> = new Hono({
        strict: false,
    })

    /**
     * Internal layer Hono instance.
     * Where controllers and business logic are registered.
     * @internal
     */
    private readonly hono: Hono<Env, Schema, string> = new Hono({
        strict: false,
    })

    // Core services
    /** @internal */
    private readonly middlewareResolver: MiddlewareResolver
    /** @internal */
    private readonly middlewareRegistrator: MiddlewareRegistrator
    /** @internal */
    private readonly errorHandlerRegistry: ErrorHandlerRegistry
    /** @internal */
    private readonly exceptionRegistrator: ExceptionRegistrator
    /** @internal */
    private readonly controllerDiscovery: ControllerDiscovery
    /** @internal */
    private readonly routeRegistry: RouteRegistry
    /** @internal */
    private readonly mountManager: MountManager
    /** @internal */
    private readonly staticFileServer: StaticFileServer
    /** @internal */
    private readonly serverListener: ServerListener

    // Pending configuration from fluent API
    /** @internal */
    private readonly pendingGlobalMiddlewares: MiddlewareInput[] = []
    /** @internal */
    private pendingErrorHandler?: ErrorHandler

    /**
     * The shutdown sequence: the teardown list, the deadline, and the memoised
     * promise that makes `shutdown()` idempotent.
     *
     * A collaborator rather than four fields on this class. `App` already has
     * nine, and none of the rest of it touches these — process lifecycle and
     * HTTP routing are not one cohesive responsibility.
     *
     * @internal
     */
    private readonly shutdownSequence = new ShutdownSequence()

    /**
     * Whether `listen()` installs signal handlers. Set by the bootstrap step
     * from `@Kernel({ shutdown: { signals } })`; on unless told otherwise.
     *
     * @internal
     */
    private shutdownSignalsEnabled = true

    /**
     * Whether the signal handlers are already installed.
     *
     * A second `listen()` would otherwise install a second pair over the same
     * sequence, and the first signal would find `isShuttingDown` already true
     * in the second handler and `Deno.exit(1)` before a single hook ran — the
     * S5 race, reintroduced between the framework and itself. `signals: false`
     * does not cover it, because that is one flag consulted N times.
     *
     * @internal
     */
    private shutdownSignalsInstalled = false

    /**
     * Creates a new App instance.
     *
     * Initializes the dual-layer Hono architecture and all internal services.
     * The app must be initialized with `init()` before handling requests.
     *
     * @example
     * ```typescript
     * const app = new App()
     * await app.init({ controllers: [UserController] })
     * app.listen(8888)
     * ```
     */
    constructor() {
        // Add JSX renderer to both layers for consistency
        this.rootHono.use(
            '*',
            jsxRenderer(({ children }: { children?: unknown }) =>
                children as any
            ),
        )
        this.hono.use(
            '*',
            jsxRenderer(({ children }: { children?: unknown }) =>
                children as any
            ),
        )

        // Initialize core services
        this.middlewareResolver = new MiddlewareResolver()
        this.middlewareRegistrator = new MiddlewareRegistrator(
            this.middlewareResolver,
            this.hono,
        )
        this.errorHandlerRegistry = new ErrorHandlerRegistry()
        this.exceptionRegistrator = new ExceptionRegistrator(
            this.errorHandlerRegistry,
            this.hono,
            this.rootHono,
        )
        this.controllerDiscovery = new ControllerDiscovery()
        this.routeRegistry = new RouteRegistry(this.middlewareResolver)
        this.mountManager = new MountManager(this.rootHono, this.hono)
        this.staticFileServer = new StaticFileServer()
        this.serverListener = new ServerListener()
    }

    /**
     * Whether the application is running in development mode.
     *
     * Checks if `APP_ENV` environment variable equals `'development'`.
     *
     * @returns `true` if `APP_ENV === 'development'`, `false` otherwise
     *
     * @example
     * ```typescript
     * if (app.isDevelopment) {
     *     enableDevtools(app.getHono())
     * }
     * ```
     */
    get isDevelopment(): boolean {
        return Deno.env.get('APP_ENV') === 'development'
    }

    /**
     * Whether the application is running in production mode.
     *
     * Checks if `APP_ENV` environment variable equals `'production'`.
     *
     * @returns `true` if `APP_ENV === 'production'`, `false` otherwise
     *
     * @example
     * ```typescript
     * if (app.isProduction) {
     *     app.useMiddleware(SecurityHeadersMiddleware)
     * }
     * ```
     */
    get isProduction(): boolean {
        return Deno.env.get('APP_ENV') === 'production'
    }

    /**
     * Registers one or more global middlewares using the fluent API.
     *
     * Middlewares added via this method are applied to all routes.
     * They are executed in the order they are registered, before any
     * route-specific middlewares.
     *
     * @param middlewares - Middleware classes or handler functions to register
     * @returns The App instance for method chaining
     *
     * @example Single middleware
     * ```typescript
     * app.useMiddleware(LoggerMiddleware)
     * ```
     *
     * @example Multiple middlewares
     * ```typescript
     * app.useMiddleware(
     *     sessionMiddleware(),
     *     authMiddleware(),
     *     LoggerMiddleware
     * )
     * ```
     *
     * @example Method chaining
     * ```typescript
     * app.useMiddleware(LoggerMiddleware)
     *    .useMiddleware(CorsMiddleware)
     *    .useErrorHandler(customHandler)
     * ```
     */
    useMiddleware(...middlewares: MiddlewareInput[]): this {
        this.pendingGlobalMiddlewares.push(...middlewares)
        return this
    }

    /**
     * Sets a custom error handler using the fluent API.
     *
     * The error handler is called for all unhandled errors in the application.
     * It receives the error and the Hono context, and must return a Response.
     *
     * @param handler - Error handler function
     * @returns The App instance for method chaining
     *
     * @example JSON API error handler
     * ```typescript
     * app.useErrorHandler((error, c) => {
     *     const status = 'status' in error ? error.status : 500
     *     return c.json({
     *         error: error.message,
     *         status,
     *     }, status)
     * })
     * ```
     *
     * @example HTML error pages
     * ```typescript
     * app.useErrorHandler((error, c) => {
     *     return c.html(<ErrorPage error={error} />, 500)
     * })
     * ```
     */
    useErrorHandler(handler: ErrorHandler): this {
        this.pendingErrorHandler = handler
        return this
    }

    /**
     * Returns all registered routes with their metadata.
     *
     * Useful for debugging, documentation generation, and devtools integration.
     *
     * @returns Array of route information objects
     *
     * @example
     * ```typescript
     * const routes = app.getRoutes()
     * console.table(routes.map(r => ({
     *     method: r.method,
     *     path: r.path,
     *     handler: `${r.controller}.${r.action}`,
     * })))
     * ```
     */
    public getRoutes(): RouteInfo[] {
        return this.routeRegistry.getRoutes()
    }

    /**
     * Returns the internal Hono instance.
     *
     * **Note**: This returns the internal layer where controllers are registered.
     * Use this for advanced customization or integrating third-party Hono plugins.
     *
     * @returns The internal Hono instance
     *
     * @example Enable devtools
     * ```typescript
     * if (app.isDevelopment) {
     *     enableDevtools(app.getHono())
     * }
     * ```
     *
     * @example Add custom Hono middleware
     * ```typescript
     * app.getHono().use('/api/*', cors())
     * ```
     */
    public getHono(): Hono<Env, Schema, string> {
        return this.hono
    }

    /**
     * Register static file serving (deprecated - use init config instead)
     * @deprecated Use staticDir in init() config
     */
    public static(pathPattern: string, root: string = 'public'): void {
        this.staticFileServer.register(this.hono, pathPattern, root)
    }

    /**
     * Returns the fetch handler for the application.
     *
     * This is the main entry point for handling HTTP requests.
     * Uses the public layer (rootHono) to support mount points.
     *
     * Compatible with Deno's `Deno.serve()` and other serverless runtimes.
     *
     * @returns Fetch handler function
     *
     * @example Testing
     * ```typescript
     * const res = await app.fetch(new Request('http://localhost/users'))
     * assertEquals(res.status, 200)
     * ```
     *
     * @example Deno Deploy
     * ```typescript
     * Deno.serve({ port: 8888 }, app.fetch)
     * ```
     */
    public get fetch(): (
        request: Request,
        env?: Record<string, unknown>,
        executionContext?: ExecutionContext,
    ) => Response | Promise<Response> {
        return this.rootHono.fetch.bind(this.rootHono)
    }

    /**
     * Initialize the application with controllers, middlewares, and configuration.
     * This is the main setup method that wires up all components.
     *
     * @param config - Configuration object with controllers, middlewares, etc.
     *
     * @example
     * await app.init({
     *     controllers: [UserController, PostController],
     *     globalMiddlewares: [loggerMiddleware],
     *     staticDir: 'public'
     * })
     *
     * @example
     * // Auto-discovery mode
     * await app.init({
     *     controllersDir: './app/controller',
     *     staticDir: 'public'
     * })
     *
     * @example
     * // With mount points
     * await app.init({
     *     controllersDir: './app/controller',
     *     staticDir: 'public',
     *     mountPoint: {
     *         pattern: `/${constrainedParam('langId', validLanguages)}/${
     *             constrainedParam('countryId', validCountries)
     *         }`,
     *         middleware: i18nMiddleware,
     *     },
     * })
     */
    async init(
        config: Module | ModuleWithMiddleware | AppConfig,
    ): Promise<void> {
        // Step 1: Register middlewares (discovery, naming, global application)
        await this.middlewareRegistrator.register(
            config,
            this.pendingGlobalMiddlewares,
        )

        // Step 2: Register error handlers
        const errorHandler = await this.exceptionRegistrator.register(
            config,
            this.pendingErrorHandler,
        )

        // Step 3: Discover or load controllers
        const controllers = await this.loadControllers(config)

        // Step 4: Register controllers and routes (on internal hono)
        this.routeRegistry.registerControllers(this.hono, controllers)

        // Step 5: Register static file serving (on rootHono, before mount points)
        this.registerStaticFiles(config)

        // Step 6: Set up mount points (connects rootHono → hono)
        this.mountManager.setup(config)

        // Step 7: Register 404 handler (on rootHono, must be last)
        this.exceptionRegistrator.registerNotFoundHandler(errorHandler)
    }

    /**
     * Starts the HTTP server and listens on the specified port.
     *
     * This method should be called after `init()` to start accepting requests.
     * Logs a startup message with the framework version and port number.
     *
     * @param port - Port number to listen on (e.g., 8888)
     * @returns Deno HTTP server instance for lifecycle management
     *
     * @example
     * ```typescript
     * const app = new App()
     * await app.init({ controllers: [UserController] })
     *
     * const server = app.listen(8888)
     * // Server is now running on http://localhost:8888
     * ```
     *
     * @example Graceful shutdown — nothing to wire
     * ```typescript
     * const server = app.listen(8888)
     * // SIGINT and SIGTERM are already handled: the server stops accepting,
     * // every @OnShutdown hook runs in order, and the process exits. Opt out
     * // with @Kernel({ shutdown: { signals: false } }) if you wire your own.
     * ```
     */
    listen(port: number): ReturnType<ServerListener['listen']> {
        const server = this.serverListener.listen(this.rootHono, {
            port,
            version: pkg.version,
        })

        // Retained so `shutdown()` can stop it first. What comes back is a
        // PROMISE wearing a server's type — `ServerListener.listen` returns
        // `this.tryServe(...) as unknown as Deno.HttpServer` over a `private
        // async tryServe` — which is why the sequence awaits before calling
        // `.shutdown()`, and why `main.ts` writes `await app.listen(...)`.
        this.shutdownSequence.setServer(
            server as unknown as Promise<{ shutdown(): Promise<void> }>,
        )

        if (this.shutdownSignalsEnabled && !this.shutdownSignalsInstalled) {
            installShutdownSignals(this.shutdownSequence)
            this.shutdownSignalsInstalled = true
        }

        return server
    }

    /**
     * Register a teardown to run at shutdown.
     *
     * The imperative counterpart to `@OnShutdown`, for packages and for code
     * that has no kernel class. Both land in the **same** list — there is only
     * one, and it is the only thing shutdown walks.
     *
     * @param name - Label for logs and the failure report. Encoded before it is
     * written, so an arbitrary string is safe.
     * @param fn - The teardown; sync or async, and awaited.
     * @param priority - **Lower runs first**, the inverse of `@OnBoot`. Framework
     * callers pass a `SHUTDOWN_PRIORITY` constant rather than a bootstrap
     * `order`, which is a different axis with similar-looking numbers.
     *
     * @see {@link shutdown}
     * @since 0.2.1
     *
     * @example
     * ```typescript
     * app.onShutdown('metrics', () => metrics.flush())
     * ```
     */
    onShutdown(
        name: string,
        fn: ShutdownHookMethod,
        priority?: number,
    ): void {
        this.shutdownSequence.registry.register(name, fn, priority)
    }

    /**
     * Stop the server and run every registered teardown, lowest priority first.
     *
     * **Idempotent** — call it ten times and one teardown happens; every caller
     * resolves with the same report. **Bounded** — the whole sequence, drain
     * included, is capped by the configured deadline.
     *
     * **It does not exit the process.** That belongs to the signal path, so a
     * programmatic caller can tear down and carry on. It follows that a hook
     * which hangs is *abandoned*, not cancelled: it keeps running in a process
     * that is alive and no longer serving.
     *
     * ⚠️ A process-lifecycle API. Never expose it from a route handler,
     * middleware or devtools panel — it terminates service for every caller and
     * carries no authorization of its own.
     *
     * @returns What ran, what failed, and whether the deadline expired.
     *
     * @see {@link onShutdown}
     * @since 0.2.1
     *
     * @example
     * ```typescript
     * const { failed, timedOut } = await app.shutdown()
     * ```
     */
    shutdown(): Promise<ShutdownReport> {
        return this.shutdownSequence.run()
    }

    /** Whether a shutdown sequence has begun. */
    get isShuttingDown(): boolean {
        return this.shutdownSequence.isShuttingDown
    }

    /**
     * Apply `@Kernel({ shutdown })`.
     *
     * Called by the `shutdown_hooks` bootstrap step. Validates the deadline
     * here, at boot, so a bad value is a loud startup failure rather than a
     * shutdown that silently abandons everything.
     *
     * @param config - The kernel's shutdown configuration, if any.
     * @throws {TypeError} If `deadlineMs` is outside `[1, 2**31 - 1]`.
     * @internal
     */
    configureShutdown(config: ShutdownConfig | undefined): void {
        this.shutdownSequence.setDeadlineMs(config?.deadlineMs)
        this.shutdownSignalsEnabled = config?.signals !== false
    }

    /**
     * Load controllers from config (explicit list or discovery)
     * @internal
     */
    private async loadControllers(
        config: Module | ModuleWithMiddleware | AppConfig,
    ): Promise<ControllerClass[]> {
        if ('controllers' in config && config.controllers) {
            return config.controllers
        } else if ('controllersDir' in config && config.controllersDir) {
            return await this.controllerDiscovery.discover(
                config.controllersDir,
            )
        }
        return []
    }

    /**
     * Register static file serving on the public layer.
     * Static files are global and not affected by mount points.
     * @internal
     */
    private registerStaticFiles(
        config: Module | ModuleWithMiddleware | AppConfig,
    ): void {
        if ('staticDir' in config && config.staticDir) {
            this.staticFileServer.registerIfConfigured(
                this.rootHono,
                config.staticDir,
            )
        }
    }
}
