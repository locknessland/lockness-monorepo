// deno-lint-ignore-file no-slow-types
/**
 * @fileoverview Authentication type definitions.
 *
 * Core interfaces and types for the authentication system.
 * Inspired by AdonisJS auth architecture.
 *
 * @module @lockness/auth/types
 */

import type { Context } from 'hono'

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
 *
 * Your User model should implement this interface.
 * The `id` field is required for session persistence.
 *
 * @example
 * ```typescript
 * interface User extends Authenticatable {
 *   id: number
 *   email: string
 *   password: string
 *   name: string
 * }
 * ```
 */
export interface Authenticatable {
    /** Unique user identifier (used for session storage) */
    id: number | string
    /** User email address (used for credential lookup) */
    email?: string
    /** Hashed password (never expose in responses) */
    password?: string
    /** Additional user properties */
    [key: string]: unknown
}

/**
 * Authentication response for testing clients.
 *
 * Used by testing utilities to simulate authentication.
 * Contains headers, cookies, and session data needed to
 * authenticate subsequent requests in tests.
 *
 * @example
 * ```typescript
 * const response = await guard.authenticateAsClient(user)
 * // Use response.cookies in test requests
 * ```
 */
export interface AuthClientResponse {
    /** HTTP headers to include in authenticated requests */
    headers?: Record<string, string>
    /** Cookies to set for authenticated session */
    cookies?: Record<string, string>
    /** Session data to persist */
    session?: Record<string, unknown>
}

// =============================================================================
// Guard Contract
// =============================================================================

/**
 * Core contract that all authentication guards must implement.
 *
 * A guard is responsible for authenticating HTTP requests using
 * a specific authentication method (session, tokens, basic auth, etc.)
 *
 * @typeParam User - The user type this guard authenticates
 *
 * @example
 * ```typescript
 * class CustomGuard implements GuardContract<User> {
 *   readonly driverName = 'custom'
 *   user?: User
 *   isAuthenticated = false
 *   authenticationAttempted = false
 *
 *   async authenticate(): Promise<User> {
 *     // Custom authentication logic
 *   }
 * }
 * ```
 */
export interface GuardContract<User extends Authenticatable> {
    /**
     * Unique name for the guard driver.
     * Used for identification in logs and events.
     */
    readonly driverName: string

    /**
     * Reference to the currently authenticated user.
     * Undefined until `authenticate()` or `check()` succeeds.
     */
    user?: User

    /**
     * Whether the current request has been authenticated.
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
     * Authenticates the current request and throws if not authenticated.
     * @throws {UnauthorizedAccessError} When authentication fails
     */
    authenticate(): Promise<User>

    /**
     * Check if request is authenticated without throwing.
     * @returns True if authenticated, false otherwise
     */
    check(): Promise<boolean>

    /**
     * Authenticate a user as a client (for testing).
     * @param user - The user to authenticate as
     * @param args - Additional arguments specific to the guard
     * @returns Authentication response with headers/cookies
     */
    authenticateAsClient(
        user: User,
        ...args: unknown[]
    ): Promise<AuthClientResponse>

    /**
     * Symbol for inferring guard events.
     * @internal
     */
    [GUARD_KNOWN_EVENTS]?: unknown
}

/**
 * Session guard contract with login/logout methods.
 *
 * Extends the base guard contract with session-specific operations.
 *
 * @typeParam User - The user type this guard authenticates
 *
 * @example
 * ```typescript
 * const guard = auth.use('web') as SessionGuardContract<User>\n * await guard.login('user@example.com', 'password')\n * await guard.logout()\n * ```
 */
export interface SessionGuardContract<User extends Authenticatable>
    extends GuardContract<User> {
    /**
     * Login a user with credentials.
     * @param email - User email address
     * @param password - User password (plain text)
     * @param remember - Whether to persist session with remember-me token
     * @throws {InvalidCredentialsError} When credentials are invalid
     */
    login(email: string, password: string, remember?: boolean): Promise<User>

    /**
     * Login a user by their ID.
     * @param id - User unique identifier
     * @param remember - Whether to persist session with remember-me token
     * @throws {InvalidCredentialsError} When user not found
     */
    loginById(id: number | string, remember?: boolean): Promise<User>

    /**
     * Logout the current user.
     * Clears session and remember-me tokens.
     */
    logout(): Promise<void>
}

// =============================================================================
// Guard Factory
// =============================================================================

/**
 * Factory function to create a guard instance for an HTTP request.
 *
 * @typeParam User - The user type this guard authenticates
 *
 * @example
 * ```typescript
 * const sessionGuardFactory: GuardFactory<User> = (ctx) =>
 *   new SessionGuard('web', ctx, userProvider)
 * ```
 */
