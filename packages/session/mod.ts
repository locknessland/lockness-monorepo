/**
 * @fileoverview Session Management System for Lockness.
 *
 * Multi-driver session handling with Cookie, Memory, DenoKV, and Redis support.
 * Provides encrypted sessions, flash data, and automatic garbage collection.
 *
 * @example
 * ```typescript
 * import { sessionMiddleware, getSession, configureSession } from '@lockness/session'
 *
 * // Configure globally
 * configureSession({
 *   driver: 'deno-kv',
 *   secret: Deno.env.get('SESSION_SECRET')!,
 *   lifetime: 3600,
 * })
 *
 * // Use middleware
 * app.useMiddleware(sessionMiddleware())
 *
 * // Access in controller
 * const session = getSession(c)
 * session.set('userId', 123)
 * const userId = session.get<number>('userId')
 * ```
 *
 * @module @lockness/session
 */

// deno-lint-ignore-file require-await

import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from '@lockness/hono'

// =============================================================================
// Types & Interfaces
// =============================================================================

/**
 * Session data container type.
 *
 * A flexible record type allowing any string keys with unknown values.
 * Use type assertions or generics when retrieving values.
 *
 * @example
 * ```typescript
 * const data: SessionData = {
 *   userId: 123,
 *   preferences: { theme: 'dark' },
 * }
 * ```
 */
export interface SessionData {
    /** Session data key-value pairs */
    [key: string]: unknown
}

/**
 * Session configuration options.
 *
 * Controls session behavior, storage driver, cookie settings, and encryption.
 *
 * @example
 * ```typescript
 * const config: SessionConfig = {
 *   driver: 'deno-kv',
 *   cookieName: 'app_session',
 *   lifetime: 3600,
 *   secret: 'your-32-char-secret-key-here!!!',
 *   path: '/',
 *   secure: true,
 *   httpOnly: true,
 *   sameSite: 'Strict',
 * }
 * ```
 */
export interface SessionConfig {
    /**
     * Session storage driver.
     * - `cookie`: Stores encrypted data directly in cookie (stateless)
     * - `memory`: In-memory storage (development/testing only)
     * - `deno-kv`: Deno KV persistent storage
     * - `redis`: Redis server storage
     * @default 'cookie'
     */
    driver: 'cookie' | 'deno-kv' | 'memory' | 'redis'
    /**
     * Cookie name for session ID or data.
     * @default 'lockness_session'
     */
    cookieName: string
    /**
     * Session lifetime in seconds.
     * @default 7200 (2 hours)
     */
    lifetime: number
    /**
     * Secret key for signing/encrypting cookies.
     * Should be at least 32 characters for AES-256-GCM encryption.
     * @required
     */
    secret: string
    /**
     * Cookie path attribute.
     * @default '/'
     */
    path: string
    /**
     * Cookie domain attribute.
     * Leave undefined to use the current domain.
     */
    domain?: string
    /**
     * Secure cookie flag (HTTPS only).
     * Should be `true` in production.
     * @default false
     */
    secure: boolean
    /**
     * HTTP-only cookie flag.
     * Prevents JavaScript access to the cookie.
     * @default true
     */
    httpOnly: boolean
    /**
     * SameSite cookie attribute.
     * Controls cross-origin cookie behavior.
     * @default 'Lax'
     */
    sameSite: 'Strict' | 'Lax' | 'None'
    /**
     * Deno KV database path.
     * Only used when `driver` is `'deno-kv'`.
     * Leave undefined to use the default KV store.
     */
    kvPath?: string
    /**
     * Redis connection configuration.
     * Required when `driver` is `'redis'`.
     */
    redis?: RedisConfig
}

/**
 * Redis connection configuration.
 */
export interface RedisConfig {
    /** Redis server hostname */
    hostname: string
    /**
     * Redis server port.
     * @default 6379
     */
    port?: number
    /** Redis password for authentication */
    password?: string
    /**
     * Redis database index.
     * @default 0
     */
    db?: number
}

/**
 * Session storage driver interface.
 *
 * Implement this interface to create custom session storage backends.
 * All methods are async for consistency across different storage types.
 *
 * @example
 * ```typescript
 * class CustomDriver implements SessionDriver {
 *   async read(sessionId: string): Promise<SessionData | null> {
 *     // Fetch from your storage
 *     return myStorage.get(sessionId)
 *   }
 *   // ... implement other methods
 * }
 * ```
 */
