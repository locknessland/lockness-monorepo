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

// =============================================================================
// Type Exports
// =============================================================================

export type { CacheConfig, CacheDriver, CacheItem } from './types.ts'

// =============================================================================
// Configuration Exports
// =============================================================================

export { configureCache, getCacheConfig } from './config.ts'

// =============================================================================
// Driver Exports
// =============================================================================

export {
    DenoKvCacheDriver,
    MemoryCacheDriver,
    RedisCacheDriver,
    type RedisCacheDriverOptions,
    type RedisClient,
} from './drivers/mod.ts'

// =============================================================================
// Store Exports (Fluent API)
// =============================================================================

export { cache, CacheStore, setCacheDriver } from './store.ts'

// =============================================================================
// API Exports
// =============================================================================

export {
    add,
    decrement,
    flush,
    flushByTag,
    forever,
    forget,
    forgetByTag,
    get,
    has,
    increment,
    many,
    pull,
    put,
    putMany,
    remember,
    rememberForever,
    set,
} from './api.ts'
