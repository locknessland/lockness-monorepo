import {
    App,
    configureSession,
    container,
    sessionMiddleware,
} from '@lockness/core'
import { Database } from '@lockness/drizzle'
import {
    authMiddleware,
    initializeAuthMiddleware,
    SessionGuard,
} from '@lockness/auth'
import { collectAppRoutes, enableDevtools } from '@lockness/devtools'
import { LoggerMiddleware } from '@middleware/logger_middleware.ts'
import { UserProvider } from '../app/auth/user_provider.ts'
import { controllers } from './routes.ts'
import { errorHandler } from '@view/pages/errors/mod.tsx'

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

    // Enable devtools in development (before app.init so middleware is registered first)
    if (app.isDevelopment) {
        enableDevtools(app.getHono())
    }

    // Configure global middlewares using fluent API
    app
        .useMiddleware(
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
        .useErrorHandler(errorHandler)

    // Initialize with controllers (auto-discovery in dev, explicit in prod)
    await app.init({
        controllersDir: app.isDevelopment ? './app/controller' : undefined,
        controllers: app.isDevelopment ? undefined : controllers,
        staticDir: 'public',

        // Named middlewares (use with @Use('auth'))
        middlewares: {
            auth: class AuthMiddleware {
                async handle(
                    c: import('@lockness/core').Context,
                    next: import('@lockness/core').Next,
                ) {
                    return await authMiddleware()(c, next)
                }
            },
        },
    })

    // Collect routes for devtools (after app.init)
    if (app.isDevelopment) {
        collectAppRoutes(app)
    }

    // Add 404 handler (AFTER init so it's registered last)
    app.getHono().notFound((c) => {
        // deno-lint-ignore no-explicit-any
        return errorHandler(new Error('Not Found'), c as any)
    })

    return app
}
