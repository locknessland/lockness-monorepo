/**
 * @lockness/auth - Auth Middleware
 *
 * Middleware to protect routes by requiring authentication.
 * Use this middleware on routes that need authentication.
 */

import type { Context } from 'hono'
import type { MiddlewareHandler } from 'hono'
import { getAuth } from './initialize_auth_middleware.ts'
import type { AuthContext } from '../types.ts'

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
 * Create auth context enrichment middleware.
 * This enriches the context with c.auth.* fluent API.
 *
 * @param guardName - Name of guard to use (default: 'web')
 */
function createAuthContext(guardName: string = 'web'): MiddlewareHandler {
    return async (c: Context, next: () => Promise<void>) => {
        const authManager = getAuth(c)
        const guard = authManager.use(guardName)

        // Enrich context with fluent auth API
        const authContext: AuthContext = {
            get user() {
                return authManager.user
            },

            check: async () => {
                return await authManager.checkUsing(guardName)
            },

            login: async (
                email: string,
                password: string,
                remember = false,
            ) => {
                // Type assertion to access guard-specific methods
                // deno-lint-ignore no-explicit-any
                const sessionGuard = guard as any
                if (typeof sessionGuard.login !== 'function') {
                    throw new Error(
                        `Guard "${guardName}" does not support login method`,
                    )
                }
                return await sessionGuard.login(email, password, remember)
            },

            loginById: async (id: number | string, remember = false) => {
                // Type assertion to access guard-specific methods
                // deno-lint-ignore no-explicit-any
                const sessionGuard = guard as any
                if (typeof sessionGuard.loginById !== 'function') {
                    throw new Error(
                        `Guard "${guardName}" does not support loginById method`,
                    )
                }
                return await sessionGuard.loginById(id, remember)
            },

            logout: async () => {
                // Type assertion to access guard-specific methods
                // deno-lint-ignore no-explicit-any
                const sessionGuard = guard as any
                if (typeof sessionGuard.logout !== 'function') {
                    throw new Error(
                        `Guard "${guardName}" does not support logout method`,
                    )
                }
                return await sessionGuard.logout()
            },

            guard: () => guard,
        }

        // Set on context
        c.set('auth', authContext)

        await next()
    }
}

/**
 * Auth middleware factory.
 * Protects routes by requiring authentication using specified guard(s).
 * Also enriches context with c.auth.* fluent API.
 *
 * @example
 * // Use default guard with c.auth.* API
 * app.get('/profile', authMiddleware(), (c) => {
 *   const user = c.auth.user
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
export function authMiddleware(
    options?: AuthMiddlewareOptions,
): MiddlewareHandler {
    return async (c: Context, next: () => Promise<void>) => {
        const guards = options?.guards
        const guardName = typeof guards === 'string' ? guards : 'web'

        // First, enrich context with c.auth.* API
        await createAuthContext(guardName)(c, async () => {})

        // Then perform authentication check
        const auth = getAuth(c)

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
 * Also enriches context with c.auth.* API.
 *
 * @example
 * app.get('/login', guestMiddleware({ redirectTo: '/dashboard' }), (c) => {
 *   return c.html('<form>Login Form</form>')
 * })
 */
export function guestMiddleware(
    options?: { redirectTo?: string; guardName?: string },
): MiddlewareHandler {
    return async (c: Context, next: () => Promise<void>) => {
        const guardName = options?.guardName ?? 'web'

        // First, enrich context with c.auth.* API
        await createAuthContext(guardName)(c, async () => {})

        // Then check authentication
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

/**
 * Create middleware that only enriches context with c.auth.* API
 * without performing authentication checks.
 *
 * Use this when you want c.auth.* available but don't want to require authentication.
 *
 * @param guardName - Name of guard to use (default: 'web')
 *
 * @example
 * app.get('/optional-auth', withAuth(), (c) => {
 *   const user = c.auth.user // May be undefined
 *   return c.json({ user: user ?? null })
 * })
 */
export function withAuth(guardName: string = 'web'): MiddlewareHandler {
    return createAuthContext(guardName)
}

/**
 * Middleware: Authentication is optional
 * Enriches context with c.auth.* but doesn't require user to be authenticated.
 * User may be undefined.
 *
 * @param guardName - Name of guard to use (default: 'web')
 *
 * @example
 * app.get('/login', authOptional(), (c) => {
 *   const user = c.get('auth')?.user // May be undefined
 *   return c.html('<form>Login</form>')
 * })
 */
export function authOptional(guardName: string = 'web'): MiddlewareHandler {
    return createAuthContext(guardName)
}

/**
 * Middleware: Authentication is required
 * Protects routes by requiring authentication using specified guard.
 * Redirects to specified path or returns 401 if user is not authenticated.
 * Also enriches context with c.auth.* API.
 *
 * @param guardName - Name of guard to use (default: 'web')
 * @param redirectTo - Optional path to redirect to if not authenticated
 *
 * @example
 * // With 401 response
 * app.get('/profile', authRequired(), (c) => {
 *   const user = c.get('auth')?.user // Guaranteed to exist
 *   return c.json({ user })
 * })
 *
 * @example
 * // With redirect
 * app.get('/profile', authRequired('web', '/login'), (c) => {
 *   const user = c.get('auth')?.user // Guaranteed to exist
 *   return c.json({ user })
 * })
 */
export function authRequired(
    guardName: string = 'web',
    redirectTo?: string,
): MiddlewareHandler {
    return async (c: Context, next: () => Promise<void>) => {
        // First, enrich context with c.auth.* API
        await createAuthContext(guardName)(c, async () => {})

        // Then require authentication
        const auth = getAuth(c)

        try {
            await auth.authenticateUsing(guardName as keyof typeof auth)
        } catch (error) {
            // If redirectTo is specified, redirect instead of throwing
            if (redirectTo) {
                return c.redirect(redirectTo)
            }
            // Otherwise, re-throw the error (will result in 401)
            throw error
        }

        await next()
    }
}

/**
 * Middleware: Require specific guard authentication
 * Alias for authRequired() with more explicit naming.
 *
 * @param guardName - Name of guard to require
 *
 * @example
 * app.post('/api/data', authGuard('api'), (c) => {
 *   const user = c.get('auth')?.user
 *   return c.json({ success: true })
 * })
 */
export function authGuard(guardName: string): MiddlewareHandler {
    return authRequired(guardName)
}
