/**
 * @fileoverview KernelBooted event emission bootstrap step.
 *
 * Emits the KernelBooted event to signal application readiness.
 *
 * @module @lockness/core/kernel/bootstrap/steps/events
 * @since 0.2.0
 */

import type { BootstrapStep } from '../types.ts'
import { dispatcher, KernelBooted } from '@lockness/events'
import { resolveEnvName } from '../../../environment.ts'

/**
 * KernelBooted event emission step.
 *
 * Order: 500 (event notification)
 *
 * Responsibilities:
 * - Emit KernelBooted event to notify listeners that app is ready
 *
 * `@lockness/events` is a hard dependency of core and is imported statically
 * (#505). It used to go through the optional-package loader, whose variable
 * specifier resolves against the *application's* import map — which a
 * JSR-installed app does not give `@lockness/events` — so `KernelBooted` never
 * fired there, while every workspace test saw it fire.
 */
export const eventsStep: BootstrapStep = {
    id: 'events',
    order: 500,

    async run(_context) {
        try {
            await dispatcher().emit(
                new KernelBooted(
                    Deno.env.get('APP_NAME') ?? 'Lockness',
                    resolveEnvName(),
                ),
            )
        } catch (error) {
            // Log unexpected errors but continue
            console.error('⚠️  Error emitting KernelBooted event:', error)
        }
    },
}
