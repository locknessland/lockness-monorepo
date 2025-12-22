import { App } from 'lockness'

export const bootstrap = async () => {
    // Create Lockness application
    const app = new App()

    // Initialize the application with auto-discovery
    await app.init({
        controllersDir: './src/controller',
        staticDir: 'public'
    })

    return app
}
