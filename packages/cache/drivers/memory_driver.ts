/**
 * @fileoverview In-memory cache driver implementation.
 * @module @lockness/cache/drivers/memory_driver
 */

// deno-lint-ignore-file require-await

import type { CacheDriver, CacheItem } from '../types.ts'
import { getCacheKey, getExpiresAt, isExpired } from '../config.ts'

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