export interface SessionDriver {
    /**
     * Read session data by ID.
     * @param sessionId - The unique session identifier
     * @returns Session data or null if not found/expired
     */
    read(sessionId: string): Promise<SessionData | null>
    /**
     * Write session data to storage.
     * @param sessionId - The unique session identifier
     * @param data - Session data to persist
     * @param lifetime - Session lifetime in seconds
     */
    write(sessionId: string, data: SessionData, lifetime: number): Promise<void>
    /**
     * Destroy/delete a session.
     * @param sessionId - The session identifier to destroy
     */
    destroy(sessionId: string): Promise<void>
    /**
     * Regenerate session ID (transfer data to new ID).
     * Used for security purposes after authentication.
     * @param oldId - The current session identifier
     * @param newId - The new session identifier
     */
    regenerate(oldId: string, newId: string): Promise<void>
    /**
     * Garbage collection - remove expired sessions.
     * Optional: only implement for drivers that need manual cleanup.
     */
    gc?(): Promise<void>
    /**
     * Close any open connections.
     * Optional: only implement for drivers with persistent connections.
     */
    close?(): Promise<void>
}

/**
 * Session instance interface.
 *
 * Provides methods to read, write, and manage session data.
 * Supports flash messages for one-time data transfer between requests.
 *
 * @example
 * ```typescript
 * const session = getSession(c)
 *
 * // Store data
 * session.set('cart', [{ id: 1, qty: 2 }])
 *
 * // Retrieve with type
 * const cart = session.get<CartItem[]>('cart', [])
 *
 * // Flash message (available only on next request)
 * session.flash('success', 'Item added to cart')
 *
 * // On next request
 * const message = session.getFlash<string>('success')
 * ```
 */
export interface Session {
    /**
     * Get the current session ID.
     * @returns The unique session identifier
     */
    getId(): string
    /**
     * Get a value from the session.
     * @typeParam T - Expected return type
     * @param key - The key to retrieve
     * @param defaultValue - Default value if key doesn't exist
     * @returns The stored value or default
     */
    get<T = unknown>(key: string, defaultValue?: T): T | undefined
    /**
     * Set a value in the session.
     * @param key - The key to store under
     * @param value - The value to store (must be JSON-serializable)
     */
    set(key: string, value: unknown): void
    /**
     * Check if a key exists in the session.
     * @param key - The key to check
     * @returns True if the key exists
     */
    has(key: string): boolean
    /**
     * Remove a key from the session.
     * @param key - The key to remove
     */
    forget(key: string): void
    /**
     * Get all session data.
     * @returns A copy of all session data
     */
    all(): SessionData
    /**
     * Clear all session data.
     * Keeps the session ID but removes all stored values.
     */
    flush(): void
    /**
     * Regenerate the session ID.
     * Use after authentication to prevent session fixation attacks.
     */
    regenerate(): Promise<void>
    /**
     * Destroy the session completely.
     * Removes all data and invalidates the session.
     */
    destroy(): Promise<void>
    /**
     * Set flash data (available only for the next request).
     * @param key - The flash key
     * @param value - The flash value (must be JSON-serializable)
     */
    flash(key: string, value: unknown): void
    /**
     * Get flash data from the previous request.
     * @typeParam T - Expected return type
     * @param key - The flash key to retrieve
     * @returns The flash value or undefined
     */
    getFlash<T = unknown>(key: string): T | undefined
    /**
     * Check if the session has been modified.
     * @returns True if any data has been changed
     */
    isDirty(): boolean
}

// =============================================================================
// Default Configuration
// =============================================================================

const defaultConfig: SessionConfig = {
    driver: 'cookie',
    cookieName: 'lockness_session',
    lifetime: 7200, // 2 hours
    secret: '', // Must be set by user
    path: '/',
    secure: false,
    httpOnly: true,
    sameSite: 'Lax',
}

let globalConfig: SessionConfig = { ...defaultConfig }

