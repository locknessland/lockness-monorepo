/**
 * @fileoverview Middleware-binding decorators for controllers and routes.
 *
 * Declares the middleware side of the routing decorator family: the global
 * `declaredMiddlewares` registry, `@Middleware`/`@DeclareMiddleware` class
 * markers, and the method-level `@Use`/`@UseMiddleware`/`@ComposeMiddleware`
 * binders. This is the single reason-to-change for "how middleware is attached
 * to a controller or route"; route verbs, caching, throttling and static
 * generation live in sibling modules and are recombined by the `decorators.ts`
 * barrel.
 *
 * @module
 */

import type { MiddlewareClass, MiddlewareInput } from '../types.ts'
import { type ComposableMiddleware, compose } from '../http/compose.ts'
import type {
    Constructor,
    ControllerConstructor,
    TC39ClassDecorator,
} from './decorator_shared.ts'

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
