/**
 * @fileoverview KernelBooted event emission bootstrap step.
 *
 * Emits the KernelBooted event to signal application readiness.
 *
 * @module @lockness/core/kernel/bootstrap/steps/events
 * @since 0.2.0
 */

import type { BootstrapStep } from '../types.ts'
import { tryImportOptionalPackage } from '../helpers.ts'

/**
 * KernelBooted event emission step.
 *
 * Order: 500 (event notification)
 *
 * Responsibilities:
 * - Emit KernelBooted event to notify listeners that app is ready
 * - Skip gracefully if events package not available
 */
export const eventsStep: BootstrapStep = {
    id: 'events',
    order: 500,

    async run(_context) {
        const eventsModule = await tryImportOptionalPackage<{
            dispatcher: () => {
                emit: (event: unknown) => Promise<void>
            }
            KernelBooted: new (appName: string, appEnv: string) => unknown
        }>(
            '@lockness/events',
            'events',
        )

        if (!eventsModule) {
            return
        }

        const { dispatcher, KernelBooted } = eventsModule

        try {
            await dispatcher().emit(
                new KernelBooted(
                    Deno.env.get('APP_NAME') ?? 'Lockness',
                    Deno.env.get('APP_ENV') ?? 'development',
                ),
            )
        } catch (error) {
            // Log unexpected errors but continue
            console.error('⚠️  Error emitting KernelBooted event:', error)
        }
    },
}
