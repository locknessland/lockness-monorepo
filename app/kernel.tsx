/**
 * @fileoverview Application Kernel - Bootstrap and Configuration
 *
 * This module is the entry point for configuring and bootstrapping the Lockness application.
 * It initializes all core services including:
 * - Database connection
 * - Session management
 * - Authentication guards
 * - Middleware stack
 * - Development tools
 *
 * @module app/kernel
 *
 * @example
 * ```typescript
 * import { bootstrap } from './app/kernel.tsx'
 *
 * const app = await bootstrap()
 * app.listen(8888)
 * ```
 */

import { App } from '@lockness/core'
import { container } from '@lockness/container'
import { configureSession, sessionMiddleware } from '@lockness/session'
import { Database } from '@lockness/drizzle'
import { initializeAuthMiddleware, SessionGuard } from '@lockness/auth'
import { collectAppRoutes, enableDevtools } from '@lockness/devtools'
import { LoggerMiddleware } from '@middleware/logger_middleware.ts'
import { UserProvider } from '../app/auth/user_provider.ts'
import { controllers } from './routes.ts'

/**
 * Bootstraps and configures the Lockness application.
 *
 * This function performs the complete application setup:
 *
 * 1. **Database**: Connects to PostgreSQL using the `DATABASE_URL` environment variable
 * 2. **Sessions**: Configures cookie-based sessions with secure settings
 * 3. **Authentication**: Sets up the `SessionGuard` with `UserProvider`
 * 4. **Middleware**: Registers session, auth, and logging middleware
 * 5. **Controllers**: Auto-discovers in dev, uses explicit list in production
 * 6. **Devtools**: Enables development toolbar when `APP_ENV=development`
 *
 * @returns Promise resolving to the configured App instance
 *
 * @example Basic usage
 * ```typescript
 * const app = await bootstrap()
 * app.listen(8888)
 * ```
 *
 * @example With custom port from environment
 * ```typescript
 * const app = await bootstrap()
 * const port = parseInt(Deno.env.get('PORT') || '8888')
 * app.listen(port)
 * ```
 *
 * @throws {Error} If database connection fails
 */
export const bootstrap = async (): Promise<App> => {
    // Initialize Database (Optional)
    const db = container.get<Database>(Database)
    await db.connect(
        Deno.env.get('DATABASE_URL') || 'postgres://localhost:5432/lockness',
    )

    // Configure session (optional - defaults to cookie driver)
    configureSession({
        driver: 'cookie', // 'cookie' | 'deno-kv' | 'memory'
        secret: Deno.env.get('APP_KEY') || 'change-me-in-production',
        lifetime: 7200, // 2 hours
        secure: Deno.env.get('APP_ENV') === 'production',
    })

    // Create Lockness application
    const app = new App()

    // Enable devtools in development (before app.init so middleware is registered first)
    if (app.isDevelopment) {
        enableDevtools(app.getHono())
    }

    // Configure global middlewares using fluent API
    app.useMiddleware(
        sessionMiddleware(), // Session middleware (required for auth)
        // Initialize auth (attaches authenticator to context)
        initializeAuthMiddleware({
            default: 'web',
            guards: {
                web: (ctx) =>
                    new SessionGuard('web', ctx, new UserProvider(db)),
            },
        }),
        LoggerMiddleware,
    )

    // Initialize with controllers and middlewares (auto-discovery in dev, explicit in prod)
    await app.init({
        // Auto-discover middlewares decorated with @DeclareMiddleware
        middlewaresDir: './app/middleware',

        // Auto-discover controllers in dev, use explicit list in prod
        controllersDir: app.isDevelopment ? './app/controller' : undefined,
        controllers: app.isDevelopment ? undefined : controllers,
        staticDir: 'public',

        /**
         * Optional: Manual middleware registration (merged with @DeclareMiddleware)
         *
         * Middlewares decorated with @DeclareMiddleware take precedence.
         * This is kept for backward compatibility and edge cases.
         */
        middlewares: {
            // Example of manually registered middleware (if needed)
            // 'custom': CustomMiddleware,
        },
    })

    // Collect routes for devtools (after app.init)
    if (app.isDevelopment) {
        collectAppRoutes(app)
    }

    return app
}
