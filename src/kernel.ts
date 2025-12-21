import { App, type Module } from 'lockness'
import { TodoController } from '@controller/todo_controller.ts'

export const bootstrap = async () => {
    // Create Lockness application
    const app = new App()

    // Configure module
    const module: Module = {
        // deno-lint-ignore no-explicit-any
        controllers: [TodoController as any],
    }



    // Initialize the application with the module
    await app.init(module)

    return app
}
