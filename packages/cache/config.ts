/**
 * @fileoverview Cache configuration management and helper functions.
 * @module @lockness/cache/config
 */

import type { CacheConfig } from './types.ts'

/**
 * Default cache configuration.
 * @internal
 */
const defaultConfig: CacheConfig = {
    driver: 'memory',
    ttl: 3600, // 1 hour
    prefix: 'lockness',
}

/**
 * Global cache configuration (mutable).
 * @internal
 */
let globalCacheConfig: CacheConfig = { ...defaultConfig }

/**
 * Configure the global cache settings.
 *
 * Call this early in your application startup to set the cache driver and options.
 *
 * @param config - Partial configuration to merge with defaults
 *
 * @example
 * ```ts
 * configureCache({
 *   driver: 'deno-kv',
 *   ttl: 7200, // 2 hours
 *   prefix: 'myapp'
 * })
 * ```
 */
export function configureCache(config: Partial<CacheConfig>): void {
    globalCacheConfig = { ...globalCacheConfig, ...config }
}

/**
 * Get the current cache configuration.
 * @returns The active cache configuration
 */
export function getCacheConfig(): CacheConfig {
    return globalCacheConfig
}

/**
 * Build the full cache key with prefix.
 * @param key - The original cache key
 * @returns The prefixed cache key
 * @internal
 */
export function getCacheKey(key: string): string {
    const prefix = globalCacheConfig.prefix || ''
    return prefix ? `${prefix}:${key}` : key
}

/**
 * Check if a cache item has expired.
 * @param expiresAt - The expiration timestamp or null
 * @returns True if expired, false otherwise
 * @internal
 */
export function isExpired(expiresAt: number | null): boolean {
    if (expiresAt === null) return false
    return Date.now() > expiresAt
}

/**
 * Calculate the expiration timestamp from TTL.
 * @param ttl - Time-to-live in seconds (uses default if not provided)
 * @returns Unix timestamp or null for no expiration
 * @internal
 */
export function getExpiresAt(ttl?: number): number | null {
    const seconds = ttl ?? globalCacheConfig.ttl
    if (seconds === 0) return null
    return Date.now() + seconds * 1000
}
