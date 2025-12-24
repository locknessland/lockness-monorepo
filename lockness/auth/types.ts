/**
 * @lockness/auth - Types & Interfaces
 * 
 * Core type definitions for the authentication system.
 * Inspired by AdonisJS auth architecture.
 */

import type { Context } from 'hono'
import type { Session } from '@lockness/session'
import type { EventEmitter } from '@lockness/events'

// =============================================================================
// Core Authentication Types
// =============================================================================

/**
 * Symbol to access the real user type from a provider
 */
export const PROVIDER_REAL_USER = Symbol('PROVIDER_REAL_USER')

/**
 * Symbol to access known events from a guard
 */
export const GUARD_KNOWN_EVENTS = Symbol('GUARD_KNOWN_EVENTS')

/**
 * Authenticatable user interface.
 * Your User model should implement this.
 */
export interface Authenticatable {
    id: number | string
    email?: string
    password?: string
    [key: string]: unknown
}

/**
 * Authentication response for testing clients.
 * Used by testing utilities to simulate authentication.
 */
export interface AuthClientResponse {
    headers?: Record<string, string>
    cookies?: Record<string, string>
    session?: Record<string, unknown>
}

// =============================================================================
// Guard Contract
// =============================================================================

/**
 * Core contract that all authentication guards must implement.
 * A guard is responsible for authenticating HTTP requests using
 * a specific authentication method (session, tokens, basic auth, etc.)
 */
export interface GuardContract<User extends Authenticatable> {
    /**
     * Unique name for the guard driver
     */
    readonly driverName: string

    /**
     * Reference to the currently authenticated user
     */
    user?: User

    /**
     * Whether the current request has been authenticated
     */
    isAuthenticated: boolean

    /**
     * Whether authentication has been attempted during the request
     */
    authenticationAttempted: boolean

    /**
     * Returns logged-in user or throws an exception
     */
    getUserOrFail(): User

    /**
     * Authenticates the current request and throws if not authenticated
     */
    authenticate(): Promise<User>

    /**
     * Check if request is authenticated without throwing
     */
    check(): Promise<boolean>

    /**
     * Authenticate a user as a client (for testing)
     */
    authenticateAsClient(user: User, ...args: unknown[]): Promise<AuthClientResponse>

    /**
     * Symbol for inferring guard events
     */
    [GUARD_KNOWN_EVENTS]?: unknown
}

// =============================================================================
// Guard Factory
// =============================================================================

/**
 * Factory function to create a guard instance for an HTTP request
 */
export type GuardFactory<User extends Authenticatable = Authenticatable> = (
    ctx: Context,
) => GuardContract<User>

/**
 * Configuration for multiple guards
 */
export interface AuthConfig<Guards extends Record<string, GuardFactory> = Record<string, GuardFactory>> {
    /**
     * Default guard name
     */
    default: keyof Guards

    /**
     * Available guards
     */
    guards: Guards
}

// =============================================================================
// User Provider Contracts
// =============================================================================

/**
 * Base user provider for authentication guards.
 * Responsible for finding users and verifying credentials.
 */
export interface UserProviderContract<User extends Authenticatable = Authenticatable> {
    /**
     * Symbol to access the real user type
     */
    [PROVIDER_REAL_USER]: User

    /**
     * Find a user by their unique identifier
     */
    findById(id: string | number): Promise<User | null>
}

/**
 * User provider for session-based authentication
 */
export interface SessionUserProviderContract<User extends Authenticatable = Authenticatable>
    extends UserProviderContract<User> {
    /**
     * Find user by credentials (email/password)
     */
    findByCredentials(email: string, password: string): Promise<User | null>

    /**
     * Verify password hash
     */
    verifyPassword(plain: string, hash: string): Promise<boolean>
}

/**
 * User provider with remember me token support
 */
export interface SessionWithRememberMeProviderContract<User extends Authenticatable = Authenticatable>
    extends SessionUserProviderContract<User> {
    /**
     * Create a remember me token for a user
     */
    createRememberToken(user: User, expiresIn: number): Promise<RememberMeToken>

    /**
     * Verify a remember me token and return the user
     */
    verifyRememberToken(tokenValue: string): Promise<{ user: User; token: RememberMeToken } | null>

    /**
     * Delete a remember me token
     */
    deleteRememberToken(user: User, tokenId: string | number): Promise<void>

    /**
     * Recycle a remember me token (for security)
     */
    recycleRememberToken(
        user: User,
        tokenId: string | number,
        expiresIn: number,
    ): Promise<RememberMeToken>
}

/**
 * User provider for token-based authentication (API)
 */
