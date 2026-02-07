/**
 * @fileoverview Devtools enablement bootstrap step.
 *
 * Enables devtools if configured and in development mode.
 *
 * @module @lockness/core/kernel/bootstrap/steps/devtools
 * @since 0.2.0
 */

import type { BootstrapStep } from '../types.ts'
import { tryImportOptionalPackage } from '../helpers.ts'

/**
 * Devtools enablement step.
 *
 * Order: 210 (after app creation, before middleware)
 *
 * Responsibilities:
 * - Import @lockness/devtools if devtools is enabled
 * - Enable devtools in development mode
 * - Skip gracefully if package not installed or not in development
 */
export const devtoolsStep: BootstrapStep = {
    id: 'devtools',
    order: 210,

    async run(context) {
        if (!context.app) {
            throw new Error('App instance not created')
        }

        // Only enable in development mode
        if (!context.config.devtools || !context.app.isDevelopment) {
            return
        }

        const devtoolsModule = await tryImportOptionalPackage<{
            enableDevtools: (hono: unknown) => void
        }>(
            '@lockness/devtools',
            'devtools',
        )

        if (!devtoolsModule) {
            return
        }

        const { enableDevtools } = devtoolsModule
        enableDevtools(context.app.getHono())
    },
}
