import { App, container, type ControllerClass } from 'lockness'
import { Database } from '@lockness/kysely'

export const bootstrap = async () => {
    // Initialize Database (Optional)
    const db = container.get<Database>(Database)
    await db.connect(
        Deno.env.get('DATABASE_URL') || 'postgres://localhost:5432/lockness',
    )

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
                (Exported as Record<string, unknown>)._basePath !== undefined
            ) {
                controllers.push(Exported as ControllerClass)
            }
        }
    }
    console.log(`🔌 Loaded ${controllers.length} controllers`)

    await app.init({
        controllers,
        staticDir: Deno.env.get('VITE') ? 'public' : 'dist/static',
    })

    return app
}
