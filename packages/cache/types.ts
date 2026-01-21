/**
 * @fileoverview Type definitions for the cache system.
 * @module @lockness/cache/types
 */

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