/**
 * Configure global session settings.
 *
 * Call this once at application startup to set default session options.
 * These can be overridden per-middleware instance.
 *
 * @param config - Partial configuration to merge with defaults
 *
 * @example
 * ```typescript
 * configureSession({
 *   driver: 'deno-kv',
 *   secret: Deno.env.get('SESSION_SECRET')!,
 *   secure: true,
 *   lifetime: 86400, // 24 hours
 * })
 * ```
 */
export function configureSession(config: Partial<SessionConfig>): void {
    globalConfig = { ...defaultConfig, ...config }
}

/**
 * Get the current session configuration.
 *
 * @returns The merged global session configuration
 */
export function getSessionConfig(): SessionConfig {
    return globalConfig
}

// =============================================================================
// Session ID Generation
// =============================================================================

/**
 * Generate a cryptographically secure session ID.
 *
 * Uses Web Crypto API for random bytes generation.
 *
 * @returns A 64-character hexadecimal session ID
 * @internal
 */
function generateSessionId(): string {
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join(
        '',
    )
}

// =============================================================================
// Cookie Session Driver (stores data in encrypted cookie)
// =============================================================================

/**
 * Cookie-based session driver.
 *
 * Stores session data directly in an encrypted cookie (stateless).
 * Best for small session data sizes (< 4KB after encryption).
 *
 * **Security:** Uses AES-256-GCM encryption when a secret is provided.
 *
 * @example
 * ```typescript
 * const driver = new CookieSessionDriver(context, config)
 * await driver.write('session-id', { userId: 123 }, 3600)
 * ```
 */
export class CookieSessionDriver implements SessionDriver {
    private readonly context: Context
    private readonly config: SessionConfig

    constructor(context: Context, config: SessionConfig) {
        this.context = context
        this.config = config
    }

    async read(_sessionId: string): Promise<SessionData | null> {
        const cookieValue = getCookie(this.context, this.config.cookieName)
        if (!cookieValue) return null

        try {
            const decoded = await this.decrypt(cookieValue)
            return JSON.parse(decoded) as SessionData
        } catch {
            return null
        }
    }

    async write(
        _sessionId: string,
        data: SessionData,
        lifetime: number,
    ): Promise<void> {
        const encrypted = await this.encrypt(JSON.stringify(data))
        setCookie(this.context, this.config.cookieName, encrypted, {
            path: this.config.path,
            domain: this.config.domain,
            secure: this.config.secure,
            httpOnly: this.config.httpOnly,
            sameSite: this.config.sameSite,
            maxAge: lifetime,
        })
    }

    async destroy(_sessionId: string): Promise<void> {
        deleteCookie(this.context, this.config.cookieName, {
            path: this.config.path,
            domain: this.config.domain,
        })
    }

    async regenerate(_oldId: string, _newId: string): Promise<void> {
        // For cookie driver, regeneration is handled at session level
        // No action needed here
    }

    // Simple encryption using Web Crypto API
    private async encrypt(data: string): Promise<string> {
        if (!this.config.secret) {
            // No encryption, just base64
            return btoa(encodeURIComponent(data))
        }

        const encoder = new TextEncoder()
        const key = await this.deriveKey(this.config.secret)
        const iv = crypto.getRandomValues(new Uint8Array(12))
        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            encoder.encode(data),
        )

        // Combine IV + encrypted data
        const combined = new Uint8Array(iv.length + encrypted.byteLength)
        combined.set(iv)
        combined.set(new Uint8Array(encrypted), iv.length)

        return btoa(String.fromCharCode(...combined))
    }

    private async decrypt(encrypted: string): Promise<string> {
        if (!this.config.secret) {
            // No encryption, just base64
            return decodeURIComponent(atob(encrypted))
        }

        const combined = new Uint8Array(
            atob(encrypted)
                .split('')
                .map((c) => c.charCodeAt(0)),
        )
        const iv = combined.slice(0, 12)
        const data = combined.slice(12)

        const key = await this.deriveKey(this.config.secret)
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            key,
            data,
        )

        return new TextDecoder().decode(decrypted)
    }

    private async deriveKey(secret: string): Promise<CryptoKey> {
        const encoder = new TextEncoder()
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(secret),
            { name: 'PBKDF2' },
            false,
            ['deriveKey'],
        )

        return crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: encoder.encode('lockness_session_salt'),
                iterations: 100000,
                hash: 'SHA-256',
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt'],
        )
    }
}

