/**
 * @fileoverview Fluent cache store API with tag support.
 *
 * Provides a chainable interface for cache operations with automatic tagging.
 * Use the {@link cache} factory function to create tagged cache stores.
 *
 * @module @lockness/cache/store
 */

import type { CacheDriver } from './types.ts'
import { getCacheConfig } from './config.ts'
import { DenoKvCacheDriver } from './drivers/deno_kv_driver.ts'
import { MemoryCacheDriver } from './drivers/memory_driver.ts'
import type { ICache } from '@lockness/contract'

/**
 * Global cache driver instance (lazy-initialized).
 * @internal
 */
let cacheDriver: CacheDriver | null = null

/**
 * Get the active cache driver, creating it if necessary.
 *
 * Uses the configuration set via {@link configureCache} to determine
 * which driver to instantiate.
 *
 * @returns The active cache driver instance
 * @internal
 */
export function getDriver(): CacheDriver {
    if (!cacheDriver) {
        const config = getCacheConfig()
        switch (config.driver) {
            case 'deno-kv':
                cacheDriver = new DenoKvCacheDriver(config.kvPath)
                break
            case 'redis':
                throw new Error(
                    'Redis driver requires manual setup. Use setCacheDriver(new RedisCacheDriver(client))',
                )
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

/**
 * Fluent cache API with tag support.
 *
 * Provides a chainable interface for cache operations with automatic tagging.
 * All operations performed through a CacheStore instance will use the
 * configured tags for grouped invalidation.
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
 * @see {@link CacheStore}
 */
export class CacheStore implements ICache {
    /** @internal Tags applied to all operations */
    private readonly tags: readonly string[]

    /**
     * Create a new cache store with optional tags.
     *
     * @param tags - Tags to apply to all cache operations
     */
    constructor(tags: readonly string[] = []) {
        this.tags = tags
    }

    /**
     * Create a new CacheStore with additional tags.
     *
     * @param tags - Additional tags to apply
     * @returns A new CacheStore instance with combined tags
     *
     * @example
     * ```ts
     * const apiCache = cache('api')
     * const userApiCache = apiCache.tag('users')
     * // userApiCache has both 'api' and 'users' tags
     * ```
     */
    tag(...tags: string[]): CacheStore {
        return new CacheStore([...this.tags, ...tags])
    }

    /**
     * Retrieve a value from the cache.
     *
     * @typeParam T - The expected type of the cached value
     * @param key - The cache key
     * @returns The cached value or null if not found/expired
     *
     * @example
     * ```ts
     * const user = await cache('users').get<User>('user:1')
     * ```
     */
    async get<T = unknown>(key: string): Promise<T | null> {
        return await getDriver().get<T>(key)
    }

    /**
     * Check if an item exists in the cache.
     *
     * @param key - The cache key
     * @returns True if the key exists and is not expired
     */
    async has(key: string): Promise<boolean> {
        return await getDriver().has(key)
    }

    /**
     * Remove an item from the cache.
     *
     * @param key - The cache key
     */
    async forget(key: string): Promise<void> {
        return await getDriver().forget(key)
    }

    /**
     * Store a value in the cache with the store's tags.
     *
     * @typeParam T - The type of the value to cache
     * @param key - The cache key
     * @param value - The value to store
     * @param ttl - Time-to-live in seconds (uses default if not provided)
     *
     * @example
     * ```ts
     * await cache('users').set('user:1', { name: 'John' }, 3600)
     * ```
     */
    async set<T = unknown>(key: string, value: T, ttl?: number): Promise<void> {
        return await getDriver().set(
            key,
            value,
            ttl,
            this.tags.length ? [...this.tags] : undefined,
        )
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
     * @returns The cached or newly computed value
     *
     * @example
     * ```ts
     * const users = await cache('users').remember('all', async () => {
     *   return await db.query.users.findMany()
     * }, 300)
     * ```
     */
    async remember<T = unknown>(
        key: string,
        callback: () => T | Promise<T>,
        ttl?: number,
    ): Promise<T> {
        const cached = await this.get<T>(key)

        if (cached !== null) {
            return cached
        }

        const value = await callback()
        await this.set(key, value, ttl)

        return value
    }

    /**
     * Flush all cache entries with the store's tags.
     *
     * If no tags are configured, flushes all cache entries.
     *
     * @example
     * ```ts
     * // Flush all entries tagged with 'users'
     * await cache('users').flush()
     *
     * // Flush entire cache
     * await cache().flush()
     * ```
     */
    async flush(): Promise<void> {
        if (this.tags.length === 0) {
            return await getDriver().flush()
        }

        // Flush by each tag
        await Promise.all(
            this.tags.map((tag) => getDriver().flushByTag(tag)),
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
