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
import { MiddlewareResolver } from './middleware_resolver.ts'
import { ErrorHandlerRegistry } from './error_handler_registry.ts'
import { ControllerDiscovery } from './controller_discovery.ts'
import { RouteRegistry } from './route_registry.ts'
import { StaticFileServer } from './static_file_server.ts'
import { ServerListener } from './server_listener.ts'
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
 *     mountPoints: [
 *         { pattern: '/:langId/:countryId', middleware: i18nMiddleware },
 *         { pattern: '/api/:version', middleware: apiVersionMiddleware },
 *     ],
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

    /** @internal */
    private readonly middlewareResolver: MiddlewareResolver
    /** @internal */
    private readonly errorHandlerRegistry: ErrorHandlerRegistry
    /** @internal */
    private readonly controllerDiscovery: ControllerDiscovery
    /** @internal */
    private readonly routeRegistry: RouteRegistry
    /** @internal */
    private readonly staticFileServer: StaticFileServer
    /** @internal */
    private readonly serverListener: ServerListener
    /** @internal */
    private readonly pendingGlobalMiddlewares: MiddlewareInput[] = []
    /** @internal */
    private pendingErrorHandler?: ErrorHandler

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

        // Initialize utility classes
        this.middlewareResolver = new MiddlewareResolver()
        this.errorHandlerRegistry = new ErrorHandlerRegistry()
        this.controllerDiscovery = new ControllerDiscovery()
        this.routeRegistry = new RouteRegistry(this.middlewareResolver)
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
     *     mountPoints: [
     *         { pattern: '/:langId/:countryId', middleware: i18nMiddleware },
     *         { pattern: '/api/:version', middleware: apiVersionMiddleware },
     *     ],
     * })
     */
    async init(
        config: Module | ModuleWithMiddleware | AppConfig,
    ): Promise<void> {
        // Step 0: Discover middlewares decorated with @DeclareMiddleware
        await this.discoverMiddlewares(config)

        // Step 1: Register named middlewares
        this.registerNamedMiddlewares(config)

        // Step 2: Discover and register error handler
        const errorHandler = await this.discoverErrorHandler(config)
        this.registerErrorHandler(errorHandler)

        // Step 3: Resolve global middlewares
        const globalMiddlewares = this.resolveGlobalMiddlewares(config)
        this.applyGlobalMiddlewares(globalMiddlewares)

        // Step 4: Discover or load controllers
        const controllers = await this.loadControllers(config)

        // Step 5: Register controllers and routes (on internal hono)
        this.routeRegistry.registerControllers(this.hono, controllers)

        // Step 6: Set up mount points (connects rootHono → hono)
        this.setupMountPoints(config)

        // Step 7: Register static file serving (on rootHono, global)
        this.registerStaticFiles(config)

        // Step 8: Register 404 handler (on rootHono, must be last)
        this.registerNotFoundHandler(errorHandler)
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
     * @example Graceful shutdown
     * ```typescript
     * const server = app.listen(8888)
     *
     * Deno.addSignalListener('SIGINT', () => {
     *     console.log('Shutting down...')
     *     server.shutdown()
     * })
     * ```
     */
    listen(port: number): ReturnType<ServerListener['listen']> {
        return this.serverListener.listen(this.rootHono, {
            port,
            version: pkg.version,
        })
    }

    /**
     * Discover middlewares decorated with @DeclareMiddleware
     * @internal
     */
    private async discoverMiddlewares(
        config: Module | ModuleWithMiddleware | AppConfig,
    ): Promise<void> {
        if ('middlewaresDir' in config && config.middlewaresDir) {
            const { discoverMiddlewares } = await import(
                './middleware_resolver.ts'
            )
            await discoverMiddlewares(config.middlewaresDir)
        }
    }

    /**
     * Register named middlewares from config and merge with declared middlewares
     */
    private registerNamedMiddlewares(
        config: Module | ModuleWithMiddleware | AppConfig,
    ): void {
        // First, set manually registered middlewares
        if ('middlewares' in config && config.middlewares) {
            this.middlewareResolver.setRegistry(config.middlewares)
        }

        // Then merge with @DeclareMiddleware decorated middlewares (takes precedence)
        this.middlewareResolver.mergeDeclaredMiddlewares()
    }

    /**
     * Discover and return the error handler
     */
    private async discoverErrorHandler(
        config: Module | ModuleWithMiddleware | AppConfig,
    ): Promise<ErrorHandler> {
        const providedHandler = this.pendingErrorHandler ||
            ('errorHandler' in config ? config.errorHandler : undefined)

        return await this.errorHandlerRegistry.discover(providedHandler)
    }

    /**
     * Register error handler with Hono
     */
    private registerErrorHandler(errorHandler: ErrorHandler): void {
        this.hono.onError((error, c) => {
            return errorHandler(error, c as any)
        })
    }

    /**
     * Resolve global middlewares from fluent API and config
     */
    private resolveGlobalMiddlewares(
        config: Module | ModuleWithMiddleware | AppConfig,
    ): MiddlewareInput[] {
        return [
            ...this.pendingGlobalMiddlewares,
            ...('globalMiddlewares' in config && config.globalMiddlewares
                ? config.globalMiddlewares
                : []),
        ]
    }

    /**
     * Apply global middlewares to all routes
     */
    private applyGlobalMiddlewares(middlewares: MiddlewareInput[]): void {
        const handlers = this.middlewareResolver.resolveMany(middlewares)
        if (handlers.length > 0) {
            this.hono.use('*', ...handlers as any)
        }
    }

    /**
     * Load controllers from config (explicit list or discovery)
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
     * Sets up mount points by connecting rootHono to hono.
     * If no mount points are defined, mounts at root `/`.
     * @internal
     */
    private setupMountPoints(
        config: Module | ModuleWithMiddleware | AppConfig,
    ): void {
        const mountPoints = 'mountPoints' in config
            ? config.mountPoints
            : undefined

        if (mountPoints && mountPoints.length > 0) {
            // Mount the internal app under each mount point
            for (const mount of mountPoints) {
                // Apply mount-specific middleware if provided
                if (mount.middleware) {
                    this.rootHono.use(`${mount.pattern}/*`, mount.middleware)
                }

                // Route all requests under this pattern to internal hono
                this.rootHono.route(mount.pattern, this.hono)
            }
        } else {
            // Default: mount at root when no mount points configured
            this.rootHono.route('/', this.hono)
        }
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

    /**
     * Register the 404 Not Found handler on the public layer.
     * @internal
     */
    private registerNotFoundHandler(errorHandler: ErrorHandler): void {
        this.rootHono.notFound((c) => {
            const error = new Error('Not Found') as any
            error.status = 404
            return errorHandler(error, c as any)
        })
    }
}
