import { App } from '../lockness/core/_index-core.ts'
import { TodoController } from './Controller/todo_controller.ts'

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
