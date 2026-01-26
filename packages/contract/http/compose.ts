/**
 * @fileoverview Middleware Composition Helper
 *
 * Provides a `compose()` function to combine multiple middlewares into one.
 * Supports Lockness class middlewares, named middlewares, and Hono functions.
 *
 * @module @lockness/contract/http/compose
 */

import type { MiddlewareHandler } from 'hono'
import type { Context, Next } from '../types.ts'
import { declaredMiddlewares } from '../routing/decorators.ts'

/**
 * Middleware input type for compose function.
 * Can be a class, function, or named string.
 */
export type ComposableMiddleware =
    | MiddlewareHandler
    | {
        new (): {
            handle: (
                c: Context,
                next: Next,
            ) => Response | Promise<Response | void>
        }
    }
    | string

/**
 * Composes multiple middlewares into a single middleware handler.
 *
 * This allows you to create reusable middleware stacks that can be
 * applied as a single unit to routes.
 *
 * **Supported middleware types:**
 * - Hono middleware functions (e.g., `cors()`, `logger()`)
 * - Lockness class middlewares (e.g., `AuthMiddleware`)
 * - Named middleware strings (e.g., `'auth'`) - resolved at runtime
 *
 * @param middlewares - Array of middlewares to compose
 * @returns A single middleware handler that executes all middlewares in order
 *
 * @example Basic usage with different middleware types
 * ```typescript
 * import { compose, cors, logger } from '@lockness/contract'
 *
 * const apiStack = compose([
 *     logger(),           // Hono function middleware
 *     AuthMiddleware,     // Lockness class middleware
 *     'admin',            // Named middleware (resolved from registry)
 * ])
 *
 * @Controller('/api')
 * export class ApiController {
 *     @Get('/users')
 *     @UseMiddleware(apiStack)
 *     users(c: Context) {
 *         return c.json({ users: [] })
 *     }
 * }
 * ```
 *
 * @example Creating reusable middleware groups
 * ```typescript
 * // Define reusable stacks
 * const authStack = compose([sessionMiddleware(), 'auth'])
 * const adminStack = compose([authStack, 'admin', AuditMiddleware])
 *
 * // Use in multiple places
 * app.useMiddleware(authStack)
 *
 * @Get('/admin')
 * @UseMiddleware(adminStack)
 * admin(c: Context) { ... }
 * ```
 *
 * @example With inline class middleware
 * ```typescript
 * const rateLimitedAuth = compose([
 *     RateLimitMiddleware,
 *     cors({ origin: 'https://example.com' }),
 *     'auth',
 * ])
 * ```
 */
export function compose(
    middlewares: ComposableMiddleware[],
): MiddlewareHandler {
    // deno-lint-ignore require-await
    return async (c: Context, next: Next): Promise<Response | void> => {
        // Build the middleware chain
        let index = -1

        const dispatch = (i: number): Promise<Response | void> => {
            if (i <= index) {
                return Promise.reject(new Error('next() called multiple times'))
            }
            index = i

            if (i >= middlewares.length) {
                // End of middleware chain, call the final next
                return Promise.resolve(next()) as Promise<Response | void>
            }

            const middleware = middlewares[i]
            const handler = resolveMiddleware(middleware)

            if (handler) {
                // Wrap dispatch to return Promise<void> for Next compatibility
                const wrappedNext = (): Promise<void> => {
                    return dispatch(i + 1).then(() => undefined)
                }
                return Promise.resolve(handler(c, wrappedNext)) as Promise<
                    Response | void
                >
            } else {
                // Skip unresolvable middleware
                return dispatch(i + 1)
            }
        }

        return dispatch(0)
    }
}

/**
 * Resolves a composable middleware to a handler function.
 *
 * @param middleware - The middleware to resolve
 * @returns The resolved handler or null if not resolvable
 *
 * @internal
 */
function resolveMiddleware(
    middleware: ComposableMiddleware,
): MiddlewareHandler | null {
    if (typeof middleware === 'string') {
        // Named middleware - defer to runtime resolution via declaredMiddlewares
        const MiddlewareClass = declaredMiddlewares.get(middleware)
        if (MiddlewareClass) {
            const instance = new MiddlewareClass()
            return instance.handle.bind(instance)
        }
        console.warn(
            `⚠️ Composed middleware '${middleware}' not found in registry`,
        )
        return null
    } else if (typeof middleware === 'function') {
        // Check if it's a class with handle method
        if ('prototype' in middleware && middleware.prototype?.handle) {
            // deno-lint-ignore no-explicit-any
            const instance = new (middleware as any)()
            return instance.handle.bind(instance)
        }
        // Plain function middleware
        return middleware as MiddlewareHandler
    }
    return null
}

/**
 * Type-safe version of compose that provides better type inference.
 *
 * @param middlewares - Rest parameters of middlewares
 * @returns A single middleware handler
 *
 * @example
 * ```typescript
 * const stack = composeMiddleware(
 *     logger(),
 *     AuthMiddleware,
 *     'admin',
 * )
 * ```
 */
export function composeMiddleware(
    ...middlewares: ComposableMiddleware[]
): MiddlewareHandler {
    return compose(middlewares)
}
