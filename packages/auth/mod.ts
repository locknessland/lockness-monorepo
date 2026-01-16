/**
 * @lockness/auth
 *
 * Robust authentication system with multiple guards and providers.
 * Inspired by AdonisJS authentication architecture.
 *
 * @module
 */

// Core
export * from './types.ts'
export * from './errors.ts'
export * from './authenticator.ts'
export * from './password.ts'

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
