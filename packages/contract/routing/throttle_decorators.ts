/**
 * @fileoverview Rate-limit decorators (`@Throttle` and its presets).
 *
 * Declares the throttling side of the routing decorator family: the `@Throttle`
 * decorator plus the `@ThrottleLogin`/`@ThrottleSensitive`/`@ThrottleApi`/
 * `@ThrottleHeavy` presets, recording `_throttle`/`_throttleConfigs` metadata on
 * a controller. This is the single reason-to-change for "how a route is rate
 * limited"; route verbs, middleware binding, caching and static generation live
 * in sibling modules and are recombined by the `decorators.ts` barrel. The
 * throttle value shapes (`ThrottleConfig`, `TimeWindow`, …) live in
 * `throttle.ts`.
 *
 * @module
 */

import type { ThrottleConfig, ThrottleOptions, TimeWindow } from './throttle.ts'
import type { ControllerConstructor } from './decorator_shared.ts'

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
