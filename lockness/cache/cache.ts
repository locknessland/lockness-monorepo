/**
 * Lockness Cache System
 *
 * High-performance caching with multiple driver support.
 * Inspired by Laravel's cache system.
 * 
 * Note: Some methods are async for interface consistency even if they don't await
 */

// deno-lint-ignore-file require-await

// =============================================================================
// Types & Interfaces
// =============================================================================

export interface CacheConfig {
    /** Default cache driver */
    driver: 'memory' | 'deno-kv'
    /** Default TTL in seconds (0 = no expiration) */
    ttl: number
    /** Deno KV path (optional) */
    kvPath?: string
    /** Cache key prefix */
    prefix?: string
}

export interface CacheItem<T = unknown> {
    value: T
    expiresAt: number | null
    tags?: string[]
}

export interface CacheDriver {
    /** Get a value from cache */
    get<T = unknown>(key: string): Promise<T | null>
    /** Set a value in cache */
    set<T = unknown>(
        key: string,
        value: T,
        ttl?: number,
        tags?: string[],
    ): Promise<void>
    /** Check if key exists */
    has(key: string): Promise<boolean>
    /** Delete a key */
    forget(key: string): Promise<void>
    /** Clear all cache */
    flush(): Promise<void>
    /** Get multiple keys */
    many<T = unknown>(keys: string[]): Promise<Record<string, T | null>>
    /** Set multiple keys */
    putMany<T = unknown>(
        values: Record<string, T>,
        ttl?: number,
    ): Promise<void>
    /** Increment a numeric value */
    increment(key: string, value?: number): Promise<number>
    /** Decrement a numeric value */
    decrement(key: string, value?: number): Promise<number>
    /** Delete keys by tag */
    forgetByTag(tag: string): Promise<void>
    /** Flush keys by tag */
    flushByTag(tag: string): Promise<void>
}

// =============================================================================
// Cache Configuration
// =============================================================================

const defaultConfig: CacheConfig = {
    driver: 'memory',
    ttl: 3600, // 1 hour
    prefix: 'lockness',
}

let globalCacheConfig: CacheConfig = { ...defaultConfig }

export function configureCache(config: Partial<CacheConfig>): void {
    globalCacheConfig = { ...globalCacheConfig, ...config }
}

export function getCacheConfig(): CacheConfig {
    return globalCacheConfig
}

// =============================================================================
// Helper Functions
// =============================================================================

function getCacheKey(key: string): string {
    const prefix = globalCacheConfig.prefix || ''
    return prefix ? `${prefix}:${key}` : key
}

function isExpired(expiresAt: number | null): boolean {
    if (expiresAt === null) return false
    return Date.now() > expiresAt
}

function getExpiresAt(ttl?: number): number | null {
    const seconds = ttl ?? globalCacheConfig.ttl
    if (seconds === 0) return null
    return Date.now() + seconds * 1000
}

// =============================================================================
// Memory Driver
// =============================================================================

const memoryStore = new Map<string, CacheItem>()
const tagStore = new Map<string, Set<string>>() // tag -> keys

export class MemoryCacheDriver implements CacheDriver {
    async get<T = unknown>(key: string): Promise<T | null> {
        const cacheKey = getCacheKey(key)
        const item = memoryStore.get(cacheKey)

        if (!item) return null

        if (isExpired(item.expiresAt)) {
            await this.forget(key)
            return null
        }

        return item.value as T
    }

    async set<T = unknown>(
        key: string,
        value: T,
        ttl?: number,
        tags?: string[],
    ): Promise<void> {
        const cacheKey = getCacheKey(key)
        const expiresAt = getExpiresAt(ttl)

        memoryStore.set(cacheKey, {
            value,
            expiresAt,
            tags,
        })

        // Update tag store
        if (tags) {
            for (const tag of tags) {
                if (!tagStore.has(tag)) {
                    tagStore.set(tag, new Set())
                }
                tagStore.get(tag)!.add(cacheKey)
            }
        }
    }

    async has(key: string): Promise<boolean> {
        const value = await this.get(key)
        return value !== null
    }

    async forget(key: string): Promise<void> {
        const cacheKey = getCacheKey(key)
        const item = memoryStore.get(cacheKey)

        // Remove from tag store
        if (item?.tags) {
            for (const tag of item.tags) {
                tagStore.get(tag)?.delete(cacheKey)
            }
        }

        memoryStore.delete(cacheKey)
    }

    async flush(): Promise<void> {
        memoryStore.clear()
        tagStore.clear()
    }

    async many<T = unknown>(keys: string[]): Promise<Record<string, T | null>> {
        const result: Record<string, T | null> = {}

        for (const key of keys) {
            result[key] = await this.get<T>(key)
        }

        return result
    }

    async putMany<T = unknown>(
        values: Record<string, T>,
        ttl?: number,
    ): Promise<void> {
        for (const [key, value] of Object.entries(values)) {
            await this.set(key, value, ttl)
        }
    }

