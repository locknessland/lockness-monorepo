/**
 * @fileoverview Database initialization bootstrap step.
 *
 * Connects to the database if configured in the kernel.
 *
 * @module @lockness/core/kernel/bootstrap/steps/database
 * @since 0.2.0
 */

import type { BootstrapStep } from '../types.ts'
import { getDatabaseUrl, tryImportOptionalPackage } from '../helpers.ts'
import { container } from '@lockness/container'

/**
 * Database initialization step.
 *
 * Order: 100 (infrastructure setup)
 *
 * Responsibilities:
 * - Import @lockness/drizzle if database is configured
 * - Connect to database using URL from config or environment
 * - Skip gracefully if package not installed
 */
export const databaseStep: BootstrapStep = {
    id: 'database',
    order: 100,

    async run(context) {
        if (!context.config.database) {
            return
        }

        const drizzleModule = await tryImportOptionalPackage<{
            Database: new () => { connect(url: string): Promise<void> }
        }>(
            '@lockness/drizzle',
            'database',
        )

        if (!drizzleModule) {
            return
        }

        const { Database } = drizzleModule
        const db = container.get(Database)

        // Determine connection URL
        const url = getDatabaseUrl(context.config.database)

        // Connect if URL is available
        if (url) {
            await db.connect(url)
        }
    },
}
