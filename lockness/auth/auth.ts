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

// Guards
export { SessionGuard } from './guards/session_guard.ts'
export { TokenGuard } from './guards/token_guard.ts'
export { BasicAuthGuard } from './guards/basic_auth_guard.ts'

// Providers
export { DrizzleSessionProvider } from './providers/drizzle_session_provider.ts'
export { DrizzleTokenProvider } from './providers/drizzle_token_provider.ts'
export { DrizzleBasicAuthProvider } from './providers/drizzle_basic_auth_provider.ts'

export type { DrizzleSessionProviderOptions } from './providers/drizzle_session_provider.ts'
export type { DrizzleTokenProviderOptions } from './providers/drizzle_token_provider.ts'
export type { DrizzleBasicAuthProviderOptions } from './providers/drizzle_basic_auth_provider.ts'

// Middleware
export {
    initializeAuthMiddleware,
    getAuth,
} from './middleware/initialize_auth_middleware.ts'
export { authMiddleware, guestMiddleware } from './middleware/auth_middleware.ts'
export type { AuthMiddlewareOptions } from './middleware/auth_middleware.ts'
