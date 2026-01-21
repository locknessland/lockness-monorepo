/**
 * @fileoverview High-performance caching system with multiple driver support.
 *
 * Provides a unified API for caching with support for:
 * - Memory driver (fast, in-process)
 * - Deno KV driver (persistent, distributed)
 * - Tag-based cache invalidation
 * - Fluent API via CacheStore
 *
 * Inspired by Laravel's cache system.
 *
 * @module @lockness/cache
 *
 * @example
 * ```ts
 * import { cache, set, get, remember } from '@lockness/cache'
 *
 * // Simple get/set
 * await set('user:1', { name: 'John' }, 3600)
 * const user = await get('user:1')
 *
 * // Remember pattern
 * const data = await remember('expensive:query', async () => {
 *   return await db.query.users.findMany()
 * }, 300)
 *
 * // Fluent API with tags
 * await cache('users', 'api').set('all', users, 3600)
 * await cache('users').flush()
 * ```
 *
 * @remarks
 * Some methods are async for interface consistency even if they don't await.
 */

// deno-lint-ignore-file require-await

// =============================================================================
// Types & Interfaces
// =============================================================================

/**
 * Configuration options for the cache system.
 *
 * @example
 * ```ts
 * configureCache({
 *   driver: 'deno-kv',
 *   ttl: 3600,
 *   prefix: 'myapp'
 * })
 * ```
 */
export interface CacheConfig {
    /**
     * The cache driver to use.
     * - `'memory'`: Fast in-process cache (default)
     * - `'deno-kv'`: Persistent Deno KV storage
     */
    driver: 'memory' | 'deno-kv'

    /**
     * Default time-to-live in seconds.
     * Set to `0` for no expiration.
     * @defaultValue 3600 (1 hour)
     */
    ttl: number

    /**
     * Path to the Deno KV database file.
     * Only used with the `'deno-kv'` driver.
     * @example ':memory:' for in-memory KV
     */
    kvPath?: string

    /**
     * Prefix for all cache keys.
     * Helps avoid collisions in shared storage.
     * @defaultValue 'lockness'
     */
    prefix?: string
}

/**
 * Internal representation of a cached item.
 *
 * @typeParam T - The type of the cached value
 * @internal
 */
export interface CacheItem<T = unknown> {
    /** The cached value */
    readonly value: T
    /** Unix timestamp when item expires, or null for no expiration */
    readonly expiresAt: number | null
    /** Tags associated with this cache entry */
    readonly tags?: string[]
}

/**
 * Contract for cache driver implementations.
 *
 * Implement this interface to create custom cache drivers.
 *
 * @example
 * ```ts
 * class RedisCacheDriver implements CacheDriver {
 *   async get<T>(key: string): Promise<T | null> {
 *     const value = await redis.get(key)
 *     return value ? JSON.parse(value) : null
 *   }
 *   // ... implement other methods
 * }
 * ```
 */
export interface CacheDriver {
    /**
     * Retrieve a value from the cache.
     * @typeParam T - The expected type of the cached value
     * @param key - The cache key
     * @returns The cached value or null if not found/expired
     */
    get<T = unknown>(key: string): Promise<T | null>

    /**
     * Store a value in the cache.
     * @typeParam T - The type of the value to cache
     * @param key - The cache key
     * @param value - The value to store
     * @param ttl - Time-to-live in seconds (optional)
     * @param tags - Tags for grouped invalidation (optional)
     */
    set<T = unknown>(
        key: string,
        value: T,
        ttl?: number,
        tags?: string[],
    ): Promise<void>

    /**
     * Check if a key exists in the cache.
     * @param key - The cache key
     * @returns True if key exists and is not expired
     */
    has(key: string): Promise<boolean>

    /**
     * Remove a key from the cache.
     * @param key - The cache key to delete
     */
    forget(key: string): Promise<void>

    /**
     * Clear all entries from the cache.
     */
    flush(): Promise<void>

    /**
     * Retrieve multiple values at once.
     * @typeParam T - The expected type of the cached values
     * @param keys - Array of cache keys
     * @returns Record mapping keys to values (null if not found)
     */
    many<T = unknown>(keys: string[]): Promise<Record<string, T | null>>

    /**
     * Store multiple values at once.
     * @typeParam T - The type of the values to cache
     * @param values - Record of key-value pairs
     * @param ttl - Time-to-live in seconds (optional)
     */
    putMany<T = unknown>(
        values: Record<string, T>,
        ttl?: number,
    ): Promise<void>

    /**
     * Increment a numeric value.
     * @param key - The cache key
     * @param value - Amount to increment by (default: 1)
     * @returns The new value after incrementing
     */
    increment(key: string, value?: number): Promise<number>

    /**
     * Decrement a numeric value.
     * @param key - The cache key
     * @param value - Amount to decrement by (default: 1)
     * @returns The new value after decrementing
     */
    decrement(key: string, value?: number): Promise<number>

    /**
     * Delete all cache entries with a specific tag.
     * @param tag - The tag to match
     */
    forgetByTag(tag: string): Promise<void>

