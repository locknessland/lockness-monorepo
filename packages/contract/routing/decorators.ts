/**
 * @fileoverview TC39 Decorators for route and controller definitions.
 *
 * This module provides decorators for building HTTP controllers:
 * - `@Controller(path)` - Marks a class as a controller with a base path
 * - `@Get()`, `@Post()`, `@Put()`, `@Delete()`, `@Patch()` - HTTP method decorators
 * - `@DeclareMiddleware(name)` - Registers a middleware for auto-discovery
 * - `@UseMiddleware(middleware)` - Applies middleware to a route method
 *
 * @example
 * ```ts
 * @Controller('/users')
 * class UserController {
 *   @Get('/')
 *   @UseMiddleware('auth')
 *   async index(c: Context) {
 *     return c.json({ users: [] })
 *   }
 *
 *   @Post('/')
 *   async store(c: Context) {
 *     return c.json({ created: true })
 *   }
 * }
 * ```
 *
 * @module
 */

import type { CacheOptions, MiddlewareClass, MiddlewareInput } from '../types.ts'
import { type ComposableMiddleware, compose } from '../http/compose.ts'

/**
 * Global registry for declared middlewares.
 * Maps middleware names to their class constructors.
 * @internal
 */
export const declaredMiddlewares: Map<string, MiddlewareClass> = new Map<
    string,
    MiddlewareClass
>()

/**
 * Symbol to store middleware name metadata on classes.
 * @internal
 */
export const MIDDLEWARE_NAME_KEY = Symbol('middleware:name')

/**
 * Route metadata stored on controller classes.
 */
export interface RouteMetadata {
    /** HTTP method (get, post, put, delete, patch) */
    readonly method: string
    /** Route path relative to controller base path */
    readonly path: string
    /** Name of the method on the controller class */
    readonly methodName: string
    /** Optional route name for named routing */
    readonly name?: string
    /** File extension to strip from route parameters */
    readonly extension?: string
}

/**
 * Controller class with decorator metadata.
 * This interface describes the shape of a decorated controller class.
 */
export interface ControllerWithMetadata {
    /** Base path for all routes in this controller */
    _basePath?: string
    /** Array of route definitions */
    _routes?: RouteMetadata[]
    /** Middleware mappings by method name */
    _middlewares?: Record<string, (MiddlewareInput | string)[]>
    /** Validator mappings by method name */
    _validators?: Record<string, unknown[]>
    /** Cache configuration by method name */
    _cacheConfigs?: Record<string, CacheOptions>
}

/** Generic constructor type */
// deno-lint-ignore no-explicit-any
type Constructor<T = unknown> = new (...args: any[]) => T

/** Constructor with controller metadata */
type ControllerConstructor<T = unknown> =
    & Constructor<T>
    & ControllerWithMetadata

/** TC39 class decorator type */
type TC39ClassDecorator = <T extends Constructor>(
    target: T,
    context: ClassDecoratorContext,
) => T | void

/** TC39 method decorator type */
// deno-lint-ignore no-explicit-any
type TC39MethodDecorator = (
    _target: unknown,
    context: ClassMethodDecoratorContext,
) => void

/**
 * Controller decorator - marks a class as a controller and sets its base path.
 *
 * The decorated class will have the following metadata properties:
 * - `_basePath`: The base path for all routes
 * - `_routes`: Array of route definitions (initialized empty)
 * - `_middlewares`: Middleware mappings (initialized empty)
 * - `_validators`: Validator mappings (initialized empty)
 *
 * @param path - Base path for all routes in this controller
 * @returns Class decorator function
 *
 * @example
 * ```ts
 * @Controller('/api/users')
 * class UserController {
 *   // Routes here will be prefixed with /api/users
 * }
 * ```
 */
