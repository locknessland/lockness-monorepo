/**
 * @fileoverview Redis cache driver implementation.
 *
 * Provides a distributed cache driver using Redis for multi-instance
 * deployments. Compatible with popular Redis clients.
 *
 * @module @lockness/cache/drivers/redis_driver
 */

import {
    deregisterDisposable,
    type DisposableHandle,
    registerDisposable,
} from '@lockness/contract/lifecycle/internal'
import { markDriverClosed } from '../closed_drivers.ts'
import type { CacheDriver, CacheItem } from '../types.ts'
import { getCacheKey, getExpiresAt, isExpired } from '../config.ts'

/**
 * Redis client interface.
 *
 * Defines the minimum required methods for Redis client compatibility.
 * Works with popular Redis clients like `npm:redis`, `npm:ioredis`,
 * or `https://deno.land/x/redis`.
 *
 * @example
 * ```ts
 * // Using npm:redis
 * import { createClient } from 'npm:redis'
 * const client = createClient()
 * await client.connect()
 *
 * // Using deno.land/x/redis
 * import { connect } from 'https://deno.land/x/redis/mod.ts'
 * const client = await connect({ hostname: 'localhost', port: 6379 })
 * ```
 */
export interface RedisClient {
    /**
     * Get a value by key.
     * @param key - The Redis key
     * @returns The stored string value or null if not found
     */
    get(key: string): Promise<string | null>

    /**
     * Set a value with optional expiration.
     * @param key - The Redis key
     * @param value - The string value to store
     * @param options - Optional expiration settings (EX for seconds, PX for milliseconds)
     * @returns Implementation-specific response (typically 'OK')
     */
    set(
        key: string,
        value: string,
        options?: { EX?: number; PX?: number },
    ): Promise<unknown>

    /**
     * Delete one or more keys.
     * @param key - Single key or array of keys to delete
     * @returns Number of keys deleted
     */
    del(key: string | string[]): Promise<number>

    /**
     * Check if a key exists.
     * @param key - Single key or array of keys to check
     * @returns Number of keys that exist
     */
    exists(key: string | string[]): Promise<number>

    /**
     * Increment a value by a given amount.
     * @param key - The Redis key
     * @param increment - Amount to increment by
     * @returns The new value after incrementing
     */
    incrBy(key: string, increment: number): Promise<number>

    /**
     * Decrement a value by a given amount.
     * @param key - The Redis key
     * @param decrement - Amount to decrement by
     * @returns The new value after decrementing
     */
    decrBy(key: string, decrement: number): Promise<number>

    /**
     * Get multiple values at once.
     * @param keys - Array of keys to retrieve
     * @returns Array of values (null for missing keys)
     */
    mGet(keys: string[]): Promise<(string | null)[]>

    /**
     * Set multiple values at once.
     * @param keyValues - Object mapping keys to values
     * @returns Implementation-specific response (typically 'OK')
     */
    mSet(keyValues: Record<string, string>): Promise<unknown>

    /**
     * Add members to a set.
     * @param key - The Redis key for the set
     * @param members - Member(s) to add
     * @returns Number of members added
     */
    sAdd(key: string, members: string | string[]): Promise<number>

    /**
     * Get all members of a set.
     * @param key - The Redis key for the set
     * @returns Array of set members
     */
    sMembers(key: string): Promise<string[]>

    /**
     * Remove members from a set.
     * @param key - The Redis key for the set
     * @param members - Member(s) to remove
     * @returns Number of members removed
     */
    sRem(key: string, members: string | string[]): Promise<number>

    /**
     * Get keys matching a pattern.
     * @param pattern - Glob-style pattern to match
     * @returns Array of matching keys
     */
    keys(pattern: string): Promise<string[]>

    /**
     * Set expiration on a key.
     * @param key - The Redis key
     * @param seconds - Expiration time in seconds
     * @returns 1 if timeout was set, 0 if key doesn't exist
     */
    expire(key: string, seconds: number): Promise<number>
}

/**
 * Configuration options for Redis cache driver.
 *
 * @example
 * ```ts
 * const options: RedisCacheDriverOptions = {
 *   keyPrefix: 'myapp:cache',
 *   tagPrefix: 'myapp:tag',
 *   serialize: JSON.stringify,
 *   deserialize: JSON.parse,
 * }
 * ```
 */
export interface RedisCacheDriverOptions {
    /**
     * Whether this driver owns the connection and may close it at shutdown.
     *
     * **Defaults to `false`**, because the client is handed in already
     * connected and the application may still be using it elsewhere. Closing
     * something you were given is how a teardown becomes an outage.
     */
    ownsClient?: boolean

    /**
     * Prefix for all Redis cache keys.
     *
     * Helps avoid collisions when sharing Redis with other applications.
     * The final key format will be: `{keyPrefix}:{globalPrefix}:{key}`
     *
     * @defaultValue 'cache'
     */
    readonly keyPrefix?: string