    /**
     * Flush cache entries by tag (alias for forgetByTag).
     * @param tag - The tag to match
     */
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

/**
 * Configure the global cache settings.
 *
 * Call this early in your application startup to set the cache driver and options.
 *
 * @param config - Partial configuration to merge with defaults
 *
 * @example
 * ```ts
 * configureCache({
 *   driver: 'deno-kv',
 *   ttl: 7200, // 2 hours
 *   prefix: 'myapp'
 * })
 * ```
 */
export function configureCache(config: Partial<CacheConfig>): void {
    globalCacheConfig = { ...globalCacheConfig, ...config }
}

/**
 * Get the current cache configuration.
 * @returns The active cache configuration
 */
export function getCacheConfig(): CacheConfig {
    return globalCacheConfig
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Build the full cache key with prefix.
 * @param key - The original cache key
 * @returns The prefixed cache key
 * @internal
 */
function getCacheKey(key: string): string {
    const prefix = globalCacheConfig.prefix || ''
    return prefix ? `${prefix}:${key}` : key
}

/**
 * Check if a cache item has expired.
 * @param expiresAt - The expiration timestamp or null
 * @returns True if expired, false otherwise
 * @internal
 */
function isExpired(expiresAt: number | null): boolean {
    if (expiresAt === null) return false
    return Date.now() > expiresAt
}

/**
 * Calculate the expiration timestamp from TTL.
 * @param ttl - Time-to-live in seconds (uses default if not provided)
 * @returns Unix timestamp or null for no expiration
 * @internal
 */
function getExpiresAt(ttl?: number): number | null {
    const seconds = ttl ?? globalCacheConfig.ttl
    if (seconds === 0) return null
    return Date.now() + seconds * 1000
}

// =============================================================================
// Memory Driver
// =============================================================================

/** @internal In-memory cache storage */
const memoryStore = new Map<string, CacheItem>()
/** @internal Tag to keys mapping for invalidation */
const tagStore = new Map<string, Set<string>>()

/**
 * In-memory cache driver implementation.
 *
 * Fast, process-local cache suitable for development and single-instance deployments.
 * Data is lost when the process exits.
 *
 * @implements {CacheDriver}
 *
 * @example
 * ```ts
 * import { setCacheDriver, MemoryCacheDriver } from '@lockness/cache'
 *
 * setCacheDriver(new MemoryCacheDriver())
 * ```
 */
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

/**
 * Deno KV cache driver implementation.
 *
 * Persistent, distributed cache using Deno's built-in KV store.
 * Suitable for production deployments with data persistence requirements.
 *
 * @implements {CacheDriver}
 *
 * @example
 * ```ts
 * import { setCacheDriver, DenoKvCacheDriver } from '@lockness/cache'
 *
 * // Use default path
 * setCacheDriver(new DenoKvCacheDriver())
 *
 * // Or specify a custom path
 * setCacheDriver(new DenoKvCacheDriver('./cache.db'))
 * ```
 */
export class DenoKvCacheDriver implements CacheDriver {
    /** @internal KV instance (lazy-loaded) */
    private kv: Deno.Kv | null = null
    /** @internal Path to KV database */
    private readonly kvPath?: string

    /**
     * Create a new Deno KV cache driver.
     * @param kvPath - Optional path to the KV database file
     */
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
 * Set a custom cache driver.
 *
 * Use this to inject your own driver implementation (e.g., Redis, Memcached).
 *
 * @param driver - The driver instance to use
 *
 * @example
 * ```ts
 * const redisDriver = new RedisCacheDriver(redisClient)
 * setCacheDriver(redisDriver)
 * ```
 */
export function setCacheDriver(driver: CacheDriver): void {
    cacheDriver = driver
}

// =============================================================================
// Cache API
// =============================================================================

/**
 * Retrieve a value from the cache.
 *
 * @typeParam T - The expected type of the cached value
 * @param key - The cache key
 * @returns The cached value or null if not found/expired
 *
 * @example
 * ```ts
 * const user = await get<User>('user:123')
 * if (user) {
 *   console.log(user.name)
 * }
 * ```
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
 * Get value from cache or compute and store it if not cached.
 *
 * This is the recommended pattern for caching expensive operations.
 *
 * @typeParam T - The type of the cached/computed value
 * @param key - The cache key
 * @param callback - Function to compute value if not cached
 * @param ttl - Time-to-live in seconds (uses default if not provided)
 * @param tags - Optional tags for grouped invalidation
 * @returns The cached or newly computed value
 *
 * @example
 * ```ts
 * const users = await remember('all-users', async () => {
 *   return await db.query.users.findMany()
 * }, 300) // Cache for 5 minutes
 * ```
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

/**
 * Fluent cache API with tag support.
 *
 * Provides a chainable interface for cache operations with automatic tagging.
 *
 * @example
 * ```ts
 * // Create tagged cache
 * const userCache = cache('users', 'api')
 *
 * // All operations use these tags
 * await userCache.set('user:1', user, 3600)
 * await userCache.remember('all', () => db.users.findMany())
 *
 * // Invalidate all entries with 'users' tag
 * await cache('users').flush()
 * ```
 */
export class CacheStore {
    /**
     * Create a new cache store with optional tags.
     * @param tags - Tags to apply to all operations
     */
    constructor(private readonly tags: string[] = []) { }

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
        return remember(
            key,
            callback,
            ttl,
            this.tags.length ? this.tags : undefined,
        )
    }

    /**
     * Flush all entries with these tags
     */
    flush(): Promise<void> {
        if (this.tags.length === 0) {
            return getDriver().flush()
        }

        // Flush by each tag
        return Promise.all(this.tags.map((tag) => flushByTag(tag))).then(
            () => { },
        )
    }
}

/**
 * Create a fluent cache store instance with optional tags.
 *
 * This is the main entry point for the fluent cache API.
 *
 * @param tags - Tags to apply to all cache operations
 * @returns A new CacheStore instance
 *
 * @example
 * ```ts
 * // Without tags
 * await cache().set('key', 'value')
 *
 * // With tags for grouped invalidation
 * await cache('users').set('user:1', user)
 * await cache('users', 'api').set('user:2', user)
 *
 * // Flush all 'users' entries
 * await cache('users').flush()
 * ```
 */
export function cache(...tags: string[]): CacheStore {
    return new CacheStore(tags)
}
