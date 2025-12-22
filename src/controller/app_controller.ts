import { Controller, Get, Context, Inject } from 'lockness'

@Controller('/app')
export class AppController {
    @Get('/')
    index(c: Context) {
        return c.json({ message: 'Hello from AppController' })
    }
}
