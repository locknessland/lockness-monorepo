/**
 * Lockness Authentication System
 *
 * Provides authentication services with session-based auth.
 * Inspired by Laravel/AdonisJS auth systems.
 */

import type { Context, MiddlewareHandler } from 'hono'
import { type Session, session } from './session.ts'

// =============================================================================
// Types & Interfaces
// =============================================================================

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
 * User provider interface for fetching users.
 */
export interface UserProvider<T extends Authenticatable = Authenticatable> {
    /** Find user by ID */
    findById(id: number | string): Promise<T | null>
    /** Find user by email (for login) */
    findByEmail(email: string): Promise<T | null>
    /** Find user by credentials (custom) */
    findByCredentials?(credentials: Record<string, unknown>): Promise<T | null>
}

/**
 * Auth configuration
 */
export interface AuthConfig {
    /** Session key for storing user ID */
    sessionKey: string
    /** Redirect URL when not authenticated */
    redirectTo: string
    /** User provider instance */
    userProvider?: UserProvider
}

// =============================================================================
// Password Hashing (using Web Crypto API)
// =============================================================================

const SALT_LENGTH = 16
const KEY_LENGTH = 32
const ITERATIONS = 100000

/**
 * Hash a password using PBKDF2
 */
export async function hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder()
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))

    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        { name: 'PBKDF2' },
        false,
        ['deriveBits'],
    )

    const hash = await crypto.subtle.deriveBits(
        {
            name: 'PBKDF2',
            salt,
            iterations: ITERATIONS,
            hash: 'SHA-256',
        },
        keyMaterial,
        KEY_LENGTH * 8,
    )

    // Combine salt + hash and encode as base64
    const combined = new Uint8Array(SALT_LENGTH + KEY_LENGTH)
    combined.set(salt)
    combined.set(new Uint8Array(hash), SALT_LENGTH)

    return btoa(String.fromCharCode(...combined))
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(
    password: string,
    storedHash: string,
): Promise<boolean> {
    try {
        const encoder = new TextEncoder()
        const combined = new Uint8Array(
            atob(storedHash)
                .split('')
                .map((c) => c.charCodeAt(0)),
        )

        const salt = combined.slice(0, SALT_LENGTH)
        const originalHash = combined.slice(SALT_LENGTH)

        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            { name: 'PBKDF2' },
            false,
            ['deriveBits'],
        )

        const newHash = await crypto.subtle.deriveBits(
            {
                name: 'PBKDF2',
                salt,
                iterations: ITERATIONS,
                hash: 'SHA-256',
            },
            keyMaterial,
            KEY_LENGTH * 8,
        )

        // Constant-time comparison
        const newHashArray = new Uint8Array(newHash)
        if (originalHash.length !== newHashArray.length) return false

        let result = 0
        for (let i = 0; i < originalHash.length; i++) {
            result |= originalHash[i] ^ newHashArray[i]
        }

        return result === 0
    } catch {
        return false
    }
}

// =============================================================================
// Auth Configuration
// =============================================================================

const defaultAuthConfig: AuthConfig = {
    sessionKey: 'auth_user_id',
    redirectTo: '/login',
}

let globalAuthConfig: AuthConfig = { ...defaultAuthConfig }

export function configureAuth(config: Partial<AuthConfig>): void {
    globalAuthConfig = { ...globalAuthConfig, ...config }
}

export function getAuthConfig(): AuthConfig {
    return globalAuthConfig
}

// =============================================================================
// Auth Guard Class
// =============================================================================

export class AuthGuard<T extends Authenticatable = Authenticatable> {
    private context: Context
    private sess: Session
    private config: AuthConfig
    private cachedUser: T | null = null
    private userChecked = false

    constructor(context: Context, config?: Partial<AuthConfig>) {
        this.context = context
        this.sess = session(context)
        this.config = { ...globalAuthConfig, ...config }
    }

    /**
     * Check if user is authenticated
     */
    async check(): Promise<boolean> {
        const user = await this.user()
        return user !== null
    }

    /**
     * Check if user is a guest (not authenticated)
     */
    async guest(): Promise<boolean> {
        return !(await this.check())
    }

    /**
     * Get the authenticated user
     */
    async user(): Promise<T | null> {
        if (this.userChecked) {
            return this.cachedUser
        }

        this.userChecked = true
        const userId = this.sess.get<number | string>(this.config.sessionKey)

        if (!userId) {
            this.cachedUser = null
            return null
        }

        if (!this.config.userProvider) {
            throw new Error(
                'UserProvider not configured. Call configureAuth({ userProvider }) first.',
            )
        }

        this.cachedUser = (await this.config.userProvider.findById(
            userId,
        )) as T | null
        return this.cachedUser
    }

    /**
     * Get user ID from session (without fetching user)
     */
    id(): number | string | undefined {
        return this.sess.get<number | string>(this.config.sessionKey)
    }

