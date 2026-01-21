/**
 * @fileoverview TC39 Decorators for route and controller definitions.
 *
 * This module provides decorators for building HTTP controllers:
 * - `@Controller(path)` - Marks a class as a controller with a base path
 * - `@Get()`, `@Post()`, `@Put()`, `@Delete()`, `@Patch()` - HTTP method decorators
 * - `@Use(middleware)` - Applies middleware to a route method
 * - `@Middleware()` - Marks a class as a middleware (marker decorator)
 *
 * @example
 * ```ts
 * @Controller('/users')
 * class UserController {
 *   @Get('/')
 *   @Use(AuthMiddleware)
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

import type { MiddlewareInput } from './types.ts'

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
 * Apply middleware to a route method.
 *
 * Can accept either a middleware class or a named middleware string.
 * Named middlewares must be registered in the kernel's middleware registry.
 *
 * @param middleware - Middleware class or named middleware string
 * @returns Method decorator function
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
 *
 * // Stacking multiple middlewares
 * @Use('auth')
 * @Use(RateLimitMiddleware)
 * async index(c: Context) { ... }
 * ```
 */
export function Use(middleware: MiddlewareInput | string): TC39MethodDecorator {
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
                    (this as { constructor: ControllerConstructor }).constructor
                if (!constructor._middlewares) constructor._middlewares = {}
                if (!constructor._middlewares[methodName]) {
                    constructor._middlewares[methodName] = []
                }
                constructor._middlewares[methodName].push(middleware)
            }
        })
    }
}
