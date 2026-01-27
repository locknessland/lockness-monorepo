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
        const result = await kv.get<CacheItem<T> | { _chunked: number }>(['cache', cacheKey])

        if (!result.value) return null

        let item: CacheItem<T>

        // Handle chunked values
        if ('_chunked' in result.value) {
            const chunkCount = result.value._chunked
            const chunks: Uint8Array[] = []

            for (let i = 0; i < chunkCount; i++) {
                const chunkResult = await kv.get<Uint8Array>(['cache', cacheKey, 'chunks', i])
                if (chunkResult.value) {
                    chunks.push(chunkResult.value)
                }
            }

            // Assemble chunks
            const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0)
            const combined = new Uint8Array(totalLength)
            let offset = 0
            for (const chunk of chunks) {
                combined.set(chunk, offset)
                offset += chunk.length
            }

            try {
                const decoder = new TextDecoder()
                item = JSON.parse(decoder.decode(combined))
            } catch {
                return null
            }
        } else {
            item = result.value as CacheItem<T>
        }

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

        // We use JSON for consistent size checking and chunking
        const serialized = JSON.stringify(item)
        const encoder = new TextEncoder()
        const bytes = encoder.encode(serialized)

        // Deno KV limit is 64KB per value. We use 32KB per chunk for safety
        // and to stay well within atomic transaction limits (800KB).
        const CHUNK_SIZE = 32768 

        const expireIn = expiresAt !== null ? (expiresAt - Date.now()) : undefined

        // If value is too large, use chunking
        if (bytes.length > CHUNK_SIZE) {
            const chunkCount = Math.ceil(bytes.length / CHUNK_SIZE)

            // Deno KV Atomic limit: 800KB total. If larger, we can't use atomic for all chunks.
            // But for docs, it should stay under that.
            const atomic = kv.atomic()

            // Store manifest
            atomic.set(['cache', cacheKey], { _chunked: chunkCount }, { expireIn })

            // Store chunks as raw Uint8Array
            for (let i = 0; i < chunkCount; i++) {
                const start = i * CHUNK_SIZE
                const end = Math.min(start + CHUNK_SIZE, bytes.length)
                atomic.set(['cache', cacheKey, 'chunks', i], bytes.slice(start, end), { expireIn })
            }

            const commitSuccess = await atomic.commit()
            if (!commitSuccess) {
                // If atomic failed (likely due to transaction size), try manual sets
                // (less safe but better than total failure)
                await kv.set(['cache', cacheKey], { _chunked: chunkCount }, { expireIn })
                for (let i = 0; i < chunkCount; i++) {
                    const start = i * CHUNK_SIZE
                    const end = Math.min(start + CHUNK_SIZE, bytes.length)
                    await kv.set(['cache', cacheKey, 'chunks', i], bytes.slice(start, end), { expireIn })
                }
            }
        } else {
            // Standard set
            if (expireIn !== undefined) {
                await kv.set(['cache', cacheKey], item, { expireIn })
            } else {
                await kv.set(['cache', cacheKey], item)
            }
        }

        // Update tag indices
        if (tags) {
            for (const tag of tags) {
                await kv.set(['tag', tag, cacheKey], true, { expireIn })
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

        // Get item to find tags and check if chunked
        const result = await kv.get<CacheItem | { _chunked: number }>(['cache', cacheKey])

        if (!result.value) return

        const atomic = kv.atomic()

        // Delete main entry/manifest
        atomic.delete(['cache', cacheKey])

        // Delete chunks if exists
        if ('_chunked' in result.value) {
            for (let i = 0; i < result.value._chunked; i++) {
                atomic.delete(['cache', cacheKey, 'chunks', i])
            }
        } else if (result.value.tags) {
            // Delete tag references
            for (const tag of result.value.tags) {
                atomic.delete(['tag', tag, cacheKey])
            }
        }

        await atomic.commit()
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
