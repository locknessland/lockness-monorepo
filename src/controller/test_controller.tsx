import { Controller, Get, Context, Inject } from 'lockness'
import { TestView } from '../view/pages/testview.tsx'
import { UserService } from '../service/user_service.ts'

@Controller('/test')
export class TestController {
    @Inject(UserService)
    private userService!: UserService

    @Get('/')
    index(c: Context) {
        this.userService.execute()
        return c.render(<TestView />)
    }
}


