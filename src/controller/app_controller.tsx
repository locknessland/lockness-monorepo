import { Context, Controller, Get } from 'lockness'
import { HomeView } from '../view/pages/home.tsx'

@Controller('/')
export class AppController {
    @Get('/')
    index(c: Context) {
        return c.render(<HomeView />)
    }
}