export type GuardFactory<User extends Authenticatable = Authenticatable> = (
    ctx: Context,
) => GuardContract<User>

/**
 * Configuration for multiple guards.
 *
 * @typeParam Guards - Record of guard name to factory function
 *
 * @example
 * ```typescript
 * const config: AuthConfig<typeof guards> = {
 *   default: 'web',
 *   guards: {
 *     web: sessionGuardFactory,
 *     api: tokenGuardFactory,
 *   },
 * }
 * ```
 */
export interface AuthConfig<
    Guards extends Record<string, GuardFactory> = Record<string, GuardFactory>,
> {
    /**
     * Default guard name.
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
export interface UserProviderContract<
    User extends Authenticatable = Authenticatable,
> {
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
export interface SessionUserProviderContract<
    User extends Authenticatable = Authenticatable,
> extends UserProviderContract<User> {
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
export interface SessionWithRememberMeProviderContract<
    User extends Authenticatable = Authenticatable,
> extends SessionUserProviderContract<User> {
    /**
     * Create a remember me token for a user
     */
    createRememberToken(user: User, expiresIn: number): Promise<RememberMeToken>

    /**
     * Verify a remember me token and return the user
     */
    verifyRememberToken(
        tokenValue: string,
    ): Promise<{ user: User; token: RememberMeToken } | null>

    /**
     * Delete a remember me token
     */
    deleteRememberToken(user: User, tokenId: string | number): Promise<void>

    /**
     * Delete **every** remember-me token for a user (#147).
     *
     * Called by the guard's per-user eviction (`logoutEverywhere` /
     * `logoutOthers`) so a captured remember-me cookie cannot re-mint a
     * post-eviction session — its recycle would carry a fresh `iat` past the
     * eviction epoch and survive (security F2). Distinct from
     * {@link SessionWithRememberMeProviderContract.deleteRememberToken}, which
     * drops one token by id.
     *
     * @param user - The token owner whose remember-me credentials to invalidate.
     * @throws If the underlying delete fails — the caller MUST propagate (a silent
     *   failure leaves a re-mint path open).
     */
    deleteAllRememberTokens(user: User): Promise<void>

    /**
     * Recycle a remember me token (for security).
     *
     * Receives the **whole verified token** (not just its id) so the renewed
     * token can carry the origin forward: the implementation MUST bare-copy
     * `firstIssuedAt` from the passed token onto the new one
     * (`new.firstIssuedAt = token.firstIssuedAt`) — never re-mint it. The guard
     * resolves the origin before calling, so a provider does no fallback logic
     * of its own (#146; the absolute-lifetime cap depends on this preservation).
     *
     * @param user - The token's owner.
     * @param token - The verified token being rotated; its `identifier` names the
     *   row to delete and its `firstIssuedAt` is the origin to preserve.
     * @param expiresIn - Lifetime of the new token, in seconds.
     * @returns The freshly minted token, carrying the preserved `firstIssuedAt`.
     */
    recycleRememberToken(
        user: User,
        token: RememberMeToken,
        expiresIn: number,
    ): Promise<RememberMeToken>
}

/**
 * User provider for token-based authentication (API)
 */
export interface TokenUserProviderContract<
    User extends Authenticatable = Authenticatable,
