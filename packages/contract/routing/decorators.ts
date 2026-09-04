/**
 * @fileoverview TC39 Decorators for route and controller definitions.
 *
 * This module is the public barrel for the routing decorator family. The
 * decorators are split by reason-to-change into sibling modules and recombined
 * here so that `@lockness/contract` keeps exposing them from one specifier:
 * - `@Controller`, `@Get`/`@Post`/`@Put`/`@Delete`/`@Patch` — `route_decorators.ts`
 * - middleware binding (`@Middleware`, `@DeclareMiddleware`, `@Use`,
 *   `@UseMiddleware`, `@ComposeMiddleware`) — inline below (extraction: #227)
 * - `@Cache`/`@CacheTTL`/`@CacheKey`, `@Static`, `@Throttle*` — inline below
 *   (extraction: #228)
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

import type { CacheOptions } from '../types.ts'
import type { ThrottleConfig, ThrottleOptions, TimeWindow } from './throttle.ts'
import type {
    ControllerConstructor,
    TC39MethodDecorator,
} from './decorator_shared.ts'

// Route-verb decorators (`@Controller`, `@Get`…`@Patch`) live in their own
// module; re-exported here so the public specifier is unchanged (#226).
export * from './route_decorators.ts'
// Middleware-binding decorators (`@Middleware`, `@DeclareMiddleware`, `@Use`,
// `@UseMiddleware`, `@ComposeMiddleware`, `declaredMiddlewares`) — re-exported
// so the public specifier is unchanged (#227).
export * from './middleware_decorators.ts'
// The shared controller-metadata contract; its public interfaces stay visible
// from this barrel (the constructor/decorator helper types stay internal).
export type {
    ControllerWithMetadata,
    RouteMetadata,
} from './decorator_shared.ts'

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

/**
 * Options for the {@link Static} decorator (#54).
 *
 * v1 exposes a single field. It deliberately carries **no** data-fetching hook:
 * `@Static` routes do not run DB queries or external `fetch` at build time
 * (that is the deferred build-time-data feature). This shape is the single home
 * for the "build-time data is forbidden in v1" rule — a `data`/`loader` field may
 * not be added without amending the feature plan.
 */
export interface StaticOptions {
    /**
     * An explicit, literal enumeration of a parameterized route's values, one
     * map per emitted page (e.g. `[{ slug: 'intro' }, { slug: 'setup' }]`). The
     * SSG build substitutes each map into the route path and emits one file per
     * entry. Omit for a parameterless route; a parameterized `@Static` route with
     * no `params` list is a build error.
     */
    readonly params?: ReadonlyArray<Record<string, string>>
}

/**
 * Opt a route (or a whole controller) into static pre-rendering by the
 * `ssg:build` command (#54).
 *
 * Applied to a **method**, it marks that single route static. Applied to a
 * **class**, it marks every GET route the controller declares static. It records
 * metadata on the controller constructor — method-level via `addInitializer`
 * (which fires only on instantiation, matching `@Cache` / `@Throttle`),
 * class-level directly — and changes nothing at runtime; only the SSG build
 * reads it. This decorator is the single home for the "which routes are static"
 * decision.
 *
 * @param options - Optional static configuration (the literal `params` list).
 * @returns A decorator usable on a controller class or a route method.
 * @throws {TypeError} If applied to anything but a class or a method.
 *
 * @example Method-level, parameterless
 * ```ts
 * @Get('/')
 * @Static()
 * index(c: Context) { return c.html(<Home />) }
 * ```
 *
 * @example Method-level with a literal params list
 * ```ts
 * @Get('/:slug')
 * @Static({ params: [{ slug: 'intro' }, { slug: 'setup' }] })
 * page(c: Context) { return c.html(<Doc slug={c.req.param('slug')} />) }
 * ```
 *
 * @example Class-level — every GET route static
 * ```ts
 * @Controller('/docs')
 * @Static()
 * class DocsController { ... }
 * ```
 */