// =============================================================================
// Memory Session Driver (for development/testing)
// =============================================================================

/**
 * In-memory session driver.
 *
 * Stores sessions in a Map. Data is lost on server restart.
 * **Use only for development and testing.**
 *
 * @example
 * ```typescript
 * const driver = new MemorySessionDriver()
 * await driver.write('session-id', { userId: 123 }, 3600)
 *
 * // For testing: clear all sessions
 * driver.clear()
 * ```
 */
export class MemorySessionDriver implements SessionDriver {
    private readonly sessions = new Map<
        string,
        { data: SessionData; expires: number }
    >()

    async read(sessionId: string): Promise<SessionData | null> {
        const session = this.sessions.get(sessionId)
        if (!session) return null

        // Check expiration
        if (Date.now() > session.expires) {
            this.sessions.delete(sessionId)
            return null
        }

        return session.data
    }

    async write(
        sessionId: string,
        data: SessionData,
        lifetime: number,
    ): Promise<void> {
        this.sessions.set(sessionId, {
            data,
            expires: Date.now() + lifetime * 1000,
        })
    }

    async destroy(sessionId: string): Promise<void> {
        this.sessions.delete(sessionId)
    }

    async regenerate(oldId: string, newId: string): Promise<void> {
        const session = this.sessions.get(oldId)
        if (session) {
            this.sessions.set(newId, session)
            this.sessions.delete(oldId)
        }
    }

    async gc(): Promise<void> {
        const now = Date.now()
        for (const [id, session] of this.sessions.entries()) {
            if (now > session.expires) {
                this.sessions.delete(id)
            }
        }
    }

    // Testing helper
    clear(): void {
        this.sessions.clear()
    }
}

// =============================================================================
// Deno KV Session Driver
// =============================================================================

/**
 * Deno KV session driver.
 *
 * Persistent session storage using Deno's built-in KV store.
 * Supports automatic expiration via KV's `expireIn` option.
 *
 * @example
 * ```typescript
 * // Use default KV store
 * const driver = new DenoKvSessionDriver()
 *
 * // Or specify a custom path
 * const driver = new DenoKvSessionDriver('./sessions.db')
 * ```
 */
export class DenoKvSessionDriver implements SessionDriver {
    private kv: Deno.Kv | null = null
    private readonly kvPath?: string

    constructor(kvPath?: string) {
        this.kvPath = kvPath
    }

    private async getKv(): Promise<Deno.Kv> {
        if (!this.kv) {
            this.kv = await Deno.openKv(this.kvPath)
        }
        return this.kv
    }

    async read(sessionId: string): Promise<SessionData | null> {
        const kv = await this.getKv()
        const result = await kv.get<SessionData>(['sessions', sessionId])
        return result.value
    }

    async write(
        sessionId: string,
        data: SessionData,
        lifetime: number,
    ): Promise<void> {
        const kv = await this.getKv()
        await kv.set(['sessions', sessionId], data, {
            expireIn: lifetime * 1000, // Convert to milliseconds
        })
    }

    async destroy(sessionId: string): Promise<void> {
        const kv = await this.getKv()
        await kv.delete(['sessions', sessionId])
    }

    async regenerate(oldId: string, newId: string): Promise<void> {
        const kv = await this.getKv()
        const result = await kv.get<SessionData>(['sessions', oldId])
        if (result.value) {
            await kv.set(['sessions', newId], result.value)
            await kv.delete(['sessions', oldId])
        }
    }

    async close(): Promise<void> {
        if (this.kv) {
            this.kv.close()
            this.kv = null
        }
    }
}

// =============================================================================
// Redis Session Driver
// =============================================================================

/**
 * Redis session driver.
 *
 * Persistent session storage using Redis server.
 * Implements RESP protocol directly without external dependencies.
 *
 * @example
 * ```typescript
 * const driver = new RedisSessionDriver({
 *   hostname: 'localhost',
 *   port: 6379,
 *   password: 'secret',
 *   db: 1,
 * })
 * ```
 */
export class RedisSessionDriver implements SessionDriver {
    private connection: Deno.Conn | null = null
    private readonly config: {
        hostname: string
        port: number
        password?: string
        db?: number
    }

