/**
 * @fileoverview Devtools route collection bootstrap step.
 *
 * Collects application routes for devtools display (after app.init).
 *
 * @module @lockness/core/kernel/bootstrap/steps/devtools_routes
 * @since 0.2.0
 */

import type { BootstrapStep } from '../types.ts'
import { tryImportOptionalPackage } from '../helpers.ts'

/**
 * Devtools route collection step.
 *
 * Order: 600 (post-initialization)
 *
 * Responsibilities:
 * - Collect app routes for devtools display
 * - Only runs if devtools enabled and in development
 * - Must run after app.init() completes
 */
export const devtoolsRoutesStep: BootstrapStep = {
    id: 'devtools_routes',
    order: 600,

    async run(context) {
        if (!context.app) {
            throw new Error('App instance not created')
        }

        // Only collect routes in development mode with devtools enabled
        if (!context.config.devtools || !context.app.isDevelopment) {
            return
        }

        const devtoolsModule = await tryImportOptionalPackage<{
            collectAppRoutes: (app: unknown) => void
        }>(
            '@lockness/devtools',
            'devtools',
        )

        if (!devtoolsModule) {
            return
        }

        const { collectAppRoutes } = devtoolsModule
        collectAppRoutes(context.app)
    },
}
