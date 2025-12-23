import {
    App,
    configureSession,
    container,
    type ControllerClass,
    sessionMiddleware,
} from 'lockness'
import { Database } from '@lockness/drizzle'
import { LoggerMiddleware } from '@middleware/logger_middleware.ts'
import { AuthMiddleware } from '@middleware/auth_middleware.ts'

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

    // Initialize the application with auto-discovery via Vite glob import
    // This MUST be a literal string for Vite to transform it correctly
    // @ts-ignore: Vite glob import is not recognized by Deno
    const modules = import.meta.glob('./controller/*.{ts,tsx}', { eager: true })
    const controllers: ControllerClass[] = []

    for (const path in modules) {
        const mod = modules[path] as Record<string, unknown>
        for (const key in mod) {
            const Exported = mod[key]
            if (
                typeof Exported === 'function' &&
                (Exported as unknown as Record<string, unknown>)._basePath !==
                    undefined
            ) {
                controllers.push(Exported as ControllerClass)
            }
        }
    }
    console.log(`🔌 Loaded ${controllers.length} controllers`)

    await app.init({
        controllers,
        staticDir: 'static',

        // Global middlewares (applied to all routes)
        globalMiddlewares: [
            sessionMiddleware(), // Session middleware
            LoggerMiddleware,
        ],

        // Named middlewares (use with @Use('auth'))
        middlewares: {
            auth: AuthMiddleware,
        },
    })

    return app
}
