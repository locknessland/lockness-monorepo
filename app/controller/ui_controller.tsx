import { Context, Controller, Get } from '@lockness/core'
import { UiIndex } from '@view/pages/ui/index.tsx'

@Controller('/ui')
export class UiController {
    @Get('/', { name: 'ui.index' })
    index(c: Context) {
        return c.render(<UiIndex />)
    }
}
