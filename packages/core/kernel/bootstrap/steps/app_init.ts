/**
 * @fileoverview App instance creation bootstrap step.
 *
 * Creates the App instance that will be used throughout the application.
 *
 * @module @lockness/core/kernel/bootstrap/steps/app_init
 * @since 0.2.0
 */

import type { BootstrapStep } from '../types.ts'
import { App } from '../../../app.ts'
import type { ControllerClass } from '../../../types.ts'

/**
 * App instance creation and initialization step.
 *
 * Order: 200 (app creation)
 *
 * Responsibilities:
 * - Create App instance
 * - Initialize app with controllers and static files (after other steps complete)
 */
export const appInitStep: BootstrapStep = {
    id: 'app_init',
    order: 200,

    run(context) {
        // Create App instance and add to context
        context.app = new App()

        // Note: App.init() is called later (order 550) after middleware and hooks
        // This is just the app creation step
    },
}

/**
 * App initialization step (after middleware and hooks).
 *
 * Order: 550 (late initialization)
 *
 * Responsibilities:
 * - Initialize app with controllers and static files
 * - This runs after middleware, hooks, and discovery steps
 */
export const appInitializationStep: BootstrapStep = {
    id: 'app_initialization',
    order: 550,

    async run(context) {
        if (!context.app) {
            throw new Error('App instance not created')
        }

        // Initialize app with controllers and static files
        await context.app.init({
            controllersDir: context.app.isDevelopment
                ? context.config.controllersDir
                : undefined,
            controllers: context.app.isDevelopment
                ? undefined
                : (context.config.controllers as ControllerClass[] | undefined),
            staticDir: context.config.staticDir,
            middlewaresDir: context.config.middlewaresDir,
            mountPoint: context.config.mountPoint,
        })
    },
}
