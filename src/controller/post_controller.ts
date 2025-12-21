import { Controller, Get, Context } from 'lockness'

@Controller('/post')
export class PostController {
    @Get('/')
    index(c: Context) {
        return c.json({ message: 'Hello from PostController' })
    }
}
