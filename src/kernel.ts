import { App, container } from 'lockness'
import { Database } from '@lockness/kysely'

export const bootstrap = async () => {
    // Initialize Database (Optional)
    const db = container.get<Database>(Database)
    await db.connect(
        Deno.env.get('DATABASE_URL') || 'postgres://localhost:5432/lockness',
    )

    // Create Lockness application
    const app = new App()

    // Initialize the application with auto-discovery
    await app.init({
        controllersDir: './src/controller',
        staticDir: 'public',
    })

    return app
}
