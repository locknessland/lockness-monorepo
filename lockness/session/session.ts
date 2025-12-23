/**
 * Lockness Session - Session Management System
 *
 * Multi-driver session handling with Cookie, Memory, DenoKV, and Redis support.
 * Provides encrypted sessions, flash data, and automatic garbage collection.
 *
 * Note: Some methods are async for driver consistency
 */

// deno-lint-ignore-file require-await

import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'

// =============================================================================
// Types & Interfaces
// =============================================================================

export interface SessionData {
    [key: string]: unknown
}

export interface SessionConfig {
    /** Session driver: 'cookie' | 'deno-kv' | 'memory' | 'redis' */
    driver: 'cookie' | 'deno-kv' | 'memory' | 'redis'
    /** Cookie name for session ID or data */
    cookieName: string
    /** Session lifetime in seconds (default: 7200 = 2 hours) */
    lifetime: number
    /** Secret key for signing cookies */
    secret: string
    /** Cookie path */
    path: string
    /** Cookie domain (optional) */
    domain?: string
    /** Secure cookie (HTTPS only) */
    secure: boolean
    /** HTTP only cookie */
    httpOnly: boolean
    /** SameSite attribute */
    sameSite: 'Strict' | 'Lax' | 'None'
    /** Deno KV path (for deno-kv driver) */
    kvPath?: string
    /** Redis configuration (for redis driver) */
    redis?: {
        hostname: string
        port?: number
        password?: string
        db?: number
    }
}

export interface SessionDriver {
    /** Read session data by ID */
    read(sessionId: string): Promise<SessionData | null>
    /** Write session data */
    write(sessionId: string, data: SessionData, lifetime: number): Promise<void>
    /** Destroy session */
    destroy(sessionId: string): Promise<void>
    /** Regenerate session ID */
    regenerate(oldId: string, newId: string): Promise<void>
    /** Garbage collection (optional) */
    gc?(): Promise<void>
    /** Close connection (optional) */
    close?(): Promise<void>
}

export interface Session {
    /** Get session ID */
    getId(): string
    /** Get a value from session */
    get<T = unknown>(key: string, defaultValue?: T): T | undefined
    /** Set a value in session */
    set(key: string, value: unknown): void
    /** Check if key exists */
    has(key: string): boolean
    /** Remove a key */
    forget(key: string): void
    /** Get all session data */
    all(): SessionData
    /** Clear all session data */
    flush(): void
    /** Regenerate session ID (for security, e.g., after login) */
    regenerate(): Promise<void>
    /** Destroy the session */
    destroy(): Promise<void>
    /** Flash data (available only for next request) */
    flash(key: string, value: unknown): void
    /** Get flash data */
    getFlash<T = unknown>(key: string): T | undefined
    /** Check if session was modified */
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

export function configureSession(config: Partial<SessionConfig>): void {
    globalConfig = { ...defaultConfig, ...config }
}

export function getSessionConfig(): SessionConfig {
    return globalConfig
}

// =============================================================================
// Session ID Generation
// =============================================================================

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

export class CookieSessionDriver implements SessionDriver {
    private context: Context
    private config: SessionConfig

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

export class MemorySessionDriver implements SessionDriver {
    private sessions = new Map<string, { data: SessionData; expires: number }>()

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

export class DenoKvSessionDriver implements SessionDriver {
    private kv: Deno.Kv | null = null
    private kvPath?: string

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

export class RedisSessionDriver implements SessionDriver {
    private connection: Deno.Conn | null = null
    private config: {
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

export class SessionStore implements Session {
    private sessionId: string
    private driver: SessionDriver
    private data: SessionData
    private flashData: SessionData = {}
    private dirty = false
    private config: SessionConfig

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
 * Get session from context
 */
export function getSession(c: Context): Session {
    const session = c.get('session') as Session | undefined
    if (!session) {
        throw new Error('Session not initialized. Use sessionMiddleware.')
    }
    return session
}