    constructor(config: {
        hostname: string
        port?: number
        password?: string
        db?: number
    }) {
        this.config = {
            hostname: config.hostname,
            port: config.port ?? 6379,
            password: config.password,
            db: config.db ?? 0,
        }
    }

    private async connect(): Promise<Deno.Conn> {
        if (!this.connection) {
            this.connection = await Deno.connect({
                hostname: this.config.hostname,
                port: this.config.port,
            })

            // Authenticate if password provided
            if (this.config.password) {
                await this.sendCommand(['AUTH', this.config.password])
            }

            // Select database if specified
            if (this.config.db !== 0) {
                await this.sendCommand(['SELECT', String(this.config.db)])
            }
        }
        return this.connection
    }

    private async sendCommand(args: string[]): Promise<string> {
        const conn = await this.connect()
        const encoder = new TextEncoder()
        const decoder = new TextDecoder()

        // Build RESP protocol command
        let command = `*${args.length}\r\n`
        for (const arg of args) {
            command += `$${arg.length}\r\n${arg}\r\n`
        }

        await conn.write(encoder.encode(command))

        // Read response
        const buffer = new Uint8Array(4096)
        const n = await conn.read(buffer)
        if (!n) throw new Error('Redis connection closed')

        const response = decoder.decode(buffer.subarray(0, n))
        return this.parseResponse(response)
    }

    private parseResponse(response: string): string {
        const type = response[0]

        if (type === '+') {
            // Simple string
            return response.substring(1, response.indexOf('\r\n'))
        } else if (type === '$') {
            // Bulk string
            const lines = response.split('\r\n')
            const length = parseInt(lines[0].substring(1))
            if (length === -1) return '' // NULL
            return lines[1] || ''
        } else if (type === '-') {
            // Error
            throw new Error(response.substring(1, response.indexOf('\r\n')))
        } else if (type === ':') {
            // Integer
            return response.substring(1, response.indexOf('\r\n'))
        }

        return ''
    }

    async read(sessionId: string): Promise<SessionData | null> {
        try {
            const data = await this.sendCommand(['GET', `session:${sessionId}`])
            if (!data) return null
            return JSON.parse(data) as SessionData
        } catch {
            return null
        }
    }

    async write(
        sessionId: string,
        data: SessionData,
        lifetime: number,
    ): Promise<void> {
        await this.sendCommand([
            'SETEX',
            `session:${sessionId}`,
            String(lifetime),
            JSON.stringify(data),
        ])
    }

    async destroy(sessionId: string): Promise<void> {
        await this.sendCommand(['DEL', `session:${sessionId}`])
    }

    async regenerate(oldId: string, newId: string): Promise<void> {
        const data = await this.read(oldId)
        if (data) {
            await this.write(newId, data, this.config.db ?? 7200)
            await this.destroy(oldId)
        }
    }

    async close(): Promise<void> {
        if (this.connection) {
            await this.sendCommand(['QUIT'])
            this.connection.close()
            this.connection = null
        }
    }
}

// =============================================================================
// SessionStore Class
// =============================================================================

/**
 * Session store implementation.
 *
 * Manages session data, flash messages, and persistence.
 * Created automatically by the session middleware.
 *
 * @internal Use `getSession(c)` to access the session in controllers.
 */
export class SessionStore implements Session {
    private sessionId: string
    private readonly driver: SessionDriver
    private data: SessionData
    private flashData: SessionData = {}
    private dirty = false
    private readonly config: SessionConfig

    constructor(
        sessionId: string,
        driver: SessionDriver,
        data: SessionData,
        config: SessionConfig,
    ) {
        this.sessionId = sessionId
        this.driver = driver
        this.data = { ...data }
        this.config = config

        // Extract flash data from previous request
        if (this.data._flash) {
            this.flashData = this.data._flash as SessionData
            delete this.data._flash
        }
    }

    getId(): string {
        return this.sessionId
    }

    get<T = unknown>(key: string, defaultValue?: T): T | undefined {
        const value = this.data[key] as T
        return value !== undefined ? value : defaultValue
    }

    set(key: string, value: unknown): void {
        this.data[key] = value
        this.dirty = true
    }

    has(key: string): boolean {
        return key in this.data
    }

    forget(key: string): void {
        delete this.data[key]
        this.dirty = true
    }

    all(): SessionData {
        return { ...this.data }
    }