export function Controller(path: string): TC39ClassDecorator {
    return function <T extends Constructor>(
        target: T,
        _context: ClassDecoratorContext,
    ): T {
        const controller = target as ControllerConstructor<T>
        // With TC39 decorators, we modify the constructor directly
        controller._basePath = path
        // Initialize arrays if they don't exist
        if (!controller._routes) controller._routes = []
        if (!controller._middlewares) controller._middlewares = {}
        if (!controller._validators) controller._validators = {}
        if (!controller._cacheConfigs) controller._cacheConfigs = {}
        return target
    }
}

/**
 * Supported file extensions for route parameters.
 * These are automatically stripped from route parameters when using the `extension` option.
 */
export type FileExtension =
    // Text & Documents
    | '.txt'
    | '.md'
    | '.html'
    | '.htm'
    | '.xml'
    | '.csv'
    | '.pdf'
    // Data
    | '.json'
    | '.yaml'
    | '.yml'
    | '.toml'
    // Code
    | '.js'
    | '.ts'
    | '.jsx'
    | '.tsx'
    | '.css'
    | '.scss'
    | '.less'
    // Images
    | '.png'
    | '.jpg'
    | '.jpeg'
    | '.gif'
    | '.svg'
    | '.webp'
    | '.ico'
    // Fonts
    | '.woff'
    | '.woff2'
    | '.ttf'
    | '.otf'
    | '.eot'
    // Archives
    | '.zip'
    | '.tar'
    | '.gz'
    // Media
    | '.mp3'
    | '.mp4'
    | '.webm'
    | '.ogg'
    | '.wav'
    // Other
    | '.rss'
    | '.atom'
    | '.map'
    | `.${string}` // Fallback for custom extensions

/**
 * Options for route decorators.
 */
export interface RouteOptions {
    /** Optional name for the route (used for named routing) */
    name?: string
    /**
     * File extension to append to the route path.
     * The extension is automatically stripped from route parameters.
     *
     * @example
     * ```ts
     * // Route: /llms/:name.txt
     * @Get('/:name', { extension: '.txt' })
     * async serve(c: Context) {
     *     const name = c.req.param('name') // 'installation' (not 'installation.txt')
     * }
     * ```
     */
    extension?: FileExtension
}

/**
 * Type signature for route decorator functions.
 * @param path - Route path (defaults to empty string for controller base path)
 * @param options - Optional route configuration
 * @returns Method decorator function
 */
type RouteDecorator = (
    path?: string,
    options?: RouteOptions,
) => TC39MethodDecorator

/**
 * Creates a route decorator for a specific HTTP method.
 *
 * This factory function generates decorators like `@Get()`, `@Post()`, etc.
 * The decorator stores route metadata on the controller constructor using
 * TC39's `addInitializer` to defer execution until first instantiation.
 *
 * @param method - HTTP method name (get, post, put, delete, patch)
 * @returns A route decorator function
 *
 * @internal
 */
function createRouteDecorator(method: string): RouteDecorator {
    return function (
        path = '',
        options: RouteOptions = {},
    ): TC39MethodDecorator {
        return function (
            _target: unknown,
            context: ClassMethodDecoratorContext,
        ): void {
            // Store route metadata directly on the constructor (not instance)
            const methodName = String(context.name)

            // Build the route path with optional extension
            // If extension is provided, transform /:name to /:name{.+\.ext}
            // This creates a Hono regex pattern that matches the extension
            let routePath = path
            if (options.extension) {
                // Escape the dot in the extension for regex
                const escapedExt = options.extension.replace('.', '\\.')
                // Transform last parameter to include regex pattern
                // e.g., '/:name' + '.txt' becomes '/:name{.+\.txt}'
                routePath = path.replace(
                    /\/:([^/]+)$/,
                    `/:$1{.+${escapedExt}}`,
                )
            }

            // We need to get the constructor, but context doesn't give it directly
            // So we use addInitializer to run on first instance creation
            let initialized = false
            context.addInitializer(function () {
                if (!initialized) {
                    initialized = true
                    const constructor =
                        (this as { constructor: ControllerConstructor })
                            .constructor
                    if (!constructor._routes) constructor._routes = []
                    constructor._routes.push({
                        method,
                        path: routePath,
                        methodName,
                        name: options.name,
                        extension: options.extension,
                    })
                }
            })
        }
    }
}

