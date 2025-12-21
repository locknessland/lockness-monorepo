import { App } from 'lockness/core/index.ts'
import { TodoController } from '@controller/'

interface AppModule {
    controllers: any[]
}

export const bootstrap = async () => {
    // Create Lockness application
    const app = new App()

    // Configure module
    const module: AppModule = {
        controllers: [TodoController],
    }

    // Initialize the application with the module
    await app.init(module)

    return app
}