export interface TokenUserProviderContract<User extends Authenticatable = Authenticatable>
    extends UserProviderContract<User> {
    /**
     * Find user by credentials for token generation
     */
    findByCredentials(email: string, password: string): Promise<User | null>

    /**
     * Create an access token for a user
     */
    createToken(user: User, name: string, expiresIn?: number): Promise<AccessToken>

    /**
     * Verify an access token and return the user
     */
    verifyToken(tokenValue: string): Promise<{ user: User; token: AccessToken } | null>

    /**
     * Delete a token
     */
    deleteToken(user: User, tokenId: string | number): Promise<void>

    /**
     * Delete all tokens for a user
     */
    deleteAllTokens(user: User): Promise<void>
}

/**
 * User provider for basic authentication
 */
export interface BasicAuthUserProviderContract<User extends Authenticatable = Authenticatable>
    extends UserProviderContract<User> {
    /**
     * Find user by credentials (email/password)
     */
    findByCredentials(email: string, password: string): Promise<User | null>

    /**
     * Verify password hash
     */
    verifyPassword(plain: string, hash: string): Promise<boolean>
}

// =============================================================================
// Token Types
// =============================================================================

/**
 * Remember me token for persistent authentication
 */
export interface RememberMeToken {
    /**
     * Token identifier (stored in database)
     */
    identifier: string | number

    /**
     * The token value (hashed in database, plain in cookie)
     */
    value: string

    /**
     * Token hash (stored in database)
     */
    hash: string

    /**
     * User ID associated with the token
     */
    userId: string | number

    /**
     * Token expiration date
     */
    expiresAt: Date

    /**
     * Token creation date
     */
    createdAt: Date

    /**
     * Token last updated date
     */
    updatedAt?: Date
}

/**
 * Access token for API authentication
 */
export interface AccessToken {
    /**
     * Token identifier
     */
    identifier: string | number

    /**
     * Token name (for user identification)
     */
    name: string

    /**
     * The token value (hashed in database, plain returned once)
     */
    value: string

    /**
     * Token hash (stored in database)
     */
    hash: string

    /**
     * User ID associated with the token
     */
    userId: string | number

    /**
     * Token abilities/scopes (optional)
     */
    abilities?: string[]

    /**
     * Token expiration date (optional)
     */
    expiresAt?: Date

    /**
     * Token creation date
     */
    createdAt: Date

    /**
     * Last used date
     */
    lastUsedAt?: Date
}

// =============================================================================
// Guard Events
// =============================================================================

/**
 * Events emitted by the session guard
 */
export interface SessionGuardEvents<User extends Authenticatable = Authenticatable> {
    'session:login': { user: User }
    'session:logout': { user: User }
    'session:authenticate': { user: User }
    'session:authentication_failed': { error: Error }
    'session:remember_token_created': { user: User; token: RememberMeToken }
    'session:remember_token_verified': { user: User; token: RememberMeToken }
    'session:remember_token_recycled': { user: User; oldToken: RememberMeToken; newToken: RememberMeToken }
}

/**
 * Events emitted by the token guard
 */
export interface TokenGuardEvents<User extends Authenticatable = Authenticatable> {
    'token:authenticate': { user: User; token: AccessToken }
    'token:authentication_failed': { error: Error }
    'token:created': { user: User; token: AccessToken }
    'token:deleted': { user: User; tokenId: string | number }
}

/**
 * Events emitted by the basic auth guard
 */
export interface BasicAuthGuardEvents<User extends Authenticatable = Authenticatable> {
    'basic_auth:authenticate': { user: User }
    'basic_auth:authentication_failed': { error: Error }
}

// =============================================================================
// Guard Options
// =============================================================================

/**
 * Options for session guard
 */
export interface SessionGuardOptions {
    /**
     * Whether to use remember me tokens
     */
    useRememberMeTokens?: boolean

    /**
     * Remember me token lifetime in seconds (default: 30 days)
     */
    rememberMeTokensAge?: number

    /**
     * Session key name (default: 'auth_user_id')
     */
    sessionKeyName?: string
}

/**
 * Options for token guard
 */
export interface TokenGuardOptions {
    /**
     * Token type (default: 'Bearer')
     */
    tokenType?: string

    /**
     * Token prefix in Authorization header (default: 'Bearer')
     */
    prefix?: string
}

/**
 * Options for basic auth guard
 */
export interface BasicAuthGuardOptions {
    /**
     * Realm for WWW-Authenticate header
     */
    realm?: string
}

// =============================================================================
// Utility Types
// =============================================================================

/**
 * Infer the user type from a guard
 */
export type InferGuardUser<T extends GuardContract<any>> = T extends GuardContract<infer U> ? U : never

/**
 * Infer the user type from a provider
 */
export type InferProviderUser<T extends UserProviderContract<any>> = T[typeof PROVIDER_REAL_USER]
