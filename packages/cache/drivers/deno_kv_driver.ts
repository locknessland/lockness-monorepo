/**
 * @fileoverview Deno KV cache driver implementation.
 * @module @lockness/cache/drivers/deno_kv_driver
 */

import type { CacheDriver, CacheItem } from '../types.ts'
import { getCacheKey, getExpiresAt, isExpired } from '../config.ts'

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