    async increment(key: string, value = 1): Promise<number> {
        const current = (await this.get<number>(key)) ?? 0
        const newValue = current + value
        await this.set(key, newValue)
        return newValue
    }

    async decrement(key: string, value = 1): Promise<number> {
        return await this.increment(key, -value)
    }

    async forgetByTag(tag: string): Promise<void> {
        const keys = tagStore.get(tag)
        if (!keys) return

        for (const cacheKey of keys) {
            memoryStore.delete(cacheKey)
        }

        tagStore.delete(tag)
    }

    async flushByTag(tag: string): Promise<void> {
        await this.forgetByTag(tag)
    }

    /** Get all keys in memory (for testing) */
    static getKeys(): string[] {
        return Array.from(memoryStore.keys())
    }

    /** Clear static stores (for testing) */
    static clear(): void {
        memoryStore.clear()
        tagStore.clear()
    }
}

// =============================================================================
// Deno KV Driver
// =============================================================================

export class DenoKvCacheDriver implements CacheDriver {
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

    async get<T = unknown>(key: string): Promise<T | null> {
        const kv = await this.getKv()
        const cacheKey = getCacheKey(key)
        const result = await kv.get<CacheItem<T>>(['cache', cacheKey])

        if (!result.value) return null

        const item = result.value

        if (isExpired(item.expiresAt)) {
            await this.forget(key)
            return null
        }

        return item.value
    }

    async set<T = unknown>(
        key: string,
        value: T,
        ttl?: number,
        tags?: string[],
    ): Promise<void> {
        const kv = await this.getKv()
        const cacheKey = getCacheKey(key)
        const expiresAt = getExpiresAt(ttl)

        const item: CacheItem<T> = {
            value,
            expiresAt,
            tags,
        }

        // Set with expiration if TTL is set
        if (expiresAt !== null) {
            await kv.set(['cache', cacheKey], item, {
                expireIn: (expiresAt - Date.now()),
            })
        } else {
            await kv.set(['cache', cacheKey], item)
        }

        // Update tag indices
        if (tags) {
            for (const tag of tags) {
                await kv.set(['tag', tag, cacheKey], true)
            }
        }
    }

    async has(key: string): Promise<boolean> {
        const value = await this.get(key)
        return value !== null
    }

    async forget(key: string): Promise<void> {
        const kv = await this.getKv()
        const cacheKey = getCacheKey(key)

        // Get item to find tags
        const result = await kv.get<CacheItem>(['cache', cacheKey])

        // Delete main entry
        await kv.delete(['cache', cacheKey])

        // Delete tag references
        if (result.value?.tags) {
            for (const tag of result.value.tags) {
                await kv.delete(['tag', tag, cacheKey])
            }
        }
    }

    async flush(): Promise<void> {
        const kv = await this.getKv()

        // Delete all cache entries
        const cacheIter = kv.list({ prefix: ['cache'] })
        for await (const entry of cacheIter) {
            await kv.delete(entry.key)
        }

        // Delete all tag entries
        const tagIter = kv.list({ prefix: ['tag'] })
        for await (const entry of tagIter) {
            await kv.delete(entry.key)
        }
    }

    async many<T = unknown>(keys: string[]): Promise<Record<string, T | null>> {
        const result: Record<string, T | null> = {}

        for (const key of keys) {
            result[key] = await this.get<T>(key)
        }

        return result
    }

    async putMany<T = unknown>(
        values: Record<string, T>,
        ttl?: number,
    ): Promise<void> {
        for (const [key, value] of Object.entries(values)) {
            await this.set(key, value, ttl)
        }
    }

    async increment(key: string, value = 1): Promise<number> {
        const current = (await this.get<number>(key)) ?? 0
        const newValue = current + value
        await this.set(key, newValue)
        return newValue
    }

    async decrement(key: string, value = 1): Promise<number> {
        return await this.increment(key, -value)
    }

    async forgetByTag(tag: string): Promise<void> {
        const kv = await this.getKv()

        // Get all keys for this tag
        const iter = kv.list({ prefix: ['tag', tag] })

        for await (const entry of iter) {
            const cacheKey = entry.key[2] as string
            await kv.delete(['cache', cacheKey])
            await kv.delete(entry.key)
        }
    }

    async flushByTag(tag: string): Promise<void> {
        await this.forgetByTag(tag)
    }
}

// =============================================================================
// Cache Manager
// =============================================================================

let cacheDriver: CacheDriver | null = null

function getDriver(): CacheDriver {
    if (!cacheDriver) {
        const config = globalCacheConfig
        switch (config.driver) {
            case 'deno-kv':
                cacheDriver = new DenoKvCacheDriver(config.kvPath)
                break
            case 'memory':
            default:
                cacheDriver = new MemoryCacheDriver()
                break
        }
    }
    return cacheDriver
}

/**
 * Set a custom cache driver
 */
export function setCacheDriver(driver: CacheDriver): void {
    cacheDriver = driver
}

