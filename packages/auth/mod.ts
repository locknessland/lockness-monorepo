/**
 * @fileoverview Authentication system for Lockness.
 *
 * Robust authentication with multiple guards and providers.
 * Inspired by AdonisJS authentication architecture.
 *
 * @example
 * ```typescript
 * import {
 *   initializeAuthMiddleware,
 *   SessionGuard,
 *   authRequired,
 *   getAuth,
 * } from '@lockness/auth'
 *
 * // Setup guards
 * app.useMiddleware(initializeAuthMiddleware({
 *   default: 'web',
 *   guards: {
 *     web: (c) => new SessionGuard('web', c, userProvider),
 *   },
 * }))
 *
 * // Protect routes
 * app.get('/profile', authRequired('web'), (c) => {
 *   const auth = getAuth(c)
 *   return c.json({ user: auth.user })
 * })
 * ```
 *
 * @module @lockness/auth
 */

// Core
export * from './types.ts'
export * from './errors.ts'
export * from './authenticator.ts'
export * from './password.ts'
export * from './gate.ts'

// Guards
export { SessionGuard } from './guards/session_guard.ts'
export { TokenGuard } from './guards/token_guard.ts'
export { BasicAuthGuard } from './guards/basic_auth_guard.ts'

// Middleware
export {
    getAuth,
    initializeAuthMiddleware,
} from './middleware/initialize_auth_middleware.ts'
export {
    authGuard,
    authMiddleware,
    authOptional,
    authRequired,
    guestMiddleware,
    withAuth,
} from './middleware/auth_middleware.ts'
export type { AuthMiddlewareOptions } from './middleware/auth_middleware.ts'

// Decorators
export {
    AuthGuard,
    AuthOptional,
    AuthRequired,
    Guard,
    InjectGuard,
} from './decorators.ts'