/**
 * GET request decorator.
 * Registers a route that responds to HTTP GET requests.
 *
 * @example
 * ```ts
 * @Get('/users')
 * async index(c: Context) {
 *   return c.json({ users: [] })
 * }
 * ```
 */
export const Get: RouteDecorator = createRouteDecorator('get')

/**
 * POST request decorator.
 * Registers a route that responds to HTTP POST requests.
 *
 * @example
 * ```ts
 * @Post('/users')
 * async store(c: Context) {
 *   return c.json({ created: true })
 * }
 * ```
 */
export const Post: RouteDecorator = createRouteDecorator('post')

/**
 * PUT request decorator.
 * Registers a route that responds to HTTP PUT requests.
 *
 * @example
 * ```ts
 * @Put('/users/:id')
 * async update(c: Context) {
 *   return c.json({ updated: true })
 * }
 * ```
 */
export const Put: RouteDecorator = createRouteDecorator('put')

/**
 * DELETE request decorator.
 * Registers a route that responds to HTTP DELETE requests.
 *
 * @example
 * ```ts
 * @Delete('/users/:id')
 * async destroy(c: Context) {
 *   return c.json({ deleted: true })
 * }
 * ```
 */
export const Delete: RouteDecorator = createRouteDecorator('delete')

/**
 * PATCH request decorator.
 * Registers a route that responds to HTTP PATCH requests.
 *
 * @example
 * ```ts
 * @Patch('/users/:id')
 * async patch(c: Context) {
 *   return c.json({ patched: true })
 * }
 * ```
 */
export const Patch: RouteDecorator = createRouteDecorator('patch')

/**
 * Middleware class decorator - marks a class as a middleware.
 *
 * This is a marker decorator that doesn't modify the class behavior.
 * It's used for semantic purposes to indicate a class is a middleware.
 *
 * @returns Class decorator function
 *
 * @example
 * ```ts
 * @Middleware()
 * class AuthMiddleware {
 *   async handle(c: Context, next: Next) {
 *     // Authentication logic
 *     return next()
 *   }
 * }
 * ```
 */
export function Middleware(): TC39ClassDecorator {
    return function <T extends Constructor>(
        target: T,
        _context: ClassDecoratorContext,
    ): T {
        return target
    }
}

/**
 * Declare a class-based middleware with a unique name.
 * The middleware can then be applied using `@UseMiddleware('name')` on controllers or methods.
 *
 * This decorator automatically registers the middleware in a global registry,
 * eliminating the need for manual registration in the kernel.
 *
 * @param name - Unique middleware name (e.g., 'auth', 'admin', 'rate-limit')
 * @returns Class decorator function
 *
 * @example
 * ```ts
 * @DeclareMiddleware('auth')
 * export class AuthMiddleware {
 *     async handle(c: Context, next: Next) {
 *         const user = await getUser(c)
 *         if (!user) return c.redirect('/login')
 *         return next()
 *     }
 * }
 *
 * // Then use it in controllers:
 * @Controller('/dashboard')
 * @UseMiddleware('auth')
 * export class DashboardController { ... }
 * ```
 */
export function DeclareMiddleware(name: string): TC39ClassDecorator {
    return function <T extends Constructor>(
        target: T,
        _context: ClassDecoratorContext,
    ): T {
        // Store the name on the class for potential introspection
        ;(target as any)[MIDDLEWARE_NAME_KEY] = name

        // Register in global registry
        declaredMiddlewares.set(name, target as unknown as MiddlewareClass)

        return target
    }
}

