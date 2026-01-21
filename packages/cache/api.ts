/**
 * @fileoverview Public cache API functions.
 * @module @lockness/cache/api
 */

import { getDriver } from './store.ts'

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
