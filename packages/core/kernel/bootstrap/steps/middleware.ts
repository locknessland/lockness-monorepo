/**
 * @fileoverview Global middleware registration bootstrap step.
 *
 * Registers global middlewares declared with @DeclareGlobalMiddleware.
 *
 * @module @lockness/core/kernel/bootstrap/steps/middleware
 * @since 0.2.0
 */

import type { BootstrapStep } from '../types.ts'

/**
 * Global middleware registration step.
 *
 * Order: 300 (middleware setup)
 *
 * Responsibilities:
 * - Read global middleware from kernel instance
 * - Register middlewares with app
 */
export const middlewareStep: BootstrapStep = {
    id: 'middleware',
    order: 300,

    run(context) {
        if (!context.app) {
            throw new Error('App instance not created')
        }

        // Check if global middleware property is defined
        if (!context.globalMiddlewareProp) {
            return
        }

        // Read middleware array from kernel instance
        const middlewares = (context.kernel as Record<string, unknown>)[
            context.globalMiddlewareProp
        ]

        if (Array.isArray(middlewares) && middlewares.length > 0) {
            context.app.useMiddleware(...middlewares)
        }
    },
}
