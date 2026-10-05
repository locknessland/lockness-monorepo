/**
 * Database Configuration
 *
 * @module config/database
 */

import type { DatabaseConfig } from '@lockness/core'

export const databaseConfig: DatabaseConfig = {
    /**
     * Read from the environment, with **no fallback**, like the kits: unset
     * means the kernel skips the connection and the app boots without a
     * database. A default URL would name a database nobody chose.
     */
    url: Deno.env.get('DATABASE_URL'),
}
