import { LocknessApplication } from '@lockness/core'
import { TodoController } from './Controller/TodoController.ts'

export const bootstrap = async () => {
    const application = new LocknessApplication()
    await application.init({
        controllers: [TodoController],
    })
    return application
}
