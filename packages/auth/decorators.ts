/**
 * @fileoverview Authentication decorators.
 *
 * TC39 Stage 3 decorators for dependency injection and guard access.
 *
 * @module @lockness/auth/decorators
 */

import type { Context } from 'hono'
import { getAuth } from './middleware/initialize_auth_middleware.ts'
import {
    authGuard,
    authOptional,
    authRequired,
} from './middleware/auth_middleware.ts'
import type { MiddlewareHandler } from 'hono'
import { UseMiddleware } from '@lockness/core'

/**
 * Inject guard as second parameter to controller method
 *
 * This decorator wraps the original method and automatically injects
 * the specified guard instance as the second parameter.
 *
 * **Important**: This is a METHOD decorator, not a parameter decorator.
 * TC39 Stage 3 decorators do not support parameter decorators.
 *
 * @param guardName - Name of guard to inject (default: 'web')
 *
 * @example
 * ```typescript
 * import type { SessionGuard } from '@lockness/auth'
 * import type { UserProvider } from '../auth/user_provider.ts'
 *
 * type WebGuard = SessionGuard<true, UserProvider>
 *
 * @Post('/logout')
 * @InjectGuard('web')
 * async logout(c: Context, guard: WebGuard) {
 *     await guard.logout()
 *     return c.redirect('/login')
 * }
 * ```
 */
export function InjectGuard(
    guardName: string = 'web',
    // deno-lint-ignore no-explicit-any
): (originalMethod: any, context: ClassMethodDecoratorContext) => any {
    // deno-lint-ignore no-explicit-any
    return function <M extends (...methodArgs: any[]) => any>(
        originalMethod: M,
        context: ClassMethodDecoratorContext,
    ) {
        if (context.kind !== 'method') {
            throw new Error(
                `@InjectGuard can only decorate methods; received ${context.kind}`,
            )
        }

        // Return wrapped method to inject guard before original logic
        const wrapped = async function (
            this: unknown,
            firstArg: unknown,
            ...args: unknown[]
        ) {
            if (!firstArg || typeof firstArg !== 'object') {
                throw new Error(
                    '@InjectGuard expects the first argument to be the request context',
                )
            }

            const c = firstArg as Context
            const auth = getAuth(c)
            const guard = auth.use(guardName)

            return await (originalMethod as (...allArgs: unknown[]) => unknown)
                .apply(this, [c, guard, ...args])
        }

        return wrapped as unknown as M
    }
}

/**
 * Export for backward compatibility
 * @deprecated Use @InjectGuard instead
 */
export { InjectGuard as Guard }

/**
 * Decorator: Authentication is optional
 * Enriches context with c.auth.* but doesn't require user to be authenticated.
 * User may be undefined in c.get('auth').
 *
 * @param guardName - Name of guard to use (default: 'web')
 *
 * @example
 * ```typescript
 * @Get('/login')
 * @AuthOptional()
 * showLogin(c: Context) {
 *     const auth = c.get('auth')
 *     if (auth?.user) {
 *         return c.redirect('/profile')
 *     }
 *     return c.html('<form>Login</form>')
 * }
 * ```
 */
// deno-lint-ignore no-explicit-any
export function AuthOptional(guardName?: string): any {
    const middleware: MiddlewareHandler = authOptional(guardName ?? 'web')
    return UseMiddleware(middleware)
}

/**
 * Decorator: Authentication is required
 * Protects routes by requiring authentication using specified guard.
 * Redirects to specified path if user is not authenticated.
 * Also enriches context with c.auth.* API.
 *
 * User is guaranteed to exist in c.get('auth')?.user.
 *
 * @param options - Configuration object with guardName and optional redirectTo
 * @param options.guardName - Name of guard to use (default: 'web')
 * @param options.redirectTo - Path to redirect to if not authenticated (default: 401 response)
 *
 * @example
 * ```typescript
 * @Get('/profile')
 * @AuthRequired({ redirectTo: '/login' })
 * profile(c: Context) {
 *     const auth = c.get('auth')
 *     const user = auth?.user // ✨ Guaranteed to exist
 *     return c.json({ user })
 * }
 * ```
 */
// deno-lint-ignore no-explicit-any
export function AuthRequired(
    // deno-lint-ignore no-explicit-any
    options?: string | { guardName?: string; redirectTo?: string },
): any {
    // Support both old string parameter and new options object
    let guardName = 'web'
    let redirectTo: string | undefined

    if (typeof options === 'string') {
        // Legacy: AuthRequired('web') or AuthRequired('/login')
        // If it looks like a path (starts with /), treat as redirectTo
        if (options.startsWith('/')) {
            redirectTo = options
        } else {
            guardName = options
        }
    } else if (options && typeof options === 'object') {
        guardName = options.guardName ?? 'web'
        redirectTo = options.redirectTo
    }

    const middleware: MiddlewareHandler = authRequired(guardName, redirectTo)
    return UseMiddleware(middleware)
}

/**
 * Decorator: Require specific guard authentication
 * Alias for AuthRequired() with more explicit naming.
 *
 * @param guardName - Name of guard to require
 *
 * @example
 * ```typescript
 * @Post('/api/data')
 * @AuthGuard('api')
 * async getData(c: Context) {
 *     const user = c.get('auth')?.user
 *     return c.json({ data: [] })
 * }
 * ```
 */
// deno-lint-ignore no-explicit-any
export function AuthGuard(guardName: string): any {
    const middleware: MiddlewareHandler = authGuard(guardName)
    return UseMiddleware(middleware)
}
