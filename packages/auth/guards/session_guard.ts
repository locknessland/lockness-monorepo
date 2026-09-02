/**
 * @fileoverview Session-based authentication guard.
 *
 * Uses cookies and session storage for persistent authentication.
 * Supports "Remember Me" functionality for extended sessions.
 *
 * @module @lockness/auth/guards/session
 */

import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from '@lockness/hono'
import { getSession, type Session } from '@lockness/session'
import type { EventEmitter } from '@lockness/events'
import type {
    AuthClientResponse,
    Authenticatable,
    GUARD_KNOWN_EVENTS,
    GuardContract,
    PROVIDER_REAL_USER,
    SessionGuardEvents,
    SessionGuardOptions,
    SessionUserProviderContract,
    SessionWithRememberMeProviderContract,
} from '../types.ts'
import {
    AuthenticationRequiredError,
    InvalidCredentialsError,
    UnauthorizedAccessError,
} from '../errors.ts'

/**
 * Session Guard uses cookies and session storage to track
 * logged-in user information across requests.
 *
 * @example
 * const guard = new SessionGuard(
 *   'web',
 *   ctx,
 *   userProvider,
 *   { useRememberMeTokens: true },
 *   emitter
 * )
 *
 * await guard.login('user@example.com', 'password')
 * const user = await guard.authenticate()
 */
export class SessionGuard<
    UseRememberTokens extends boolean,
    UserProvider extends UseRememberTokens extends true
        ? SessionWithRememberMeProviderContract<Authenticatable>
        : SessionUserProviderContract<Authenticatable>,
