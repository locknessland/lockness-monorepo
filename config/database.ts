/**
 * Database Configuration
 *
 * @module config/database
 */

import type { DatabaseConfig } from '@lockness/core'

export const databaseConfig: DatabaseConfig = {
    url: Deno.env.get('DATABASE_URL') || 'postgres://localhost:5432/lockness',
}
