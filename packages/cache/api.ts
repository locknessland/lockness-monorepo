/**
 * @fileoverview Public cache API functions.
 *
 * Provides a simple, functional API for cache operations.
 * All functions use the globally configured cache driver.
 *
 * @module @lockness/cache/api
 */

import { getDriver } from './store.ts'

/**
 * Retrieve a value from the cache.
 *
 * @typeParam T - The expected type of the cached value
 * @param key - The cache key to retrieve
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
 * Store a value in the cache.
 *
 * @typeParam T - The type of the value to cache
 * @param key - The cache key
 * @param value - The value to store
 * @param ttl - Time-to-live in seconds (0 = no expiration, undefined = default TTL)
 * @param tags - Optional tags for grouped invalidation
 *
 * @example
 * ```ts
 * // With default TTL
 * await set('user:1', { name: 'John' })
 *
 * // With custom TTL (5 minutes)
 * await set('session:abc', sessionData, 300)
 *
 * // With tags
 * await set('post:1', post, 3600, ['posts', 'featured'])
 * ```
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
 * Check if a key exists in the cache.
 *
 * @param key - The cache key to check
 * @returns True if the key exists and is not expired
 *
 * @example
 * ```ts
 * if (await has('user:123')) {
 *   console.log('User is cached')
 * }
 * ```
 */
export function has(key: string): Promise<boolean> {
    return getDriver().has(key)
}

/**
 * Remove a key from the cache.
 *
 * @param key - The cache key to delete
 *
 * @example
 * ```ts
 * await forget('user:123')
 * ```
 */
export function forget(key: string): Promise<void> {
    return getDriver().forget(key)
}

/**
 * Clear all entries from the cache.
 *
 * @example
 * ```ts
 * await flush()
 * ```
 */
export function flush(): Promise<void> {
    return getDriver().flush()
}

/**
 * Retrieve multiple values at once.
 *
 * @typeParam T - The expected type of the cached values
 * @param keys - Array of cache keys to retrieve
 * @returns Record mapping keys to values (null if not found)
 *
 * @example
 * ```ts
 * const values = await many<User>(['user:1', 'user:2', 'user:3'])
 * // { 'user:1': User, 'user:2': User, 'user:3': null }
 * ```
 */
export function many<T = unknown>(
    keys: string[],
): Promise<Record<string, T | null>> {
    return getDriver().many<T>(keys)
}

/**
 * Store multiple values at once.
 *
 * @typeParam T - The type of the values to cache
 * @param values - Record of key-value pairs to store
 * @param ttl - Time-to-live in seconds (uses default if not provided)
 *
 * @example
 * ```ts
 * await putMany({
 *   'setting:theme': 'dark',
 *   'setting:lang': 'en',
 * }, 3600)
 * ```
 */
export function putMany<T = unknown>(
    values: Record<string, T>,
    ttl?: number,
): Promise<void> {
    return getDriver().putMany(values, ttl)
}

/**
 * Increment a numeric value in the cache.
 *
 * If the key doesn't exist, it will be initialized with the increment value.
 *
 * @param key - The cache key
 * @param value - Amount to increment by (default: 1)
 * @returns The new value after incrementing
 *
 * @example
 * ```ts
 * const views = await increment('page:views')
 * const downloads = await increment('file:downloads', 5)
 * ```
 */
export function increment(key: string, value = 1): Promise<number> {
    return getDriver().increment(key, value)
}

/**
 * Decrement a numeric value in the cache.
 *
 * If the key doesn't exist, it will be initialized with the negative value.
 *
 * @param key - The cache key
 * @param value - Amount to decrement by (default: 1)
 * @returns The new value after decrementing
 *
 * @example
 * ```ts
 * const stock = await decrement('inventory:item:123')
 * ```
 */
export function decrement(key: string, value = 1): Promise<number> {
    return getDriver().decrement(key, value)
}

/**
 * Store a value in the cache.
 *
 * Alias for {@link set}.
 *
 * @typeParam T - The type of the value to cache
 * @param key - The cache key
 * @param value - The value to store
 * @param ttl - Time-to-live in seconds
 * @param tags - Optional tags for grouped invalidation
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
 * Store a value in the cache without expiration.
 *
 * @typeParam T - The type of the value to cache
 * @param key - The cache key
 * @param value - The value to store
 * @param tags - Optional tags for grouped invalidation
 *
 * @example
 * ```ts
 * await forever('config', configData)
 * ```
 */
export function forever<T = unknown>(
    key: string,
    value: T,
    tags?: string[],
): Promise<void> {
    return set(key, value, 0, tags)
}

/**
 * Get a value from the cache and delete it.
 *
 * Useful for one-time tokens or single-use data.
 *
 * @typeParam T - The expected type of the cached value
 * @param key - The cache key
 * @returns The cached value or null if not found
 *
 * @example
 * ```ts
 * const token = await pull<string>('reset:token:abc')
 * if (token) {
 *   // Token is now deleted from cache
 * }
 * ```
 */
export async function pull<T = unknown>(key: string): Promise<T | null> {
    const value = await get<T>(key)
    if (value !== null) {
        await forget(key)
    }
    return value
}

/**
 * Store a value only if the key doesn't exist.
 *
 * Useful for implementing distributed locks.
 *
 * @typeParam T - The type of the value to cache
 * @param key - The cache key
 * @param value - The value to store
 * @param ttl - Time-to-live in seconds
 * @param tags - Optional tags for grouped invalidation
 * @returns True if the value was stored, false if key already exists
 *
 * @example
 * ```ts
 * const acquired = await add('lock:process', true, 60)
 * if (!acquired) {
 *   console.log('Lock already held')
 *   return
 * }
 * try {
 *   // Critical section
 * } finally {
 *   await forget('lock:process')
 * }
 * ```
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
 * Delete all cache entries with a specific tag.
 *
 * @param tag - The tag to match
 *
 * @example
 * ```ts
 * // Invalidate all posts
 * await forgetByTag('posts')
 * ```
 */
export function forgetByTag(tag: string): Promise<void> {
    return getDriver().forgetByTag(tag)
}

/**
 * Delete all cache entries with a specific tag.
 *
 * Alias for {@link forgetByTag}.
 *
 * @param tag - The tag to match
 */
export function flushByTag(tag: string): Promise<void> {
    return getDriver().flushByTag(tag)
}