> implements GuardContract<UserProvider[typeof PROVIDER_REAL_USER]> {
    /**
     * Type signature for events
     */
    declare [GUARD_KNOWN_EVENTS]: SessionGuardEvents<
        UserProvider[typeof PROVIDER_REAL_USER]
    >

    /**
     * Guard driver name
     */
    readonly driverName = 'session'

    /**
     * Guard name (e.g., 'web')
     */
    #name: string

    /**
     * HTTP context
     */
    #ctx: Context

    /**
     * Session instance
     */
    #session: Session

    /**
     * User provider
     */
    #userProvider: UserProvider

    /**
     * Guard options.
     *
     * Every field is resolved to a concrete default except
     * `rememberMeAbsoluteLifetime`, which stays optional: `undefined` is the
     * meaningful "cap off" state (#146), so it is not forced to a default.
     */
    #options:
        & Required<Omit<SessionGuardOptions, 'rememberMeAbsoluteLifetime'>>
        & Pick<SessionGuardOptions, 'rememberMeAbsoluteLifetime'>

    /**
     * Event emitter
     */
    #emitter?: EventEmitter<
        SessionGuardEvents<UserProvider[typeof PROVIDER_REAL_USER]>
    >

    /**
     * Currently authenticated user
     */
    user?: UserProvider[typeof PROVIDER_REAL_USER]

    /**
     * Whether request has been authenticated
     */
    isAuthenticated = false

    /**
     * Whether authentication has been attempted
     */
    authenticationAttempted = false

    /**
     * Whether authenticated via remember me token
     */
    viaRemember = false

    /**
     * Whether remember me token was attempted
     */
    attemptedViaRemember = false

    /**
     * Whether user has been logged out
     */
    isLoggedOut = false

    /**
     * Session key name for storing user ID
     */
    get sessionKeyName(): string {
        return this.#options.sessionKeyName || `auth_${this.#name}`
    }

    /**
     * Cookie name for remember me token
     */
    get rememberMeKeyName(): string {
        return `remember_${this.#name}`
    }

    /**
     * Create a session guard.
     *
     * @param name - Guard name (e.g. `'web'`), used for cookie and session keys.
     * @param ctx - The Hono request context.
     * @param userProvider - The user provider backing this guard.
     * @param options - Optional guard options. When
     *   {@link SessionGuardOptions.rememberMeAbsoluteLifetime} is set it is
     *   validated fail-closed (#146).
     * @param emitter - Optional event emitter for guard lifecycle events.
     * @throws {RangeError} When `options.rememberMeAbsoluteLifetime` is present
     *   but not a positive, finite number — a misconfigured cap is rejected, never
     *   silently treated as "off".
     */
    constructor(
        name: string,
        ctx: Context,
        userProvider: UserProvider,
        options?: SessionGuardOptions,
        emitter?: EventEmitter<
            SessionGuardEvents<UserProvider[typeof PROVIDER_REAL_USER]>
        >,
    ) {
        this.#name = name
        this.#ctx = ctx
        this.#session = getSession(ctx)
        this.#userProvider = userProvider
        this.#emitter = emitter
        // Fail-closed on a misconfigured cap: a value that is not a positive,
        // finite number is rejected, never silently treated as "off" (#146).
        // Only `undefined` disables the cap.
        const cap = options?.rememberMeAbsoluteLifetime
        if (
            cap !== undefined &&
            (typeof cap !== 'number' || !Number.isFinite(cap) || cap <= 0)
        ) {
            throw new RangeError(
                'rememberMeAbsoluteLifetime must be a positive number of seconds, or omitted to disable the cap',
            )
        }

        this.#options = {
            useRememberMeTokens: options?.useRememberMeTokens ?? false,
            rememberMeTokensAge: options?.rememberMeTokensAge ?? 2592000, // 30 days
            rememberMeAbsoluteLifetime: cap,
            sessionKeyName: options?.sessionKeyName ?? `auth_${name}`,
        }
    }

    /**
     * Get authenticated user or throw
     */
    getUserOrFail(): UserProvider[typeof PROVIDER_REAL_USER] {
        if (!this.user) {
            throw new AuthenticationRequiredError('User is not authenticated')
        }
        return this.user
    }

    /**
     * Authenticate the current request
     *
     * @throws {UnauthorizedAccessError} When authentication fails
     */
    async authenticate(): Promise<UserProvider[typeof PROVIDER_REAL_USER]> {
        if (this.authenticationAttempted) {
            return this.getUserOrFail()
        }

        this.authenticationAttempted = true

        // Try session authentication first
        const userId = this.#session.get<string | number>(this.sessionKeyName)
        if (userId) {
            const user = await this.#userProvider.findById(userId)
            if (user) {
                this.user = user
                this.isAuthenticated = true
                this.#emitter?.emit('session:authenticate', { user })
                return user
            }
        }

        // Try remember me token if enabled
        if (this.#options.useRememberMeTokens) {
            const user = await this.#authenticateViaRememberToken()
            if (user) {
                return user
            }
        }

        // Authentication failed
        const error = new UnauthorizedAccessError('Unauthorized access')
        this.#emitter?.emit('session:authentication_failed', { error })
        throw error
    }

    /**
     * Check if request is authenticated without throwing
     */
    async check(): Promise<boolean> {
        try {
            await this.authenticate()
            return true
        } catch {
            return false
        }
    }

    /**
     * Authenticate via remember me token
     */
    async #authenticateViaRememberToken(): Promise<
        UserProvider[typeof PROVIDER_REAL_USER] | null
    > {
        const provider = this
            .#userProvider as SessionWithRememberMeProviderContract<
                UserProvider[typeof PROVIDER_REAL_USER]
            >

        if (!provider.verifyRememberToken) {
            return null
        }

        this.attemptedViaRemember = true

        const tokenValue = getCookie(this.#ctx, this.rememberMeKeyName)
        if (!tokenValue) {
            return null
        }

        const result = await provider.verifyRememberToken(tokenValue)
        if (!result) {
            // Invalid token, delete cookie
            deleteCookie(this.#ctx, this.rememberMeKeyName)
            return null
        }

        const { user, token } = result

        // Remember-me absolute-lifetime cap (#146). Resolve the origin HERE — the
        // single home for the freeze/fallback policy — so a legacy token
        // (firstIssuedAt absent) is anchored at its createdAt and every provider
        // stays a dumb bare-copy. Freeze the origin onto the token handed to
        // recycle, so the anchor survives this renewal instead of being re-minted.
        const origin = token.firstIssuedAt ?? token.createdAt
        token.firstIssuedAt = origin

        const cap = this.#options.rememberMeAbsoluteLifetime
        if (
            typeof cap === 'number' &&
            Date.now() - origin.getTime() > cap * 1000
        ) {
            // Past the ceiling: tear down like the invalid-token path AND remove
            // the credential server-side — BEFORE any recycle or session mint — so
            // a captured copy can neither be refreshed nor replayed (CWE-613).
            await provider.deleteRememberToken(user, token.identifier)
            deleteCookie(this.#ctx, this.rememberMeKeyName)
            return null
        }

        // Recycle token for security (protect against stolen cookies)
        const newToken = await provider.recycleRememberToken(
            user,
            token,
            this.#options.rememberMeTokensAge,
        )

        // Update cookie with new token
        this.#setRememberMeCookie(newToken.value)

        // Set session
        this.#session.set(this.sessionKeyName, user.id)
        await this.#session.regenerate()
        // Re-assert the subject AFTER regenerate (#147): regenerate() resets the
        // driver's subject, so a set-before-regenerate would be lost. The
        // remember-me recycle path is a session establisher too, so a re-minted
        // session here carries a `sub` and is evictable (arch A2).
        this.#session.setSubject?.(user.id)

        this.user = user
        this.isAuthenticated = true
        this.viaRemember = true

        this.#emitter?.emit('session:remember_token_verified', { user, token })
        this.#emitter?.emit('session:remember_token_recycled', {
            user,
            oldToken: token,
            newToken,
        })
        this.#emitter?.emit('session:authenticate', { user })

        return user
    }

    /**
     * Login a user with credentials
     *
     * @param remember - Whether to create a remember me token
     *
     * @example
     * await guard.login('user@example.com', 'password', true)
     */
    async login(
        email: string,
        password: string,
        remember = false,
    ): Promise<UserProvider[typeof PROVIDER_REAL_USER]> {
        const user = await this.#userProvider.findByCredentials(email, password)
        if (!user) {
            throw new InvalidCredentialsError('Invalid credentials')
        }

        // Set session
        this.#session.set(this.sessionKeyName, user.id)
        await this.#session.regenerate()
        // Re-assert the subject AFTER regenerate (#147) — see the remember-me
        // path. Invariant: `sub === d[sessionKeyName]` (arch A5).
        this.#session.setSubject?.(user.id)

        this.user = user
        this.isAuthenticated = true

        // Create remember me token if requested
        if (remember && this.#options.useRememberMeTokens) {
            await this.#createRememberToken(user)
        }

        this.#emitter?.emit('session:login', { user })
        return user
    }

    /**
     * Login a user by their ID (useful after registration)
     *
     * @example
     * await guard.loginById(userId)
     */
    async loginById(
        userId: string | number,
        remember = false,
    ): Promise<UserProvider[typeof PROVIDER_REAL_USER]> {
        const user = await this.#userProvider.findById(userId)
        if (!user) {
            throw new InvalidCredentialsError('User not found')
        }

        this.#session.set(this.sessionKeyName, user.id)
        await this.#session.regenerate()
        // Re-assert the subject AFTER regenerate (#147). Invariant:
        // `sub === d[sessionKeyName]` (arch A5).
        this.#session.setSubject?.(user.id)

        this.user = user
        this.isAuthenticated = true

        if (remember && this.#options.useRememberMeTokens) {
            await this.#createRememberToken(user)
        }

        this.#emitter?.emit('session:login', { user })
        return user
    }

    /**
     * Create a remember me token
     */
    async #createRememberToken(
        user: UserProvider[typeof PROVIDER_REAL_USER],
    ): Promise<void> {
        const provider = this
            .#userProvider as SessionWithRememberMeProviderContract<
                UserProvider[typeof PROVIDER_REAL_USER]
            >

        if (!provider.createRememberToken) {
            return
        }

        const token = await provider.createRememberToken(
            user,
            this.#options.rememberMeTokensAge,
        )
        this.#setRememberMeCookie(token.value)
        this.#emitter?.emit('session:remember_token_created', { user, token })
    }

    /**
     * Set remember me cookie
     */
    #setRememberMeCookie(tokenValue: string): void {
        setCookie(this.#ctx, this.rememberMeKeyName, tokenValue, {
            maxAge: this.#options.rememberMeTokensAge,
            httpOnly: true,
            secure: true,
            sameSite: 'Lax',
            path: '/',
        })
    }

    /**
     * Logout the current user
     *
     * @example
     * await guard.logout()
     */
    async logout(): Promise<void> {
        const user = this.user

        // Destroy the whole session, not just forget the auth key. `forget()`
        // followed by the middleware's re-seal would re-issue a cookie carrying
        // the SAME session nonce, so it would still authenticate — and with
        // cookie revocation on, the nonce would never be revoked. `destroy()`
        // reaches `driver.destroy()`, which revokes the nonce and suppresses the
        // trailing re-seal, so a captured copy of the pre-logout cookie is
        // refused on its next use.
        await this.#session.destroy()

        // Delete the remember-me token whenever a remember-me cookie is present —
        // NOT gated on `this.user`. Under the enrich-only `withAuth` wiring the
        // guard may never have populated `this.user`, yet a captured remember-me
        // cookie must still be invalidated on logout or it re-establishes a
        // session (CWE-613). The token's owner comes from the verified token
        // itself, not from the guard's authentication state.
        if (this.#options.useRememberMeTokens) {
            const tokenValue = getCookie(this.#ctx, this.rememberMeKeyName)
            if (tokenValue) {
                const provider = this
                    .#userProvider as SessionWithRememberMeProviderContract<
                        UserProvider[typeof PROVIDER_REAL_USER]
                    >
                const result = await provider.verifyRememberToken(tokenValue)
                if (result) {
                    await provider.deleteRememberToken(
                        result.user,
                        result.token.identifier,
                    )
                }
            }
        }

        // Delete remember me cookie
        deleteCookie(this.#ctx, this.rememberMeKeyName)

        this.user = undefined
        this.isAuthenticated = false
        this.viaRemember = false
        this.isLoggedOut = true

        if (user) {
            this.#emitter?.emit('session:logout', { user })
        }
    }

    /**
     * Authenticate as a client (for testing)
     */
    async authenticateAsClient(
        user: UserProvider[typeof PROVIDER_REAL_USER],
        remember = false,
    ): Promise<AuthClientResponse> {
        // Assert the subject on the live session too (#147, test parity): a
        // session established for a test client is evictable like a real one. A
        // no-op on the memory/deno-kv/redis drivers (optional `setSubject?`).
        this.#session.setSubject?.(user.id)

        const response: AuthClientResponse = {
            session: {
                [this.sessionKeyName]: user.id,
            },
        }

        if (remember && this.#options.useRememberMeTokens) {
            const provider = this
                .#userProvider as SessionWithRememberMeProviderContract<
                    UserProvider[typeof PROVIDER_REAL_USER]
                >
            const token = await provider.createRememberToken(
                user,
                this.#options.rememberMeTokensAge,
            )
            response.cookies = {
                [this.rememberMeKeyName]: token.value,
            }
        }

        return response
    }

    /**
     * Log out **everywhere** (#147): evict every session of the authenticated
     * user, this device included, and invalidate their remember-me tokens.
     *
     * The eviction is one store write (the subject's epoch = now); the acting
     * session is killed deterministically by also revoking its `jti` via
     * `session.destroy()` — so a session issued in the same wall-clock second as
     * the eviction dies too (SC-003). The user's remember-me tokens are dropped so
     * a captured remember-me cookie cannot re-mint a post-eviction session
     * (security F2). A credential-change / account-recovery flow calls this
     * (ASVS 7.4.2).
     *
     * Scoped to `this.user.id` — never an arbitrary subject.
     *
     * @throws {AuthenticationRequiredError} When called unauthenticated — an
     *   undefined subject must never be evicted (security F3).
     *
     * @example
     * ```typescript
     * await guard.authenticate()
     * await guard.logoutEverywhere()
     * ```
     */
    /**
     * Drop every remember-me token the user holds (#147).
     *
     * Shared by {@link logoutEverywhere} and {@link logoutOthers} so the provider
     * cast and the invalidation live in one place.
     *
     * @param user - The authenticated user whose tokens to invalidate.
     */
    async #deleteAllRememberTokens(
        user: UserProvider[typeof PROVIDER_REAL_USER],
    ): Promise<void> {
        const provider = this
            .#userProvider as SessionWithRememberMeProviderContract<
                UserProvider[typeof PROVIDER_REAL_USER]
            >
        await provider.deleteAllRememberTokens(user)
    }

    async logoutEverywhere(): Promise<void> {
        const user = this.user
        if (!user) {
            throw new AuthenticationRequiredError(
                'logoutEverywhere requires an authenticated user',
            )
        }

        // 1. Set the subject's eviction epoch — evicts every prior session.
        await this.#session.revokeUser?.(user.id)
        // 2. Kill the acting session deterministically: destroy() revokes the
        //    acting `jti` (per-session, #143), so a same-second session dies too.
        await this.#session.destroy()
        // 3. Invalidate the user's remember-me tokens so a captured cookie cannot
        //    re-mint a post-eviction session.
        if (this.#options.useRememberMeTokens) {
            await this.#deleteAllRememberTokens(user)
        }
        deleteCookie(this.#ctx, this.rememberMeKeyName)

        this.user = undefined
        this.isAuthenticated = false
        this.viaRemember = false
        this.isLoggedOut = true
        this.#emitter?.emit('session:logout', { user })
    }

    /**
     * Log out **other devices** (#147): evict every other session of the
     * authenticated user while keeping the acting session alive.
     *
     * The epoch is set first, then the acting session **rotates**
     * (`regenerate()` → fresh `iat`) and re-asserts its subject, so it survives
     * the strict-`<` epoch check while every older session is refused. Other
     * devices' remember-me tokens are invalidated; the acting device's is
     * re-issued when one was present.
     *
     * Scoped to `this.user.id` — never an arbitrary subject.
     *
     * @throws {AuthenticationRequiredError} When called unauthenticated — an
     *   undefined subject must never be evicted (security F3).
     *
     * @example
     * ```typescript
     * await guard.authenticate()
     * await guard.logoutOthers()
     * ```
     */
    async logoutOthers(): Promise<void> {
        const user = this.user
        if (!user) {
            throw new AuthenticationRequiredError(
                'logoutOthers requires an authenticated user',
            )
        }

        // 1. Set the eviction epoch — evicts every OTHER prior session.
        await this.#session.revokeUser?.(user.id)
        // 2. Rotate the acting session to a fresh `iat` (past the epoch) so it
        //    survives; regenerate() resets the driver's subject.
        await this.#session.regenerate()
        // 3. Re-assert the subject on the survivor (arch A3) — a set-before or a
        //    reliance on preservation would lose it after the rotation.
        this.#session.setSubject?.(user.id)

        // 4. Invalidate every remember-me token, then re-issue the acting
        //    device's when one was present (the other devices' are gone).
        if (this.#options.useRememberMeTokens) {
            const hadRememberCookie = getCookie(
                this.#ctx,
                this.rememberMeKeyName,
            )
            await this.#deleteAllRememberTokens(user)
            if (hadRememberCookie) {
                await this.#createRememberToken(user)
            } else {
                deleteCookie(this.#ctx, this.rememberMeKeyName)
            }
        }
    }
}
