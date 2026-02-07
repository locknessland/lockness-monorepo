/**
 * @fileoverview Named middleware discovery bootstrap step.
 *
 * Auto-discovers named middlewares from middlewaresDir.
 *
 * @module @lockness/core/kernel/bootstrap/steps/middlewares_discovery
 * @since 0.2.0
 */

import type { BootstrapStep } from '../types.ts'
import { discoverMiddlewares } from '../../../http/resolver.ts'

/**
 * Named middleware discovery step.
 *
 * Order: 400 (discovery phase)
 *
 * Responsibilities:
 * - Auto-discover named middlewares from configured directory
 * - Skip if directory not configured
 */
export const middlewaresDiscoveryStep: BootstrapStep = {
    id: 'middlewares_discovery',
    order: 400,

    async run(context) {
        if (!context.config.middlewaresDir) {
            return
        }

        await discoverMiddlewares(context.config.middlewaresDir)
    },
}
