/**
 * @lockness/auth - Auth Middleware
 * 
 * Middleware to protect routes by requiring authentication.
 * Use this middleware on routes that need authentication.
 */

import type { Context } from 'hono'
import type { GuardFactory } from '../types.ts'
import { getAuth } from './initialize_auth_middleware.ts'

/**
 * Auth middleware options
 */
export interface AuthMiddlewareOptions {
    /**
     * Guard(s) to use for authentication.
     * Can be a single guard name or array of guard names.
     * If array, authentication succeeds if any guard succeeds.
     */
    guards?: string | string[]
}

/**
 * Auth middleware factory.
 * Protects routes by requiring authentication using specified guard(s).
 * 
 * @example
 * // Use default guard
 * app.get('/profile', authMiddleware(), (c) => {
 *   const user = getAuth(c).user
 *   return c.json({ user })
 * })
 * 
 * @example
 * // Use specific guard
 * app.get('/api/users', authMiddleware({ guards: 'api' }), (c) => {
 *   return c.json({ users: [] })
 * })
 * 
 * @example
 * // Try multiple guards (web OR api)
 * app.get('/data', authMiddleware({ guards: ['web', 'api'] }), (c) => {
 *   return c.json({ data: [] })
 * })
 */
export function authMiddleware(options?: AuthMiddlewareOptions) {
    return async (c: Context, next: () => Promise<void>) => {
        const auth = getAuth(c)

        const guards = options?.guards

        if (!guards) {
            // Use default guard
            await auth.authenticate()
        } else if (typeof guards === 'string') {
            // Use specific guard
            await auth.authenticateUsing(guards as keyof typeof auth)
        } else {
            // Try multiple guards
            await auth.authenticateUsingAny(guards as Array<keyof typeof auth>)
        }

        await next()
    }
}

/**
 * Guest middleware - only allow unauthenticated requests.
 * Redirects to a specified path if user is authenticated.
 * 
 * @example
 * app.get('/login', guestMiddleware({ redirectTo: '/dashboard' }), (c) => {
 *   return c.html('<form>Login Form</form>')
 * })
 */
export function guestMiddleware(options?: { redirectTo?: string }) {
    return async (c: Context, next: () => Promise<void>) => {
        const auth = getAuth(c)

        // Check if already authenticated (without throwing)
        const isAuthenticated = await auth.check()

        if (isAuthenticated) {
            const redirectTo = options?.redirectTo ?? '/'
            return c.redirect(redirectTo)
        }

        await next()
    }
}
