/**
 * @fileoverview Fluent cache store API with tag support.
 * @module @lockness/cache/store
 */

import type { CacheDriver } from './types.ts'
import { getCacheConfig } from './config.ts'
import { DenoKvCacheDriver } from './drivers/deno_kv_driver.ts'
import { MemoryCacheDriver } from './drivers/memory_driver.ts'

/**
 * Global cache driver instance.
 * @internal
 */
let cacheDriver: CacheDriver | null = null

/**
 * Get the active cache driver, creating it if necessary.
 * @returns The active cache driver
 * @internal
 */
export function getDriver(): CacheDriver {
    if (!cacheDriver) {
        const config = getCacheConfig()
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
    constructor(private readonly tags: string[] = []) {}

    /**
     * Tag the cache entries
     */
    tag(...tags: string[]): CacheStore {
        return new CacheStore([...this.tags, ...tags])
    }

    /**
     * Get a value from cache
     */
    async get<T = unknown>(key: string): Promise<T | null> {
        return await getDriver().get<T>(key)
    }

    /**
     * Set a value in cache with tags
     */
    async set<T = unknown>(key: string, value: T, ttl?: number): Promise<void> {
        return await getDriver().set(
            key,
            value,
            ttl,
            this.tags.length ? this.tags : undefined,
        )
    }

    /**
     * Remember with tags
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
     * Flush all entries with these tags
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
