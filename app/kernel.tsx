/**
 * @fileoverview Application Kernel - Bootstrap and Configuration
 *
 * This module is the entry point for configuring and bootstrapping the Lockness application.
 * It uses the declarative @Kernel decorator approach for cleaner configuration.
 *
 * @module app/kernel
 *
 * @example
 * ```typescript
 * import { createApp } from '@lockness/core'
 * import { AppKernel } from './app/kernel.tsx'
 *
 * const app = await createApp(AppKernel)
 * app.listen(8888)
 * ```
 */

import {
    type App,
    DeclareGlobalMiddleware,
    Kernel,
    OnBoot,
} from '@lockness/core'
import { sessionMiddleware } from '@lockness/session'
import { initializeAuthMiddleware } from '@lockness/auth'
import { collectAppRoutes } from '@lockness/devtools'
import { LoggerMiddleware } from '@middleware/logger_middleware.ts'
import { i18nMiddleware } from '@middleware/i18n_middleware.ts'
import { authConfig } from './auth/guards.ts'
import { controllers } from './routes.ts'
import { databaseConfig, sessionConfig } from '../config/mod.ts'

/**
 * Application Kernel with Declarative Configuration
 *
 * This kernel configures the Lockness application using the @Kernel decorator:
 *
 * 1. **Database**: Connects to PostgreSQL using the `DATABASE_URL` environment variable
 * 2. **Sessions**: Configures cookie-based sessions with secure settings
 * 3. **DevTools**: Enables development toolbar when `APP_ENV=development`
 * 4. **Controllers**: Auto-discovers in dev, uses explicit list in production
 * 5. **Middlewares**: Auto-discovers from `./app/middleware` via `@DeclareMiddleware`
 *
 * @example Basic usage
 * ```typescript
 * import { createApp } from '@lockness/core'
 * import { AppKernel } from './app/kernel.tsx'
 *
 * const app = await createApp(AppKernel)
 * app.listen(8888)
 * ```
 */
@Kernel({
    // Database configuration
    database: databaseConfig,

    // Session configuration
    session: sessionConfig,

    // Enable devtools in development
    devtools: true,

    // Static files directory
    staticDir: 'public',

    // Controllers configuration
    // Development: auto-discovery from directory
    // Production: uses explicit controllers list
    controllersDir: './app/controller',
    controllers: controllers,

    // Auto-discover middlewares decorated with @DeclareMiddleware
    middlewaresDir: './app/middleware',

    // Mount points for i18n URL pattern
    // Routes are accessible at root AND under /:langId/:countryId/
    mountPoints: [
        {
            pattern: '/:langId/:countryId',
            middleware: i18nMiddleware,
        },
    ],

    // Binary compilation configuration
    compile: {
        output: '_dist/lockness',
        main: 'main.ts',
        flags: ['-A', '--env-file=.env.production.local'],
        assets: [
            'public',
            'docs',
            { source: 'packages/ui/components', target: 'packages/ui/components' },
        ],
        scripts: [
            'scripts/generate_ui_registry.ts',
            'deno task css:build',
            'scripts/prepare_docs.ts',
        ],
    },
})
export class AppKernel {
    /**
     * Global Middleware Stack
     *
     * These middlewares are applied to all routes in order:
     * - sessionMiddleware(): Handles session management (required for auth)
     * - initializeAuthMiddleware(): Sets up authentication with SessionGuard
     * - LoggerMiddleware: Logs HTTP requests
     */
    @DeclareGlobalMiddleware()
    globalMiddlewares = [
        sessionMiddleware(),
        initializeAuthMiddleware(authConfig),
        LoggerMiddleware,
    ]

    /**
     * Collect routes for devtools after initialization
     *
     * This hook runs after the application is fully initialized
     * and collects route information for the development toolbar.
     */
    @OnBoot()
    collectDevtoolsRoutes(app: App) {
        if (app.isDevelopment) {
            collectAppRoutes(app)
        }
    }
}
