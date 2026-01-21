/**
 * @fileoverview Abstract base classes for authentication providers.
 *
 * These classes provide ORM-agnostic implementations of common authentication
 * patterns. Extend these classes with your ORM-specific logic.
 *
 * @module @lockness/auth-provider/base
 */

export { SessionProviderBase } from './session_provider_base.ts'
export { TokenProviderBase } from './token_provider_base.ts'
export { BasicAuthProviderBase } from './basic_auth_provider_base.ts'
