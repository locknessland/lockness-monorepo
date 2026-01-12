import { Context, Controller, Get } from '@lockness/core'
import { Home } from '@view/pages/home.tsx'

@Controller('/')
export class AppController {
    @Get('/', { name: 'home' })
    index(c: Context) {
        return c.render(<Home />)
    }
}
