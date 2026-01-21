import { Context, Controller, Get, Inject, LlmLoader } from '@lockness/core'
import { LlmSectionService } from '@service/llm_section_service.ts'

@Controller('/')
export class LlmsIndexController {
    @Inject(LlmSectionService)
    accessor llmSectionService!: LlmSectionService

    @Get('/llms.txt', { name: 'llms.index' })
    async index(c: Context) {
        const text = await this.llmSectionService.generateIndexText()
        return c.text(text)
    }
}

@Controller('/llms')
export class LlmController {
    @Inject(LlmLoader)
    accessor loader!: LlmLoader

    /**
     * Dynamic route handler for all LLM documentation files
     *
     * Automatically loads documentation from:
     * - packages/{pkg}/llms.txt
     * - packages/{pkg}/llms/{sub}.txt
     * - docs/llms/{name}.txt
     *
     * Examples:
     * - /llms/authentication.txt → packages/auth/llms.txt
     * - /llms/routing.txt → packages/core/llms/routing.txt
     * - /llms/lockness.txt → docs/llms/lockness.txt
     */
    @Get('/:name', { extension: '.txt', name: 'llms.txt' })
    async serve(c: Context) {
        const name = c.req.param('name')

        try {
            const text = await this.loader.load(name)
            return c.text(text)
        } catch (error) {
            console.error(`Failed to load LLM doc '${name}':`, error)
            return c.notFound()
        }
    }
}
