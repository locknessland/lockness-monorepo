/**
 * @fileoverview Event listener registration bootstrap step.
 *
 * Auto-discovers and registers event listeners.
 *
 * @module @lockness/core/kernel/bootstrap/steps/listeners
 * @since 0.2.0
 */

import {
    discoverListeners,
    registerListeners,
} from '../../../events/listener_discovery.ts'
import type { BootstrapStep } from '../types.ts'

/**
 * Event listener registration step.
 *
 * Order: 410 (discovery phase)
 *
 * Responsibilities:
 * - Auto-discover listeners from listenersDir (default: ./app/listener)
 * - Register explicit listener classes from config.listeners
 *
 * An absent listeners directory is the one tolerated failure — a project with
 * no listeners has none. Anything else refuses the boot: a listener file that
 * cannot load raises a `ListenerLoadError` naming the file, because a dropped
 * listener is event-driven behaviour that silently stops (#518).
 *
 * @throws {ListenerLoadError} If a listener file fails to load.
 * @throws Whatever else reading the listeners directory throws, except
 * `Deno.errors.NotFound`.
 */
export const listenersStep: BootstrapStep = {
    id: 'listeners',
    order: 410,

    async run(context) {
        const listenersDir = context.config.listenersDir ?? './app/listener'

        try {
            await discoverListeners(listenersDir)
        } catch (error) {
            // A project with no listeners legitimately has no directory.
            // Everything else — a file that does not resolve, compile or
            // evaluate, a directory that cannot be read — fails the boot.
            // Same shape as the schedules step.
            if (!(error instanceof Deno.errors.NotFound)) throw error
        }

        // Outside the discovery `try`, so an absent directory never skips the
        // classes the kernel names explicitly (from packages or production
        // builds).
        if (context.config.listeners && context.config.listeners.length > 0) {
            const count = registerListeners(
                context.config.listeners as Parameters<
                    typeof registerListeners
                >[0],
            )

            if (count > 0) {
                console.log(`✓ Registered ${count} explicit event listener(s)`)
            }
        }
    },
}
