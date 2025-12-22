import { Controller, Get, Context } from 'lockness'

@Controller('/test')
export class TestController {
    @Get('/')
    index(c: Context) {
        return c.json({ message: 'Hello from TestController' })
    }
}