    /**
     * Prefix for tag set keys used for grouped invalidation.
     *
     * Tags are stored as Redis sets containing the keys associated with each tag.
     * The final tag key format will be: `{tagPrefix}:{tagName}`
     *
     * @defaultValue 'tag'
     */
    readonly tagPrefix?: string

    /**
     * Custom serialization function for cache values.
     *
     * Use this to implement custom serialization (e.g., MessagePack, BSON).
     *
     * @param value - The value to serialize
     * @returns Serialized string representation
     * @defaultValue JSON.stringify
     */
    readonly serialize?: (value: unknown) => string

    /**
     * Custom deserialization function for cache values.
     *
     * Must be the inverse of the serialize function.
     *
     * @param value - The serialized string
     * @returns Deserialized value
     * @defaultValue JSON.parse
     */
    readonly deserialize?: (value: string) => unknown
}

/**
 * Redis cache driver implementation.
 *
 * High-performance distributed cache using Redis. Suitable for production
 * deployments requiring shared cache across multiple instances.
 *
 * @implements {CacheDriver}
 *
 * @example
 * ```ts
 * import { createClient } from 'npm:redis'
 * import { setCacheDriver, RedisCacheDriver } from '@lockness/cache'
 *
 * const redis = createClient({ url: 'redis://localhost:6379' })
 * await redis.connect()
 *
 * setCacheDriver(new RedisCacheDriver(redis))
 * ```
 *
 * @example
 * ```ts
 * // With custom options
 * import { connect } from 'https://deno.land/x/redis/mod.ts'
 * import { setCacheDriver, RedisCacheDriver } from '@lockness/cache'
 *
 * const redis = await connect({ hostname: 'localhost', port: 6379 })
 *
 * setCacheDriver(new RedisCacheDriver(redis, {
 *   keyPrefix: 'myapp:cache',
 *   tagPrefix: 'myapp:tag'
 * }))
 * ```
 */
export class RedisCacheDriver implements CacheDriver {
    /** @internal Redis client instance */
    private readonly client: RedisClient
    /** @internal Key prefix for cache entries */
    private readonly keyPrefix: string
    /** @internal Key prefix for tag sets */
    private readonly tagPrefix: string
    /** @internal Serialization function */
    private readonly serialize: (value: unknown) => string
    /** @internal Deserialization function */
    private readonly deserialize: (value: string) => unknown
    readonly #ownsClient: boolean = false
    #handle?: DisposableHandle

