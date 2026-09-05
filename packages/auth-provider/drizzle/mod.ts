/**
 * @fileoverview Drizzle ORM authentication provider implementations.
 *
 * Provides ready-to-use authentication providers for Drizzle ORM.
 * Supports session-based, token-based, and basic authentication.
 *
 * @module @lockness/auth-provider/drizzle
 */

export type {
    DrizzleAuthSchema,
    DrizzleDatabase,
    DrizzleDialect,
} from './database.ts'

export type { DrizzleSessionProviderOptions } from './drizzle_session_provider.ts'
export { DrizzleSessionProvider } from './drizzle_session_provider.ts'

export type { DrizzleTokenProviderOptions } from './drizzle_token_provider.ts'
export { DrizzleTokenProvider } from './drizzle_token_provider.ts'

export type { DrizzleBasicAuthProviderOptions } from './drizzle_basic_auth_provider.ts'
export { DrizzleBasicAuthProvider } from './drizzle_basic_auth_provider.ts'
