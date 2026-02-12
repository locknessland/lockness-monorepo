/**
 * @fileoverview Lifecycle events middleware registration bootstrap step.
 *
 * Registers the internal lifecycle middleware that emits RequestStarted,
 * RequestCompleted, and ExceptionOccurred events.
 *
 * @module @lockness/core/kernel/bootstrap/steps/lifecycle
 * @since 0.2.0
 */

import type { BootstrapStep } from '../types.ts'

/**
 * Lifecycle events middleware registration step.
 *
 * Order: 250 (early middleware, before user global middlewares at 300)
 *
 * Responsibilities:
 * - Apply lifecycle middleware to app
 * - This runs BEFORE user middlewares so events fire at correct times
 */
export const lifecycleStep: BootstrapStep = {
    id: 'lifecycle',
    order: 250,

    async run(context) {
        if (!context.app) {
            throw new Error('App instance not created')
        }

        // Import lifecycle middleware
        const { createLifecycleMiddleware } = await import(
            '../../../http/lifecycle_middleware.ts'
        )

        // Apply to internal Hono instance
        context.app.getHono().use('*', createLifecycleMiddleware())
    },
}