    /**
     * Create a new Redis cache driver.
     *
     * @param client - Redis client instance (must be connected)
     * @param options - Driver configuration options
     */
    constructor(client: RedisClient, options: RedisCacheDriverOptions = {}) {
        this.client = client
        // Registered whether or not we own it: the drain needs to know the
        // driver exists. `ownsClient` decides whether disposing it actually
        // closes anything — closing a connection the application opened and
        // handed in would break something it may still be using elsewhere.
        this.#ownsClient = options.ownsClient === true
        this.#handle = registerDisposable({
            name: 'cache:redis',
            dispose: () => this.close(),
            priority: 60,
        })
        this.keyPrefix = options.keyPrefix ?? 'cache'
        this.tagPrefix = options.tagPrefix ?? 'tag'
        this.serialize = options.serialize ?? JSON.stringify
        this.deserialize = options.deserialize ?? JSON.parse
    }

    /**
     * Build the full Redis key for a cache entry.
     * @internal
     */
    private buildKey(key: string): string {
        const cacheKey = getCacheKey(key)
        return `${this.keyPrefix}:${cacheKey}`
    }

    /**
     * Build the Redis key for a tag set.
     * @internal
     */
    private buildTagKey(tag: string): string {
        return `${this.tagPrefix}:${tag}`
    }

    async get<T = unknown>(key: string): Promise<T | null> {
        const redisKey = this.buildKey(key)
        const data = await this.client.get(redisKey)

        if (!data) return null

        try {
            const item = this.deserialize(data) as CacheItem<T>

            // Check expiration (Redis TTL handles this, but double-check for safety)
            if (isExpired(item.expiresAt)) {
                await this.forget(key)
                return null
            }

            return item.value
        } catch {
            // Invalid JSON or corrupted data
            await this.forget(key)
            return null
        }
    }

    async set<T = unknown>(
        key: string,
        value: T,
        ttl?: number,
        tags?: string[],
    ): Promise<void> {
        const redisKey = this.buildKey(key)
        const expiresAt = getExpiresAt(ttl)

        const item: CacheItem<T> = {
            value,
            expiresAt,
            tags,
        }

        const serialized = this.serialize(item)

        if (expiresAt !== null) {
            // Calculate TTL in seconds
            const ttlSeconds = Math.ceil((expiresAt - Date.now()) / 1000)
            await this.client.set(redisKey, serialized, { EX: ttlSeconds })
        } else {
            await this.client.set(redisKey, serialized)
        }

        // Update tag sets
        if (tags) {
            for (const tag of tags) {
                const tagKey = this.buildTagKey(tag)
                await this.client.sAdd(tagKey, redisKey)
            }
        }
    }

    async has(key: string): Promise<boolean> {
        const redisKey = this.buildKey(key)
        const exists = await this.client.exists(redisKey)
        return exists > 0
    }

    async forget(key: string): Promise<void> {
        const redisKey = this.buildKey(key)

        // Get item to find tags before deletion
        const data = await this.client.get(redisKey)

        if (data) {
            try {
                const item = this.deserialize(data) as CacheItem

                // Remove from tag sets
                if (item.tags) {
                    for (const tag of item.tags) {
                        const tagKey = this.buildTagKey(tag)
                        await this.client.sRem(tagKey, redisKey)
                    }
                }
            } catch {
                // Ignore parse errors
            }
        }

        await this.client.del(redisKey)
    }

    async flush(): Promise<void> {
        // Get all cache keys
        const cachePattern = `${this.keyPrefix}:*`
        const cacheKeys = await this.client.keys(cachePattern)

        if (cacheKeys.length > 0) {
            await this.client.del(cacheKeys)
        }

        // Get all tag keys
        const tagPattern = `${this.tagPrefix}:*`
        const tagKeys = await this.client.keys(tagPattern)

        if (tagKeys.length > 0) {
            await this.client.del(tagKeys)
        }
    }

    async many<T = unknown>(keys: string[]): Promise<Record<string, T | null>> {
        if (keys.length === 0) {
            return {}
        }

        const redisKeys = keys.map((key) => this.buildKey(key))
        const values = await this.client.mGet(redisKeys)

        const result: Record<string, T | null> = {}

        for (let i = 0; i < keys.length; i++) {
            const data = values[i]
            if (data) {
                try {
                    const item = this.deserialize(data) as CacheItem<T>
                    if (!isExpired(item.expiresAt)) {
                        result[keys[i]] = item.value
                        continue
                    }
                } catch {
                    // Ignore parse errors
                }
            }
            result[keys[i]] = null
        }

        return result
    }

    async putMany<T = unknown>(
        values: Record<string, T>,
        ttl?: number,
    ): Promise<void> {
        const entries = Object.entries(values)

        if (entries.length === 0) {
            return
        }

        const expiresAt = getExpiresAt(ttl)
        const keyValues: Record<string, string> = {}

        for (const [key, value] of entries) {
            const redisKey = this.buildKey(key)
            const item: CacheItem<T> = {
                value,
                expiresAt,
                tags: undefined,
            }
            keyValues[redisKey] = this.serialize(item)
        }

        await this.client.mSet(keyValues)

        // Set expiration on all keys if TTL is specified
        if (expiresAt !== null) {
            const ttlSeconds = Math.ceil((expiresAt - Date.now()) / 1000)
            for (const redisKey of Object.keys(keyValues)) {
                await this.client.expire(redisKey, ttlSeconds)
            }
        }
    }

    async increment(key: string, value = 1): Promise<number> {
        const redisKey = this.buildKey(key)

        // Check if key exists, if not initialize it
        const exists = await this.client.exists(redisKey)
        if (exists === 0) {
            // Initialize with the increment value
            await this.set(key, value)
            return value
        }

        // Get current item to preserve metadata
        const data = await this.client.get(redisKey)
        if (data) {
            try {
                const item = this.deserialize(data) as CacheItem<number>
                const newValue = (item.value || 0) + value
                await this.set(key, newValue)
                return newValue
            } catch {
                // If parsing fails, start fresh
                await this.set(key, value)
                return value
            }
        }

        await this.set(key, value)
        return value
    }

    async decrement(key: string, value = 1): Promise<number> {
        return await this.increment(key, -value)
    }

    async forgetByTag(tag: string): Promise<void> {
        const tagKey = this.buildTagKey(tag)

        // Get all keys with this tag
        const keys = await this.client.sMembers(tagKey)

        if (keys.length > 0) {
            await this.client.del(keys)
        }

        // Delete the tag set itself
        await this.client.del(tagKey)
    }

    async flushByTag(tag: string): Promise<void> {
        await this.forgetByTag(tag)
    }

    /**
     * Release the Redis connection — **only if this driver opened it**.
     *
     * The client arrives already connected from the application
     * (`new RedisCacheDriver(client)`, "must be connected"), so by default this
     * withdraws the registration and closes nothing. Pass `ownsClient: true`
     * when the driver is the sole owner.
     *
     * @example
     * ```typescript
     * new RedisCacheDriver(client, { ownsClient: true })
     * ```
     */
    async close(): Promise<void> {
        markDriverClosed(this)
        if (this.#handle) {
            deregisterDisposable(this.#handle)
            this.#handle = undefined
        }
        if (this.#ownsClient) {
            await (this.client as { close?: () => void | Promise<void> })
                .close?.()
        }
    }
}