/**
 * Apply middleware to a route method.
 *
 * Can accept either a middleware class or a named middleware string.
 * Named middlewares must be registered in the kernel's middleware registry.
 *
 * @param middleware - Middleware class or named middleware string
 * @returns Method decorator function
 *
 * @deprecated Since 0.1.27. Use `@UseMiddleware()` instead for clearer intent.
 * ```ts
 * // Before (deprecated)
 * @Use('auth')
 * @Use(AuthMiddleware)
 *
 * // After
 * @UseMiddleware('auth')
 * @UseMiddleware(AuthMiddleware)
 * ```
 *
 * @example
 * ```ts
 * // Using a class directly
 * @Use(AuthMiddleware)
 * async index(c: Context) { ... }
 *
 * // Using a named middleware (must be registered in kernel)
 * @Use('auth')
 * async index(c: Context) { ... }
 * ```
 */
/**
 * Internal implementation for applying middleware to a route method.
 * Shared by both `@Use` and `@UseMiddleware` decorators.
 */
function applyMiddleware(
    middleware: MiddlewareInput | string,
): <This, Args extends unknown[], Return>(
    target: (this: This, ...args: Args) => Return,
    context: ClassMethodDecoratorContext<
        This,
        (this: This, ...args: Args) => Return
    >,
) => void {
    return function <This, Args extends unknown[], Return>(
        _target: (this: This, ...args: Args) => Return,
        context: ClassMethodDecoratorContext<
            This,
            (this: This, ...args: Args) => Return
        >,
    ): void {
        const methodName = String(context.name)
        let initialized = false
        context.addInitializer(function () {
            if (!initialized) {
                initialized = true
                const instance = this as object
                const constructor =
                    (instance as { constructor: ControllerConstructor })
                        .constructor
                if (!constructor._middlewares) constructor._middlewares = {}
                if (!constructor._middlewares[methodName]) {
                    constructor._middlewares[methodName] = []
                }
                // Use unshift to maintain top-to-bottom execution order
                // (TC39 decorators apply bottom-to-top)
                constructor._middlewares[methodName].unshift(middleware)
            }
        })
    }
}

export function Use(
    middleware: MiddlewareInput | string,
): <This, Args extends unknown[], Return>(
    target: (this: This, ...args: Args) => Return,
    context: ClassMethodDecoratorContext<
        This,
        (this: This, ...args: Args) => Return
    >,
) => void {
    // Trigger deprecation warning at decoration time (build/load time)
    console.warn(
        '[DEPRECATED] @Use() is deprecated since v0.1.27. Use @UseMiddleware() instead for clearer intent.',
    )

    return applyMiddleware(middleware)
}

/**
 * Apply middleware to a route method.
 *
 * Accepts either a middleware class or a named middleware string declared
 * via `@DeclareMiddleware()`. This is the preferred way to apply middlewares.
 *
 * @param middleware - Middleware class or name declared with `@DeclareMiddleware()`
 * @returns Method decorator function
 *
 * @since 0.1.27
 *
 * @example Using a named middleware
 * ```ts
 * @Controller('/api')
 * export class ApiController {
 *     @Get('/admin')
 *     @UseMiddleware('admin')
 *     adminPanel(c: Context) { ... }
 * }
 * ```
 *
 * @example Using a middleware class directly
 * ```ts
 * @Get('/protected')
 * @UseMiddleware(AuthMiddleware)
 * async protectedRoute(c: Context) { ... }
 * ```
 *
 * @example Stacking multiple middlewares
 * ```ts
 * @Get('/admin/users')
 * @UseMiddleware('auth')
 * @UseMiddleware('admin')
 * @UseMiddleware(RateLimitMiddleware)
 * async listUsers(c: Context) { ... }
 * ```
 */
export function UseMiddleware(
    middleware: MiddlewareInput | string,
): <This, Args extends unknown[], Return>(
    target: (this: This, ...args: Args) => Return,
    context: ClassMethodDecoratorContext<
        This,
        (this: This, ...args: Args) => Return
    >,
) => void {
    return applyMiddleware(middleware)
}

