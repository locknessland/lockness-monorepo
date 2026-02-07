/**
 * @fileoverview Boot hooks execution bootstrap step.
 *
 * Executes boot hooks declared with @OnBoot decorator.
 *
 * @module @lockness/core/kernel/bootstrap/steps/boot_hooks
 * @since 0.2.0
 */

import type { BootstrapStep } from '../types.ts'

/**
 * Boot hooks execution step.
 *
 * Order: 310 (after middleware, before discovery)
 *
 * Responsibilities:
 * - Sort boot hooks by priority (highest first)
 * - Execute each boot hook method with app instance
 */
export const bootHooksStep: BootstrapStep = {
    id: 'boot_hooks',
    order: 310,

    async run(context) {
        if (!context.app) {
            throw new Error('App instance not created')
        }

        if (context.bootHooks.length === 0) {
            return
        }

        // Sort by priority (highest first)
        const sortedHooks = [...context.bootHooks].sort((a, b) =>
            b.priority - a.priority
        )

        // Execute each boot hook
        for (const hook of sortedHooks) {
            const method = (context.kernel as Record<string, unknown>)[
                hook.method
            ]

            if (typeof method === 'function') {
                await (method as (app: unknown) => Promise<void> | void).call(
                    context.kernel,
                    context.app,
                )
            }
        }
    },
}
