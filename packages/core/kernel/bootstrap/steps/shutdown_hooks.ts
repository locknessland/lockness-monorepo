/**
 * @fileoverview Moves the kernel's `@OnShutdown` metadata into the app's
 * shutdown registry, and applies `@Kernel({ shutdown })`.
 *
 * @module @lockness/core/kernel/bootstrap/steps/shutdown_hooks
 * @since 0.2.1
 */

import type { BootstrapStep } from '../types.ts'

/**
 * Shutdown hook registration.
 *
 * **Order: 320 — right after `boot_hooks` (310).** The app exists by then
 * (`app_init`, 200) and the kernel's own boot hooks have run, so anything they
 * opened can be torn down by a hook registered here. It is deliberately early:
 * a step that registered teardowns *after* the scheduler starts (560) would
 * leave a window in which the process holds resources nothing would release.
 *
 * ⚠️ **This step does not sort.** The file it mirrors, `steps/boot_hooks.ts`,
 * re-sorts at `:34-37` what `boot_runner.ts:131` already sorted — two copies of
 * one rule that have to agree. Ordering belongs to `shutdown_registry.ts` and
 * this step only moves metadata across.
 */
export const shutdownHooksStep: BootstrapStep = {
    id: 'shutdown_hooks',
    order: 320,

    run(context) {
        if (!context.app) {
            throw new Error('App instance not created')
        }

        // Validated here so a bad deadline fails the boot loudly, rather than
        // becoming a 1ms bound that abandons every future shutdown in silence.
        context.app.configureShutdown(context.config.shutdown)

        const hooks = context.shutdownHooks ?? []
        if (hooks.length === 0) {
            return
        }

        const kernel = context.kernel as Record<string, unknown>

        for (const hook of hooks) {
            const method = kernel[hook.method]
            if (typeof method !== 'function') continue

            context.app.onShutdown(
                hook.method,
                () => (method as () => void | Promise<void>).call(kernel),
                hook.priority,
            )
        }

        console.log(
            `✓ Shutdown hooks registered: ${hooks.length}`,
        )
    },
}
