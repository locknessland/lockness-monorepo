import { Controller, Get, Context, Inject } from 'lockness'

@Controller('/tutu')
export class TutuController {
    @Get('/')
    index(c: Context) {
        return c.json({ message: 'Hello from TutuController' })
    }
}
