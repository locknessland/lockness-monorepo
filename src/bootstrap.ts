import { App } from '@lockness/core'
import { TodoController } from './Controller/TodoController.ts'

export const bootstrap = async () => {
    const app = new App()
    await app.init({
        controllers: [TodoController],
    })
    return app
}
