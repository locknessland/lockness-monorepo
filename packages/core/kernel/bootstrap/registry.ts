/**
 * @fileoverview Bootstrap step registry and runner.
 *
 * This module provides:
 * - Default bootstrap steps in execution order
 * - Step runner that executes steps sequentially
 *
 * @module @lockness/core/kernel/bootstrap/registry
 * @since 0.2.0
 *
 * @example Running bootstrap steps
 * ```typescript
 * import { runBootstrapSteps, getDefaultSteps } from './registry.ts'
 * import type { BootstrapContext } from './types.ts'
 *
 * const context: BootstrapContext = {
 *     config: kernelConfig,
 *     kernel: kernelInstance,
 *     KernelClass,
 *     globalMiddlewareProp,
 *     bootHooks,
 * }
 *
 * await runBootstrapSteps(context)
 * ```
 */

import type { BootstrapContext, BootstrapStep } from './types.ts'

// Import all step implementations
import { databaseStep } from './steps/database.ts'
import { sessionStep } from './steps/session.ts'
import { cacheStep } from './steps/cache.ts'
import { appInitializationStep, appInitStep } from './steps/app_init.ts'
import { devtoolsStep } from './steps/devtools.ts'
import { lifecycleStep } from './steps/lifecycle.ts'
import { middlewareStep } from './steps/middleware.ts'
import { bootHooksStep } from './steps/boot_hooks.ts'
import { middlewaresDiscoveryStep } from './steps/middlewares_discovery.ts'
import { listenersStep } from './steps/listeners.ts'
import { eventsStep } from './steps/events.ts'
import { schedulerStep } from './steps/scheduler.ts'
import { devtoolsRoutesStep } from './steps/devtools_routes.ts'

/**
 * Get the default bootstrap steps in execution order.
 *
 * Steps are ordered by their `order` property (lower values execute first):
 * - 100: Database initialization
 * - 110: Session configuration
 * - 120: Cache configuration
 * - 200: App instance creation
 * - 210: Devtools enablement
 * - 250: Lifecycle events middleware
 * - 300: Global middleware registration
 * - 310: Boot hooks execution
 * - 400: Named middleware discovery
 * - 410: Event listener registration
 * - 500: KernelBooted event emission
 * - 550: App initialization (controllers, static files)
 * - 560: Scheduler discovery and start
 * - 600: Devtools route collection
 *
 * @returns Array of bootstrap steps in execution order
 */
export function getDefaultSteps(): readonly BootstrapStep[] {
    return [
        databaseStep,
        sessionStep,
        cacheStep,
        appInitStep,
        devtoolsStep,
        lifecycleStep,
        middlewareStep,
        bootHooksStep,
        middlewaresDiscoveryStep,
        listenersStep,
        eventsStep,
        appInitializationStep,
        schedulerStep,
        devtoolsRoutesStep,
    ]
}

/**
 * Run bootstrap steps sequentially.
 *
 * Executes each step in order, passing the shared context.
 * If a step throws an error, the entire bootstrap process fails.
 *
 * @param context - Bootstrap context shared across all steps
 * @param steps - Array of steps to execute (defaults to getDefaultSteps())
 * @throws {Error} If any step fails critically
 *
 * @example
 * ```typescript
 * const context: BootstrapContext = {
 *     config: kernelConfig,
 *     kernel: kernelInstance,
 *     KernelClass,
 *     globalMiddlewareProp,
 *     bootHooks,
 * }
 *
 * await runBootstrapSteps(context)
 * ```
 */
export async function runBootstrapSteps(
    context: BootstrapContext,
    steps: readonly BootstrapStep[] = getDefaultSteps(),
): Promise<void> {
    // Sort steps by order (defensive, should already be sorted)
    const sortedSteps = [...steps].sort((a, b) => a.order - b.order)

    // Execute each step sequentially
    for (const step of sortedSteps) {
        await step.run(context)
    }
}