    flush(): void {
        this.data = {}
        this.dirty = true
    }

    async regenerate(): Promise<void> {
        const newId = generateSessionId()
        await this.driver.regenerate(this.sessionId, newId)
        this.sessionId = newId
        this.dirty = true
    }

    async destroy(): Promise<void> {
        await this.driver.destroy(this.sessionId)
        this.data = {}
        this.dirty = true
    }

    flash(key: string, value: unknown): void {
        if (!this.data._flash) {
            this.data._flash = {}
        }
        ;(this.data._flash as SessionData)[key] = value
        this.dirty = true
    }

    getFlash<T = unknown>(key: string): T | undefined {
        return this.flashData[key] as T
    }

    isDirty(): boolean {
        return this.dirty
    }

    async save(): Promise<void> {
        if (this.dirty) {
            await this.driver.write(
                this.sessionId,
                this.data,
                this.config.lifetime,
            )
            this.dirty = false
        }
    }
}

// =============================================================================
// Session Middleware
// =============================================================================

/**
 * Session middleware factory.
 *
 * Creates a Hono middleware that initializes session handling for each request.
 * Automatically loads, saves, and manages session lifecycle.
 *
 * @param config - Optional configuration overrides
 * @returns Hono middleware function
 *
 * @example
 * ```typescript
 * import { sessionMiddleware } from '@lockness/session'
 *
 * // Use with global config
 * app.useMiddleware(sessionMiddleware())
 *
 * // Or with inline config
 * app.useMiddleware(sessionMiddleware({
 *   driver: 'deno-kv',
 *   lifetime: 86400,
 * }))
 * ```
 */
export function sessionMiddleware(
    config?: Partial<SessionConfig>,
): (c: Context, next: () => Promise<void>) => Promise<void> {
    const sessionConfig = { ...getSessionConfig(), ...config }

    return async (c: Context, next: () => Promise<void>) => {
        // Create driver based on config
        let driver: SessionDriver

        switch (sessionConfig.driver) {
            case 'cookie':
                driver = new CookieSessionDriver(c, sessionConfig)
                break
            case 'memory':
                driver = new MemorySessionDriver()
                break
            case 'deno-kv':
                driver = new DenoKvSessionDriver(sessionConfig.kvPath)
                break
            case 'redis':
                if (!sessionConfig.redis) {
                    throw new Error(
                        'Redis configuration required for redis driver',
                    )
                }
                driver = new RedisSessionDriver(sessionConfig.redis)
                break
            default:
                driver = new CookieSessionDriver(c, sessionConfig)
        }

        // Get or create session ID
        let sessionId = getCookie(c, sessionConfig.cookieName)
        if (!sessionId) {
            sessionId = generateSessionId()
        }

        // Load session data
        const data = (await driver.read(sessionId)) || {}

        // Create session store
        const session = new SessionStore(sessionId, driver, data, sessionConfig)

        // Attach to context
        c.set('session', session)

        // Process request
        await next()

        // Save session if modified
        await session.save()

        // Set session cookie (for non-cookie drivers)
        if (sessionConfig.driver !== 'cookie') {
            setCookie(c, sessionConfig.cookieName, session.getId(), {
                path: sessionConfig.path,
                domain: sessionConfig.domain,
                secure: sessionConfig.secure,
                httpOnly: sessionConfig.httpOnly,
                sameSite: sessionConfig.sameSite,
                maxAge: sessionConfig.lifetime,
            })
        }
    }
}

/**
 * Get session from Hono context.
 *
 * Retrieves the session instance attached by the session middleware.
 * Throws if called before the middleware has run.
 *
 * @param c - Hono context object
 * @returns The session instance
 * @throws {Error} If session middleware is not configured
 *
 * @example
 * ```typescript
 * import { getSession } from '@lockness/session'
 *
 * @Controller('/user')
 * class UserController {
 *   @Get('/profile')
 *   profile(c: Context) {
 *     const session = getSession(c)
 *     const userId = session.get<number>('userId')
 *     // ...
 *   }
 * }
 * ```
 */
export function getSession(c: Context): Session {
    const session = c.get('session') as Session | undefined
    if (!session) {
        throw new Error('Session not initialized. Use sessionMiddleware.')
    }
    return session
}
