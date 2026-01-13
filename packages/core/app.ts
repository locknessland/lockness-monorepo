// deno-lint-ignore-file no-explicit-any
import { Hono } from 'hono'
import { jsxRenderer } from 'hono/jsx-renderer'
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

export interface RouteInfo {
    method: string
    path: string
    controller: string
    action: string
    middlewares: string[]
    name?: string
}

/**
 * Main application class that orchestrates the framework's components.
 * Handles initialization, middleware registration, routing, and server startup.
 */
export class App {
    private hono = new Hono({ strict: false })
    private middlewareResolver: MiddlewareResolver
    private errorHandlerRegistry: ErrorHandlerRegistry
    private controllerDiscovery: ControllerDiscovery
    private routeRegistry: RouteRegistry
    private staticFileServer: StaticFileServer
    private serverListener: ServerListener
    private pendingGlobalMiddlewares: MiddlewareInput[] = []
    private pendingErrorHandler?: ErrorHandler

    constructor() {
        this.hono.use('*', jsxRenderer(({ children }) => children as any))

        // Initialize utility classes
        this.middlewareResolver = new MiddlewareResolver()
        this.errorHandlerRegistry = new ErrorHandlerRegistry()
        this.controllerDiscovery = new ControllerDiscovery()
        this.routeRegistry = new RouteRegistry(this.middlewareResolver)
        this.staticFileServer = new StaticFileServer()
        this.serverListener = new ServerListener()
    }

    /**
     * Check if in development mode
     */
    get isDevelopment(): boolean {
        return Deno.env.get('APP_ENV') === 'development'
    }

    /**
     * Check if in production mode
     */
    get isProduction(): boolean {
        return Deno.env.get('APP_ENV') === 'production'
    }

    /**
     * Add a global middleware using fluent API
     * @example app.useMiddleware(LoggerMiddleware)
     */
    useMiddleware(...middlewares: MiddlewareInput[]): this {
        this.pendingGlobalMiddlewares.push(...middlewares)
        return this
    }

    /**
     * Set custom error handler using fluent API
     * @example app.useErrorHandler((error, c) => c.json({ error: error.message }, 500))
     */
    useErrorHandler(handler: ErrorHandler): this {
        this.pendingErrorHandler = handler
        return this
    }

    /**
     * Get all registered routes
     */
    public getRoutes(): RouteInfo[] {
        return this.routeRegistry.getRoutes()
    }

    /**
     * Get the underlying Hono instance
     */
    public getHono(): Hono {
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
     * Get the fetch handler for the application
     */
    public get fetch(): (
        request: Request,
        Env?: any,
        executionContext?: any,
    ) => Response | Promise<Response> {
        return this.hono.fetch.bind(this.hono)
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
     */
    async init(
        config: Module | ModuleWithMiddleware | AppConfig,
    ): Promise<void> {
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

        // Step 5: Register controllers and routes
        this.routeRegistry.registerControllers(this.hono, controllers)

        // Step 6: Register static file serving (after routes, before notFound)
        this.registerStaticFiles(config)

        // Step 7: Register 404 handler (must be last)
        this.registerNotFoundHandler(errorHandler)
    }

    /**
     * Start the server and listen on the specified port
     */
    listen(port: number): Deno.HttpServer<Deno.NetAddr> {
        return this.serverListener.listen(this.hono, {
            port,
            version: pkg.version,
        })
    }

    /**
     * Register named middlewares from config
     */
    private registerNamedMiddlewares(
        config: Module | ModuleWithMiddleware | AppConfig,
    ): void {
        if ('middlewares' in config && config.middlewares) {
            this.middlewareResolver.setRegistry(config.middlewares)
        }
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
     * Register static file serving if configured
     */
    private registerStaticFiles(
        config: Module | ModuleWithMiddleware | AppConfig,
    ): void {
        if ('staticDir' in config && config.staticDir) {
            this.staticFileServer.registerIfConfigured(
                this.hono,
                config.staticDir,
            )
        }
    }

    /**
     * Register 404 not found handler (must be registered last)
     */
    private registerNotFoundHandler(errorHandler: ErrorHandler): void {
        this.hono.notFound((c) => {
            const error = new Error('Not Found') as any
            error.status = 404
            return errorHandler(error, c as any)
        })
    }
}
