/**
 * @fileoverview Event listener registration bootstrap step.
 *
 * Auto-discovers and registers event listeners.
 *
 * @module @lockness/core/kernel/bootstrap/steps/listeners
 * @since 0.2.0
 */

import type { BootstrapStep } from '../types.ts'

/**
 * Event listener registration step.
 *
 * Order: 410 (discovery phase)
 *
 * Responsibilities:
 * - Auto-discover listeners from listenersDir (default: ./app/listener)
 * - Register explicit listener classes from config.listeners
 * - Skip gracefully if events package not available or directory doesn't exist
 */
export const listenersStep: BootstrapStep = {
    id: 'listeners',
    order: 410,

    async run(context) {
        try {
            const { discoverListeners, registerListeners } = await import(
                '../../../events/listener_discovery.ts'
            )

            // Auto-discover from directory
            const listenersDir = context.config.listenersDir ?? './app/listener'
            await discoverListeners(listenersDir)

            // Register explicit listener classes (from packages or production builds)
            if (
                context.config.listeners && context.config.listeners.length > 0
            ) {
                const count = registerListeners(
                    context.config.listeners as Parameters<
                        typeof registerListeners
                    >[0],
                )

                if (count > 0) {
                    console.log(
                        `✓ Registered ${count} explicit event listener(s)`,
                    )
                }
            }
        } catch (error) {
            // Silently skip if directory doesn't exist or events package not available
            if (
                error instanceof Deno.errors.NotFound ||
                (error instanceof TypeError &&
                    error.message.includes('Cannot resolve'))
            ) {
                // Expected conditions - no action needed
            } else {
                // Log unexpected errors but continue bootstrap
                console.error('⚠️  Error discovering listeners:', error)
            }
        }
    },
}