/**
 * Compose and apply multiple middlewares to a route method in a single decorator.
 *
 * This is a convenience decorator that combines `compose()` and `@UseMiddleware()`
 * for cleaner, more readable route middleware declarations.
 *
 * Accepts any combination of:
 * - Hono middleware functions (e.g., `cors()`, `logger()`)
 * - Lockness middleware classes (e.g., `AuthMiddleware`)
 * - Named middleware strings (e.g., `'admin'`) registered via `@DeclareMiddleware()`
 *
 * @param middlewares - Rest parameters of middlewares to compose and apply
 * @returns Method decorator function
 *
 * @since 0.1.30
 *
 * @example Inline composition (no variable needed)
 * ```ts
 * import { ComposeMiddleware, logger, cors } from '@lockness/contract'
 *
 * @Controller('/api')
 * export class ApiController {
 *     @Get('/users')
 *     @ComposeMiddleware(logger(), AuthMiddleware, 'admin')
 *     users(c: Context) {
 *         return c.json({ users: [] })
 *     }
 * }
 * ```
 *
 * @example Complex middleware stack
 * ```ts
 * @Get('/admin/dashboard')
 * @ComposeMiddleware(
 *     cors({ origin: 'https://admin.example.com' }),
 *     'auth',
 *     AdminMiddleware,
 *     AuditMiddleware,
 *     'rate-limit',
 * )
 * dashboard(c: Context) { ... }
 * ```
 *
 * @example Comparison with traditional approach
 * ```ts
 * // Before: 4 lines
 * const apiStack = compose([logger(), AuthMiddleware, 'admin'])
 * @UseMiddleware(apiStack)
 *
 * // After: 1 line
 * @ComposeMiddleware(logger(), AuthMiddleware, 'admin')
 * ```
 */
export function ComposeMiddleware(
    ...middlewares: ComposableMiddleware[]
): <This, Args extends unknown[], Return>(
    target: (this: This, ...args: Args) => Return,
    context: ClassMethodDecoratorContext<
        This,
        (this: This, ...args: Args) => Return
    >,
) => void {
    const composedMiddleware = compose(middlewares)
    return applyMiddleware(composedMiddleware)
}

/**
 * Configure caching for a route method.
 *
 * @param options - Cache configuration options (ttl, key, strategy)
 * @returns Method decorator function
 *
 * @example
 * ```ts
 * @Cache({ ttl: 60, strategy: 'server' })
 * async index(c: Context) { ... }
 * ```
 */
export function Cache(options: CacheOptions): TC39MethodDecorator {
    return function (
        _target: unknown,
        context: ClassMethodDecoratorContext,
    ): void {
        const methodName = String(context.name)
        let initialized = false
        context.addInitializer(function () {
            if (!initialized) {
                initialized = true
                const constructor =
                    (this as { constructor: ControllerConstructor })
                        .constructor
                if (!constructor._cacheConfigs) constructor._cacheConfigs = {}
                constructor._cacheConfigs[methodName] = {
                    ...constructor._cacheConfigs[methodName],
                    ...options,
                }
            }
        })
    }
}

/**
 * Set the cache TTL for a route method.
 *
 * @param ttl - Cache TTL in seconds
 * @returns Method decorator function
 *
 * @example
 * ```ts
 * @CacheTTL(300)
 * async index(c: Context) { ... }
 * ```
 */
export function CacheTTL(ttl: number): TC39MethodDecorator {
    return Cache({ ttl })
}

/**
 * Set a custom cache key for a route method.
 *
 * @param key - Custom cache key
 * @returns Method decorator function
 *
 * @example
 * ```ts
 * @CacheKey('custom_users_list')
 * async index(c: Context) { ... }
 * ```
 */
export function CacheKey(key: string): TC39MethodDecorator {
    return Cache({ key })
}

