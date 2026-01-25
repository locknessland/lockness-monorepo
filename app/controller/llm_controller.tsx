import { Context, Controller, Get, Inject } from '@lockness/core'
import { LlmSectionService } from '@service/llm_section_service.ts'

/**
 * Root LLM index controller
 *
 * Serves the main /llms.txt endpoint that aggregates links to all
 * documentation across /docs/llms/*.txt and /ui/llms/*.txt
 */
@Controller('/')
export class LlmController {
    @Inject(LlmSectionService)
    accessor llmSectionService!: LlmSectionService

    /**
     * Main LLM index - aggregates all documentation links
     *
     * @example GET /llms.txt
     */
    @Get('/llms.txt', { name: 'llms.index' })
    async index(c: Context) {
        const text = await this.llmSectionService.generateIndexText()
        return c.text(text)
    }
}