    /**
     * Attempt to authenticate a user with credentials
     */
    async attempt(
        email: string,
        password: string,
        remember = false,
    ): Promise<boolean> {
        if (!this.config.userProvider) {
            throw new Error('UserProvider not configured.')
        }

        const user = await this.config.userProvider.findByEmail(email)

        if (!user || !user.password) {
            return false
        }

        const valid = await verifyPassword(password, user.password)

        if (!valid) {
            return false
        }

        await this.login(user as T, remember)
        return true
    }

    /**
     * Log in a user
     */
    async login(user: T, _remember = false): Promise<void> {
        // Regenerate session ID for security
        await this.sess.regenerate()

        // Store user ID in session
        this.sess.set(this.config.sessionKey, user.id)

        // Cache user
        this.cachedUser = user
        this.userChecked = true

        // TODO: Handle "remember me" with long-lived token
    }

    /**
     * Log in a user by ID
     */
    async loginById(id: number | string): Promise<boolean> {
        if (!this.config.userProvider) {
            throw new Error('UserProvider not configured.')
        }

        const user = await this.config.userProvider.findById(id)

        if (!user) {
            return false
        }

        await this.login(user as T)
        return true
    }

    /**
     * Log out the current user
     */
    async logout(): Promise<void> {
        this.sess.forget(this.config.sessionKey)
        await this.sess.regenerate()
        this.cachedUser = null
        this.userChecked = true
    }
}

// =============================================================================
// Auth Helper
// =============================================================================

const AUTH_KEY = 'lockness:auth'

/**
 * Get auth guard from context
 */
export function auth<T extends Authenticatable = Authenticatable>(
    c: Context,
): AuthGuard<T> {
    let guard = c.get(AUTH_KEY) as AuthGuard<T> | undefined

    if (!guard) {
        guard = new AuthGuard<T>(c)
        c.set(AUTH_KEY, guard)
    }

    return guard
}

// =============================================================================
// Auth Middleware
// =============================================================================

/**
 * Create auth middleware that ensures user is authenticated
 */
export function createAuthMiddleware(
    options?: Partial<AuthConfig>,
): MiddlewareHandler {
    return async (c, next) => {
        const guard = auth(c)
        const isAuthenticated = await guard.check()

        if (!isAuthenticated) {
            const config = { ...globalAuthConfig, ...options }

            // Check if it's an API request
            const accept = c.req.header('Accept') || ''
            const isApi = accept.includes('application/json') ||
                c.req.path.startsWith('/api')

            if (isApi) {
                return c.json({ error: 'Unauthorized' }, 401)
            }

            // Redirect to login
            return c.redirect(config.redirectTo)
        }

        await next()
    }
}

/**
 * Create guest middleware that ensures user is NOT authenticated
 */
export function createGuestMiddleware(
    redirectTo = '/',
): MiddlewareHandler {
    return async (c, next) => {
        const guard = auth(c)
        const isAuthenticated = await guard.check()

        if (isAuthenticated) {
            return c.redirect(redirectTo)
        }

        await next()
    }
}

// =============================================================================
// @Auth Decorator for Controllers
// =============================================================================

/**
 * Mark a controller or method as requiring authentication.
 * Can be used at class level or method level.
 *
 * @example
 * // Protect entire controller
 * @Auth()
 * @Controller('/dashboard')
 * class DashboardController { ... }
 *
 * // Protect single method
 * @Controller('/users')
 * class UserController {
 *     @Auth()
 *     @Get('/profile')
 *     profile(c: Context) { ... }
 * }
 */
// deno-lint-ignore no-explicit-any
export function Auth(options?: Partial<AuthConfig>): any {
    return function (
        // deno-lint-ignore no-explicit-any
        target: any,
        propertyKey?: string,
        descriptor?: PropertyDescriptor,
        // deno-lint-ignore no-explicit-any
    ): any {
        if (propertyKey && descriptor) {
            // Method decorator
            const originalMethod = descriptor.value

            // Store auth requirement
            if (!originalMethod._auth) {
                originalMethod._auth = { required: true, options }
            }

            return descriptor
        } else {
            // Class decorator
            target._authRequired = true
            target._authOptions = options
            return target
        }
    }
}

/**
 * Mark a controller or method as guest-only (not authenticated).
 */
// deno-lint-ignore no-explicit-any
export function Guest(redirectTo = '/'): any {
    return function (
        // deno-lint-ignore no-explicit-any
        target: any,
        propertyKey?: string,
        descriptor?: PropertyDescriptor,
        // deno-lint-ignore no-explicit-any
    ): any {
        if (propertyKey && descriptor) {
            // Method decorator
            const originalMethod = descriptor.value
            originalMethod._guest = { required: true, redirectTo }
            return descriptor
        } else {
            // Class decorator
            target._guestRequired = true
            target._guestRedirectTo = redirectTo
            return target
        }
    }
}
