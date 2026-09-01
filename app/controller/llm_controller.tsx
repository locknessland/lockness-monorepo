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

    /**
     * Full LLM corpus - every framework and UI doc concatenated into one file.
     *
     * For AI tools that ingest a whole corpus at once rather than following the
     * per-page links in /llms.txt.
     *
     * @example GET /llms-full.txt
     */
    @Get('/llms-full.txt', { name: 'llms.full' })
    async full(c: Context) {
        const text = await this.llmSectionService.generateFullText()
        return c.text(text)
    }
}