export function Static(
    options: StaticOptions = {},
): (target: unknown, context: DecoratorContext) => void {
    return function (target: unknown, context: DecoratorContext): void {
        if (context.kind === 'class') {
            const controller = target as ControllerConstructor
            controller._staticAll = true
            return
        }

        if (context.kind !== 'method') {
            throw new TypeError(
                `@Static can only decorate a controller class or a route method, not a ${context.kind}.`,
            )
        }

        const methodName = String(context.name)
        let initialized = false
        ;(context as ClassMethodDecoratorContext).addInitializer(function () {
            if (initialized) return
            initialized = true
            const constructor =
                (this as { constructor: ControllerConstructor }).constructor
            if (!constructor._staticConfigs) constructor._staticConfigs = {}
            constructor._staticConfigs[methodName] = options
        })
    }
}

/**
 * Rate-limit a controller or a single route method.
 *
 * Applied to a class, the rule covers every route the controller declares.
 * Applied to a method, it covers that route only, and **overrides** any
 * controller-wide rule — the two never stack, so a permissive method-level
 * limit really does loosen a strict controller default rather than being
 * silently capped by it.
 *
 * @param limit - Maximum number of requests permitted per window.
 * @param window - Window length: milliseconds, or shorthand such as `'1m'`.
 * @param options - Client identification, bypass, response shape, store.
 * @returns A decorator usable on a class or a method.
 * @throws {TypeError} At decoration time if `limit` is not a positive integer.
 * The window is validated later, when the middleware is built.
 *
 * @example
 * ```ts
 * @Controller('/api')
 * @Throttle(100, '1m')            // every route: 100 requests per minute
 * class ApiController {
 *   @Post('/login')
 *   @Throttle(5, '1m', { by: 'ip' })  // this route only: 5 per minute
 *   async login(c: Context) { ... }
 * }
 * ```
 */
export function Throttle(
    limit: number,
    window: TimeWindow,
    options?: ThrottleOptions,
): (target: unknown, context: DecoratorContext) => void {
    if (!Number.isInteger(limit) || limit <= 0) {
        throw new TypeError(
            `@Throttle limit must be a positive integer, received ${limit}.`,
        )
    }

    const config: ThrottleConfig = { limit, window, options }

    return function (target: unknown, context: DecoratorContext): void {
        if (context.kind === 'class') {
            const controller = target as ControllerConstructor
            controller._throttle = config
            return
        }

        if (context.kind !== 'method') {
            throw new TypeError(
                `@Throttle can only decorate a controller class or a route method, not a ${context.kind}.`,
            )
        }

        const methodName = String(context.name)
        let initialized = false
        ;(context as ClassMethodDecoratorContext).addInitializer(function () {
            if (initialized) return
            initialized = true
            const constructor =
                (this as { constructor: ControllerConstructor }).constructor
            if (!constructor._throttleConfigs) constructor._throttleConfigs = {}
            constructor._throttleConfigs[methodName] = config
        })
    }
}

/**
 * Preset for credential-checking endpoints: 5 requests per minute.
 *
 * @example
 * ```ts
 * @Post('/login')
 * @ThrottleLogin()
 * async login(c: Context) { ... }
 * ```
 */
export function ThrottleLogin(
    options?: ThrottleOptions,
): (target: unknown, context: DecoratorContext) => void {
    return Throttle(5, '1m', options)
}

/**
 * Preset for destructive or high-value operations: 3 requests per hour.
 *
 * @example
 * ```ts
 * @Post('/account/delete')
 * @ThrottleSensitive()
 * async destroy(c: Context) { ... }
 * ```
 */
export function ThrottleSensitive(
    options?: ThrottleOptions,
): (target: unknown, context: DecoratorContext) => void {
    return Throttle(3, '1h', options)
}

/**
 * Preset for general API traffic: 100 requests per minute.
 *
 * @example
 * ```ts
 * @Controller('/api')
 * @ThrottleApi()
 * class ApiController { ... }
 * ```
 */
export function ThrottleApi(
    options?: ThrottleOptions,
): (target: unknown, context: DecoratorContext) => void {
    return Throttle(100, '1m', options)
}

/**
 * Preset for expensive handlers — reports, exports, uploads: 10 per minute.
 *
 * @example
 * ```ts
 * @Get('/export')
 * @ThrottleHeavy()
 * async export(c: Context) { ... }
 * ```
 */
export function ThrottleHeavy(
    options?: ThrottleOptions,
): (target: unknown, context: DecoratorContext) => void {
    return Throttle(10, '1m', options)
}
