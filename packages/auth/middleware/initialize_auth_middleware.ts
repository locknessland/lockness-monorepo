/**
 * @lockness/auth - Initialize Auth Middleware
 *
 * Middleware to initialize the authenticator and attach it to the context.
 * This middleware should be registered globally in your application.
 */

import type { Context } from 'hono'
import type { AuthConfig, GuardFactory } from '../types.ts'
import { Authenticator } from '../authenticator.ts'

/**
 * Initialize auth middleware factory.
 * Creates a middleware that initializes the authenticator for each request.
 *
 * @example
 * const app = new App()
 *
 * app.use('*', initializeAuthMiddleware({
 *   default: 'web',
 *   guards: {
 *     web: sessionGuardFactory,
 *     api: tokenGuardFactory
 *   }
 * }))
 */
export function initializeAuthMiddleware<
    Guards extends Record<string, GuardFactory>,
>(
    config: AuthConfig<Guards>,
): import('hono').MiddlewareHandler {
    return async (c: Context, next: () => Promise<void>) => {
        // Create authenticator instance
        const auth = new Authenticator(c, config) // Attach to context under __auth key to avoid conflicts with fluent API
         // deno-lint-ignore no-explicit-any
        ;(c as any).__auth = auth

        await next()
    }
}

/**
 * Get the authenticator from the context
 *
 * @throws {Error} When auth middleware is not initialized
 *
 * @example
 * const auth = getAuth(c)
 * await auth.authenticate()
 */
export function getAuth<
    Guards extends Record<string, GuardFactory> = Record<string, GuardFactory>,
>(
    c: Context,
): Authenticator<Guards> {
    // deno-lint-ignore no-explicit-any
    const auth = (c as any).__auth as Authenticator<Guards> | undefined

    if (!auth) {
        throw new Error(
            'Auth middleware not initialized. Use initializeAuthMiddleware() first.',
        )
    }

    return auth
}
