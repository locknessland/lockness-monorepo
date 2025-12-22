import { Controller, Get, Context } from 'lockness'
import { TestView } from '../view/pages/testview.tsx'

@Controller('/test')
export class TestController {
    @Get('/')
    index(c: Context) {
        return c.render(<TestView />)
    }
}

