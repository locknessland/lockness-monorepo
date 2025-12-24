import {
    App,
    configureSession,
    container,
    sessionMiddleware,
} from 'lockness'
import { Database } from '@lockness/drizzle'
import {
    authMiddleware,
    initializeAuthMiddleware,
    SessionGuard,
} from '@lockness/auth'
import { LoggerMiddleware } from '@middleware/logger_middleware.ts'
import { UserProvider } from '../src/auth/user_provider.ts'

// Import controllers explicitly (no Vite glob)
import { AppController } from '@controller/app_controller.tsx'
import { AuthController } from '@controller/auth_controller.ts'
import { DocsController } from '@controller/docs_controller.tsx'
import { TestController } from '@controller/test_controller.tsx'

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

    // Register controllers explicitly (no more Vite glob)
    const controllers = [AppController, AuthController, DocsController, TestController]
    console.log(`🔌 Loaded ${controllers.length} controllers`)

    await app.init({
        controllers,
        staticDir: 'static',

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

    return app
}
