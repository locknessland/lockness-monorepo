import { type CacheConfig } from '@lockness/core'
import { isProduction } from './app.ts'

/**
 * Cache Configuration
 *
 * Configures the @lockness/cache system:
 * - driver: 'memory', 'deno-kv', or 'redis'
 * - ttl: Time-to-live in seconds
 * - kvPath: Path to Deno KV database
 * - prefix: Key prefix for namespacing
 */
export const cacheConfig: CacheConfig = {
    /**
     * Cache storage driver
     * Use 'memory' for development or 'deno-kv' for persistence.
     */
    driver: isProduction ? 'deno-kv' : 'memory',

    /**
     * Default time-to-live in seconds
     * @default 1 hour
     */
    ttl: 3600,

    /**
     * Prefix for all cache keys to avoid collisions
     */
    prefix: 'lockness',

    /**
     * Path to the Deno KV database (only for 'deno-kv' driver)
     * Leave undefined to use the default database (recommended for Deno Deploy).
     */
    kvPath: Deno.env.get('DATABASE_KV_PATH'),
}
