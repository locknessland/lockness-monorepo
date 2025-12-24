import {
    App,
    configureSession,
    container,
    type Context,
    sessionMiddleware,
} from 'lockness'
import { Database } from '@lockness/drizzle'
import {
    authMiddleware,
    initializeAuthMiddleware,
    SessionGuard,
} from '@lockness/auth'
import { enableDevtools } from '@lockness/devtools'
import { LoggerMiddleware } from '@middleware/logger_middleware.ts'
import { UserProvider } from '../src/auth/user_provider.ts'
import { controllers } from './routes.ts'
import { NotFoundPage } from '@view/pages/errors/not_found.tsx'
import { UnauthorizedPage } from '@view/pages/errors/unauthorized.tsx'
import { ForbiddenPage } from '@view/pages/errors/forbidden.tsx'
import { ServerErrorPage } from '@view/pages/errors/server_error.tsx'

/**
 * Default error handler
 */
const errorHandler = (error: Error, c: Context) => {
    console.error('Error:', error)

    // Check for status property (from custom errors like UnauthorizedAccessError)
    const status = (error as unknown as { status?: number }).status || 500

    // Return appropriate error page based on status
    switch (status) {
        case 404:
            return c.html(<NotFoundPage />, 404)
        case 401:
            return c.html(<UnauthorizedPage />, 401)
        case 403:
            return c.html(<ForbiddenPage />, 403)
        default: {
            // Show error details only in development
            const showDetails = Deno.env.get('APP_ENV') === 'development'
            return c.html(
                <ServerErrorPage error={error} showDetails={showDetails} />,
                500,
            )
        }
    }
}

export const bootstrap = async () => {
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

    // Use auto-discovery in development, explicit imports in production
    const isDevelopment = Deno.env.get('APP_ENV') === 'development'

    // Enable devtools BEFORE app.init (in development)
    if (isDevelopment) {
        enableDevtools(app.getHono())
    }

    if (isDevelopment) {
        // Auto-discover controllers (dev mode)
        await app.init({
            controllersDir: './src/controller',
            staticDir: 'public',

            // Error handler
            errorHandler,

            // Global middlewares (applied to all routes)
            globalMiddlewares: [
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
            ],

            // Named middlewares (use with @Use('auth'))
            middlewares: {
                auth: class AuthMiddleware {
                    async handle(
                        c: import('hono').Context,
                        next: import('hono').Next,
                    ) {
                        return await authMiddleware()(c, next)
                    }
                },
            },
        })
    } else {
        // Explicit imports (compile/production mode)
        await app.init({
            controllers,
            staticDir: 'public',

            // Error handler
            errorHandler,

            // Global middlewares (applied to all routes)
            globalMiddlewares: [
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
            ],

            // Named middlewares (use with @Use('auth'))
            middlewares: {
                auth: class AuthMiddleware {
                    async handle(
                        c: import('hono').Context,
                        next: import('hono').Next,
                    ) {
                        return await authMiddleware()(c, next)
                    }
                },
            },
        })
    }

    return app
}
