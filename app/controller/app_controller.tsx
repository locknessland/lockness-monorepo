import { Cache, Context, Controller, Get } from '@lockness/core'
import { Home } from '@view/pages/home.tsx'

@Controller('/')
export class AppController {
    @Cache({ key: 'home', strategy: 'http', ttl: 1800 })
    @Get('/', { name: 'home' })
    index(c: Context) {
        return c.render(<Home />)
    }
}
