import type {
    Context as HonoContext,
    Env,
    Input,
    MiddlewareHandler,
    Next,
    ValidationTargets,
} from 'hono'

export type { MiddlewareHandler, Next, ValidationTargets }

export type Context<
    E extends Env = any,
    P extends string = any,
    I extends Input = { out: { [K in keyof ValidationTargets]: any } },
> = HonoContext<E, P, I>

export interface Route {
    method: string
    path: string
    methodName: string
    name?: string
    /** File extension to strip from route parameters */
    extension?: string
}

export interface ControllerMetadata {
    _basePath?: string
    _routes?: Route[]
    _middlewares?: Record<string, any[]>
    _validators?: Record<string, any[]>
}

export type ControllerClass =
    & (new (...args: any[]) => Record<string, any>)
    & ControllerMetadata

export interface Module {
    controllers: ControllerClass[]
}

/**
 * Configuration for a single mount point.
 *
 * A mount point defines a URL pattern where the application will be mounted,
 * along with optional middleware for context extraction.
 *
 * @example
 * ```typescript
 * // Internationalization mount point
 * const i18nMount: MountPoint = {
 *     pattern: '/:langId/:countryId',
 *     middleware: async (c, next) => {
 *         const langId = c.req.param('langId')
 *         const countryId = c.req.param('countryId')
 *         c.set('locale', await LocaleService.resolve(langId, countryId))
 *         return next()
 *     }
 * }
 *
 * // API versioning mount point
 * const apiMount: MountPoint = {
 *     pattern: '/api/:version',
 *     middleware: async (c, next) => {
 *         c.set('apiVersion', c.req.param('version'))
 *         return next()
 *     }
 * }
 * ```
 */
export interface MountPoint {
    /**
     * The URL pattern to mount the application on.
     * Supports Hono path parameters (e.g., `:langId`, `:countryId`, `:version`).
     *
     * @example '/:langId/:countryId'
     * @example '/api/:version'
     * @example '/tenant/:tenantId'
     */
    readonly pattern: string

    /**
     * Optional middleware specific to this mount point.
     * Executed before any controller logic for requests matching this pattern.
     *
     * Common use cases:
     * - Extract path parameters and hydrate context (locale, version)
     * - Validate path parameters (language codes, API versions)
     * - Load localized resources or tenant data
     * - Set up request-scoped dependencies
     *
     * @param c - Hono Context object
     * @param next - Next middleware function
     * @returns Promise resolving to void or a Response
     */
    readonly middleware?: (c: Context, next: Next) => Promise<void | Response>
}

export interface AppConfig {
    controllersDir?: string
    staticDir?: string

    /**
     * Configuration for mounting the app on multiple URL patterns.
     *
     * When defined, the application will be accessible under each mount point's pattern.
     * Controllers registered with decorators like `@Get('/users')` will be available
     * under all mount points (e.g., `/:langId/:countryId/users`, `/api/:version/users`).
     *
     * If not defined, the application mounts at root `/` (default behavior).
     *
     * @example
     * ```typescript
     * await app.init({
     *     controllersDir: './app/controller',
     *     staticDir: 'public',
     *     mountPoints: [
     *         { pattern: '/:langId/:countryId', middleware: i18nMiddleware },
     *         { pattern: '/api/:version', middleware: apiVersionMiddleware },
     *     ],
     * })
     * ```
     */
    readonly mountPoints?: readonly MountPoint[]
}

/**
 * Error handler function type
 */
export type ErrorHandler = (
    error: Error,
    c: Context,
) => Response | Promise<Response>

export interface IMiddleware {
    handle: MiddlewareHandler
}

/**
 * Middleware class type
 */
export type MiddlewareClass = new () => IMiddleware

/**
 * Middleware input - can be a class or a handler function
 */
export type MiddlewareInput = MiddlewareClass | MiddlewareHandler

/**
 * Registry of named middlewares
 */
export type MiddlewareRegistry = Record<string, MiddlewareClass>

/**
 * Extended Module config with middleware support
 */
export interface ModuleWithMiddleware extends Module {
    globalMiddlewares?: MiddlewareInput[]
    middlewares?: MiddlewareRegistry
    errorHandler?: ErrorHandler
    staticDir?: string
}