> extends UserProviderContract<User> {
    /**
     * Find user by credentials for token generation
     */
    findByCredentials(email: string, password: string): Promise<User | null>

    /**
     * Create an access token for a user
     */
    createToken(
        user: User,
        name: string,
        expiresIn?: number,
    ): Promise<AccessToken>

    /**
     * Verify an access token and return the user
     */
    verifyToken(
        tokenValue: string,
    ): Promise<{ user: User; token: AccessToken } | null>

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
export interface BasicAuthUserProviderContract<
    User extends Authenticatable = Authenticatable,
> extends UserProviderContract<User> {
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
     * First-issuance instant of this credential's renewal chain (#146).
     *
     * Unlike {@link createdAt}, which a renewal re-mints, this is the origin
     * the {@link SessionGuardOptions.rememberMeAbsoluteLifetime} cap is measured
     * from and must be **preserved across every renewal** (the provider bare-copies
     * it in `recycleRememberToken`). Optional: absent on tokens issued before the
     * cap existed, in which case the guard freezes it from {@link createdAt} on the
     * first recycle.
     */
    firstIssuedAt?: Date

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
export interface SessionGuardEvents<
    User extends Authenticatable = Authenticatable,
> {
    'session:login': { user: User }
    'session:logout': { user: User }
    'session:authenticate': { user: User }
    'session:authentication_failed': { error: Error }
    'session:remember_token_created': { user: User; token: RememberMeToken }
    'session:remember_token_verified': { user: User; token: RememberMeToken }
    'session:remember_token_recycled': {
        user: User
        oldToken: RememberMeToken
        newToken: RememberMeToken
    }
}

/**
 * Events emitted by the token guard
 */
export interface TokenGuardEvents<
    User extends Authenticatable = Authenticatable,
> {
    'token:authenticate': { user: User; token: AccessToken }
    'token:authentication_failed': { error: Error }
    'token:created': { user: User; token: AccessToken }
    'token:deleted': { user: User; tokenId: string | number }
}

/**
 * Events emitted by the basic auth guard
 */
export interface BasicAuthGuardEvents<
    User extends Authenticatable = Authenticatable,
> {
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
     * Absolute lifetime cap for the remember-me credential, in seconds (#146).
     *
     * When set, a remember-me token is refused once its age from first issuance
     * ({@link RememberMeToken.firstIssuedAt}, preserved across renewals) exceeds
     * this value — no matter how often it was renewed. **Off by default** (unset).
     * Fail-closed: a value `≤ 0` or `NaN` is rejected at construction, never
     * treated as "off".
     */
    rememberMeAbsoluteLifetime?: number

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
// deno-lint-ignore no-explicit-any
export type InferGuardUser<T extends GuardContract<any>> = T extends
    GuardContract<infer U> ? U : never

/**
 * Infer the user type from a provider contract
 */
// deno-lint-ignore no-explicit-any
export type InferProviderUser<T extends UserProviderContract<any>> =
    T[typeof PROVIDER_REAL_USER]

// =============================================================================
// Auth Context API (Fluent Interface)
// =============================================================================

/**
 * Auth Context API
 *
 * Provides a fluent interface for authentication operations.
 * Automatically available on Context when auth middleware is applied.
 *
 * @example
 * ```typescript
 * @Post('/logout')
 * @Use('auth')
 * async logout(c: Context) {
 *     await c.auth.logout()
 *     return c.redirect('/login')
 * }
 * ```
 */
// deno-lint-ignore no-explicit-any
export interface AuthContext<TUser = any> {
    /**
     * Currently authenticated user (undefined if not authenticated)
     */
    user: TUser | undefined

    /**
     * Check if user is authenticated
     */
    check(): Promise<boolean>

    /**
     * Login user with credentials
     *
     * @param email - User email
     * @param password - User password
     * @param remember - Whether to persist session (default: false)
     */
    login(email: string, password: string, remember?: boolean): Promise<TUser>

    /**
     * Login user by ID
     *
     * @param id - User ID
     * @param remember - Whether to persist session (default: false)
     */
    loginById(id: number | string, remember?: boolean): Promise<TUser>

    /**
     * Logout current user
     */
    logout(): Promise<void>

    /**
     * Get the underlying guard instance
     * Use this for advanced operations not covered by the fluent API
     */
    // deno-lint-ignore no-explicit-any
    guard(): any
}

/**
 * Type helper for SessionGuard with typed UserProvider
 *
 * @example
 * ```typescript
 * import type { UserProvider } from '../auth/user_provider.ts'
 *
 * type WebGuard = TypedSessionGuard<UserProvider>
 *
 * @InjectGuard('web')
 * async logout(c: Context, guard: WebGuard) {
 *     // guard is fully typed
 * }
 * ```
 */
// deno-lint-ignore no-explicit-any
export type TypedSessionGuard<TProvider extends UserProviderContract<any>> =
    // deno-lint-ignore no-explicit-any
    GuardContract<any> & {
        login(
            email: string,
            password: string,
            remember?: boolean,
        ): Promise<TProvider[typeof PROVIDER_REAL_USER]>
        loginById(
            id: number | string,
            remember?: boolean,
        ): Promise<TProvider[typeof PROVIDER_REAL_USER]>
        logout(): Promise<void>
    }

/**
 * Augment Context from hono with auth property
 *
 * Note: The 'auth' key is stored in context variables by the auth middleware.
 * You can access it via c.get('auth') to get the AuthContext.
 *
 * @example
 * ```typescript
 * @Post('/logout')
 * async logout(c: Context) {
 *     const auth = c.get('auth')
 *     await auth.logout()
 *     return c.redirect('/login')
 * }
 * ```
 */
/**
 * Type Helper: Get typed auth context from Hono Context
 * Since ambient modules are not JSR-compatible, use this helper for proper typing:
 *
 * @example
 * ```typescript
 * import { type AuthContext } from '@lockness/auth'
 *
 * @Post('/logout')
 * @Use('auth')
 * async logout(c: Context) {
 *     const auth = c.get('auth') as AuthContext
 *     await auth.logout()
 *     return c.redirect('/login')
 * }
 * ```
 */