// =============================================================================
// Cache API
// =============================================================================

/**
 * Get a value from cache
 */
export function get<T = unknown>(key: string): Promise<T | null> {
    return getDriver().get<T>(key)
}

/**
 * Set a value in cache
 *
 * @param key Cache key
 * @param value Value to store
 * @param ttl Time to live in seconds (0 = no expiration)
 * @param tags Optional tags for grouping
 */
export function set<T = unknown>(
    key: string,
    value: T,
    ttl?: number,
    tags?: string[],
): Promise<void> {
    return getDriver().set(key, value, ttl, tags)
}

/**
 * Get value from cache or set it if not exists
 *
 * @param key Cache key
 * @param callback Function to generate value if not cached
 * @param ttl Time to live in seconds
 * @param tags Optional tags
 */
export async function remember<T = unknown>(
    key: string,
    callback: () => T | Promise<T>,
    ttl?: number,
    tags?: string[],
): Promise<T> {
    const cached = await get<T>(key)

    if (cached !== null) {
        return cached
    }

    const value = await callback()
    await set(key, value, ttl, tags)

    return value
}

/**
 * Get value from cache or set it forever if not exists
 */
export async function rememberForever<T = unknown>(
    key: string,
    callback: () => T | Promise<T>,
    tags?: string[],
): Promise<T> {
    return await remember(key, callback, 0, tags)
}

/**
 * Check if key exists in cache
 */
export function has(key: string): Promise<boolean> {
    return getDriver().has(key)
}

/**
 * Delete a key from cache
 */
export function forget(key: string): Promise<void> {
    return getDriver().forget(key)
}

/**
 * Clear all cache
 */
export function flush(): Promise<void> {
    return getDriver().flush()
}

/**
 * Get multiple keys at once
 */
export function many<T = unknown>(
    keys: string[],
): Promise<Record<string, T | null>> {
    return getDriver().many<T>(keys)
}

/**
 * Set multiple keys at once
 */
export function putMany<T = unknown>(
    values: Record<string, T>,
    ttl?: number,
): Promise<void> {
    return getDriver().putMany(values, ttl)
}

/**
 * Increment a numeric value
 */
export function increment(key: string, value = 1): Promise<number> {
    return getDriver().increment(key, value)
}

/**
 * Decrement a numeric value
 */
export function decrement(key: string, value = 1): Promise<number> {
    return getDriver().decrement(key, value)
}

/**
 * Set a value in cache (alias for set)
 */
export function put<T = unknown>(
    key: string,
    value: T,
    ttl?: number,
    tags?: string[],
): Promise<void> {
    return set(key, value, ttl, tags)
}

/**
 * Set a value in cache forever (no expiration)
 */
export function forever<T = unknown>(
    key: string,
    value: T,
    tags?: string[],
): Promise<void> {
    return set(key, value, 0, tags)
}

/**
 * Get and delete a value from cache
 */
export async function pull<T = unknown>(key: string): Promise<T | null> {
    const value = await get<T>(key)
    if (value !== null) {
        await forget(key)
    }
    return value
}

/**
 * Add a value only if key doesn't exist
 */
export async function add<T = unknown>(
    key: string,
    value: T,
    ttl?: number,
    tags?: string[],
): Promise<boolean> {
    if (await has(key)) {
        return false
    }
    await set(key, value, ttl, tags)
    return true
}

/**
 * Delete keys by tag
 */
export function forgetByTag(tag: string): Promise<void> {
    return getDriver().forgetByTag(tag)
}

/**
 * Flush cache by tag (alias)
 */
export function flushByTag(tag: string): Promise<void> {
    return getDriver().flushByTag(tag)
}

// =============================================================================
// Cache Store (Fluent API)
// =============================================================================

export class CacheStore {
    constructor(private tags: string[] = []) { }

    /**
     * Tag the cache entries
     */
    tag(...tags: string[]): CacheStore {
        return new CacheStore([...this.tags, ...tags])
    }

    /**
     * Get a value from cache
     */
    get<T = unknown>(key: string): Promise<T | null> {
        return get<T>(key)
    }

    /**
     * Set a value in cache with tags
     */
    set<T = unknown>(key: string, value: T, ttl?: number): Promise<void> {
        return set(key, value, ttl, this.tags.length ? this.tags : undefined)
    }

    /**
     * Remember with tags
     */
    remember<T = unknown>(
        key: string,
        callback: () => T | Promise<T>,
        ttl?: number,
    ): Promise<T> {
        return remember(key, callback, ttl, this.tags.length ? this.tags : undefined)
    }

    /**
     * Flush all entries with these tags
     */
    flush(): Promise<void> {
        if (this.tags.length === 0) {
            return getDriver().flush()
        }

        // Flush by each tag
        return Promise.all(this.tags.map((tag) => flushByTag(tag))).then(() => { })
    }
}

/**
 * Create a cache store instance
 */
export function cache(...tags: string[]): CacheStore {
    return new CacheStore(tags)
}
