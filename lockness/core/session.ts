/**
 * Lockness Session Management
 *
 * Provides session handling with multiple driver support.
 * Inspired by Laravel's session system.
 */

import type { Context, MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'

// =============================================================================
// Types & Interfaces
// =============================================================================

export interface SessionData {
    [key: string]: unknown
}

export interface SessionConfig {
    /** Session driver: 'cookie' | 'deno-kv' | 'memory' */
    driver: 'cookie' | 'deno-kv' | 'memory'
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
}

// =============================================================================
// Memory Session Driver (for development/testing only)
// =============================================================================

const memoryStore = new Map<string, { data: SessionData; expires: number }>()

export class MemorySessionDriver implements SessionDriver {
    async read(sessionId: string): Promise<SessionData | null> {
        const entry = memoryStore.get(sessionId)
        if (!entry) return null
        if (Date.now() > entry.expires) {
            memoryStore.delete(sessionId)
            return null
        }
        return entry.data
    }

    async write(
        sessionId: string,
        data: SessionData,
        lifetime: number,
    ): Promise<void> {
        memoryStore.set(sessionId, {
            data,
            expires: Date.now() + lifetime * 1000,
        })
    }

    async destroy(sessionId: string): Promise<void> {
        memoryStore.delete(sessionId)
    }

    async regenerate(oldId: string, newId: string): Promise<void> {
        const entry = memoryStore.get(oldId)
        if (entry) {
            memoryStore.set(newId, entry)
            memoryStore.delete(oldId)
        }
    }

    async gc(): Promise<void> {
        const now = Date.now()
        for (const [key, entry] of memoryStore.entries()) {
            if (now > entry.expires) {
                memoryStore.delete(key)
            }
        }
    }
}

// =============================================================================
// Session Store Implementation
// =============================================================================

export class SessionStore implements Session {
    private id: string
    private data: SessionData
    private originalData: string
    private driver: SessionDriver
    private config: SessionConfig
    private flashData: SessionData = {}
    private previousFlashData: SessionData = {}

    constructor(
        id: string,
        data: SessionData,
        driver: SessionDriver,
        config: SessionConfig,
    ) {
        this.id = id
        this.data = data
        this.originalData = JSON.stringify(data)
        this.driver = driver
        this.config = config

        // Extract flash data from previous request
        if (data._flash) {
            this.previousFlashData = data._flash as SessionData
            delete this.data._flash
        }
    }

    getId(): string {
        return this.id
    }

    get<T = unknown>(key: string, defaultValue?: T): T | undefined {
        if (key in this.data) {
            return this.data[key] as T
        }
        return defaultValue
    }

    set(key: string, value: unknown): void {
        this.data[key] = value
    }

    has(key: string): boolean {
        return key in this.data
    }

    forget(key: string): void {
        delete this.data[key]
    }

    all(): SessionData {
        return { ...this.data }
    }

    flush(): void {
        this.data = {}
    }

    async regenerate(): Promise<void> {
        const newId = generateSessionId()
        await this.driver.regenerate(this.id, newId)
        this.id = newId
    }

    async destroy(): Promise<void> {
        await this.driver.destroy(this.id)
        this.data = {}
        this.flashData = {}
    }

    flash(key: string, value: unknown): void {
        this.flashData[key] = value
    }

    getFlash<T = unknown>(key: string): T | undefined {
        return this.previousFlashData[key] as T | undefined
    }

    isDirty(): boolean {
        return JSON.stringify(this.data) !== this.originalData
    }

    /** @internal Save session (called by middleware) */
    async save(): Promise<void> {
        // Include flash data for next request
        const dataToSave = { ...this.data }
        if (Object.keys(this.flashData).length > 0) {
            dataToSave._flash = this.flashData
        }

        await this.driver.write(this.id, dataToSave, this.config.lifetime)
    }

    /** @internal Get flash data to save */
    getFlashDataToSave(): SessionData {
        return this.flashData
    }
}

// =============================================================================
// Session Middleware
// =============================================================================

const SESSION_KEY = 'lockness:session'
const SESSION_ID_COOKIE = 'lockness_session_id'

export function createSessionMiddleware(
    config?: Partial<SessionConfig>,
): MiddlewareHandler {
    const mergedConfig = { ...globalConfig, ...config }

    return async (c, next) => {
        // Create appropriate driver
        let driver: SessionDriver

        switch (mergedConfig.driver) {
            case 'deno-kv':
                driver = new DenoKvSessionDriver(mergedConfig.kvPath)
                break
            case 'memory':
                driver = new MemorySessionDriver()
                break
            case 'cookie':
            default:
                driver = new CookieSessionDriver(c, mergedConfig)
                break
        }

        // Get or create session ID
        let sessionId = getCookie(c, SESSION_ID_COOKIE)
        let sessionData: SessionData = {}

        if (sessionId) {
            // For cookie driver, data is in the cookie
            if (mergedConfig.driver === 'cookie') {
                sessionData = (await driver.read(sessionId)) || {}
            } else {
                sessionData = (await driver.read(sessionId)) || {}
            }
        }

        if (!sessionId) {
            sessionId = generateSessionId()
            // Set session ID cookie (separate from data for non-cookie drivers)
            if (mergedConfig.driver !== 'cookie') {
                setCookie(c, SESSION_ID_COOKIE, sessionId, {
                    path: mergedConfig.path,
                    domain: mergedConfig.domain,
                    secure: mergedConfig.secure,
                    httpOnly: mergedConfig.httpOnly,
                    sameSite: mergedConfig.sameSite,
                    maxAge: mergedConfig.lifetime,
                })
            }
        }

        // Create session store
        const session = new SessionStore(
            sessionId,
            sessionData,
            driver,
            mergedConfig,
        )

        // Store session in context
        c.set(SESSION_KEY, session)

        // Process request
        await next()

        // Save session after response
        if (
            session.isDirty() ||
            Object.keys(session.getFlashDataToSave()).length > 0
        ) {
            await session.save()
        }
    }
}

// =============================================================================
// Session Helper for Context
// =============================================================================

/**
 * Get session from context
 */
export function session(c: Context): Session {
    const sess = c.get(SESSION_KEY) as Session | undefined
    if (!sess) {
        throw new Error(
            'Session not available. Did you forget to add the session middleware?',
        )
    }
    return sess
}

// =============================================================================
// Type augmentation for Hono Context
// =============================================================================

declare module 'hono' {
    interface ContextVariableMap {
        'lockness:session': Session
    }
}
