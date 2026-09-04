/**
 * @fileoverview Route-verb decorators for controllers.
 *
 * Declares `@Controller(path)` and the HTTP-method decorators
 * `@Get`/`@Post`/`@Put`/`@Delete`/`@Patch`, plus the `RouteOptions` /
 * `FileExtension` shapes they accept. This is the single reason-to-change for
 * "how a route is declared on a controller"; middleware binding, caching,
 * throttling and static generation each live in their own sibling module and
 * are recombined by the `decorators.ts` barrel.
 *
 * @example
 * ```ts
 * @Controller('/users')
 * class UserController {
 *   @Get('/')
 *   async index(c: Context) {
 *     return c.json({ users: [] })
 *   }
 * }
 * ```
 *
 * @module
 */

import type {
    Constructor,
    ControllerConstructor,
    TC39ClassDecorator,
    TC39MethodDecorator,
} from './decorator_shared.ts'

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
