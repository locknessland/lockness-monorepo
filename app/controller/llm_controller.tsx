import { Context, Controller, Get, Inject } from '@lockness/core'
import { LlmSectionService } from '@service/llm_section_service.ts'

@Controller('/')
export class LlmsIndexController {
    @Inject(LlmSectionService)
    accessor llmSectionService!: LlmSectionService

    @Get('/llms.txt', { name: 'llms.index' })
    index(c: Context) {
        const text = this.llmSectionService.generateIndexText()
        return c.text(text)
    }
}

@Controller('/llms')
export class LlmController {
    @Get('/lockness.txt')
    async lockness(c: Context) {
        const text = await Deno.readTextFile('public/llms/lockness.txt')
        return c.text(text)
    }

    @Get('/installation.txt')
    async installation(c: Context) {
        const text = await Deno.readTextFile('public/llms/installation.txt')
        return c.text(text)
    }

    @Get('/getting-started.txt')
    async gettingStarted(c: Context) {
        const text = await Deno.readTextFile('public/llms/getting-started.txt')
        return c.text(text)
    }

    @Get('/routing.txt')
    async routing(c: Context) {
        const text = await Deno.readTextFile('public/llms/routing.txt')
        return c.text(text)
    }

    @Get('/models.txt')
    async models(c: Context) {
        const text = await Deno.readTextFile('public/llms/models.txt')
        return c.text(text)
    }

    @Get('/validation.txt')
    async validation(c: Context) {
        const text = await Deno.readTextFile('public/llms/validation.txt')
        return c.text(text)
    }

    @Get('/authentication.txt')
    async authentication(c: Context) {
        const text = await Deno.readTextFile('public/llms/authentication.txt')
        return c.text(text)
    }

    @Get('/middleware.txt')
    async middleware(c: Context) {
        const text = await Deno.readTextFile('public/llms/middleware.txt')
        return c.text(text)
    }

    @Get('/sessions.txt')
    async sessions(c: Context) {
        const text = await Deno.readTextFile('public/llms/sessions.txt')
        return c.text(text)
    }

    @Get('/dependency-injection.txt')
    async dependencyInjection(c: Context) {
        const text = await Deno.readTextFile(
            'public/llms/dependency-injection.txt',
        )
        return c.text(text)
    }

    @Get('/cli.txt')
    async cli(c: Context) {
        const text = await Deno.readTextFile('public/llms/cli.txt')
        return c.text(text)
    }

    @Get('/nessy.txt')
    async nessy(c: Context) {
        const text = await Deno.readTextFile('public/llms/nessy.txt')
        return c.text(text)
    }

    @Get('/components.txt')
    async components(c: Context) {
        const text = await Deno.readTextFile('public/llms/components.txt')
        return c.text(text)
    }

    @Get('/devtools.txt')
    async devtools(c: Context) {
        const text = await Deno.readTextFile('public/llms/devtools.txt')
        return c.text(text)
    }

    @Get('/deprecation.txt')
    async deprecation(c: Context) {
        const text = await Deno.readTextFile('public/llms/deprecation.txt')
        return c.text(text)
    }

    @Get('/packages.txt')
    async packages(c: Context) {
        const text = await Deno.readTextFile('public/llms/packages.txt')
        return c.text(text)
    }

    @Get('/ui.txt')
    async ui(c: Context) {
        const text = await Deno.readTextFile('public/llms/ui.txt')
        return c.text(text)
    }

    @Get('/architecture.txt')
    async architecture(c: Context) {
        const text = await Deno.readTextFile('public/llms/architecture.txt')
        return c.text(text)
    }

    @Get('/testing.txt')
    async testing(c: Context) {
        const text = await Deno.readTextFile('public/llms/testing.txt')
        return c.text(text)
    }

    @Get('/deployment.txt')
    async deployment(c: Context) {
        const text = await Deno.readTextFile('public/llms/deployment.txt')
        return c.text(text)
    }

    @Get('/error-handling.txt')
    async errorHandling(c: Context) {
        const text = await Deno.readTextFile('public/llms/error-handling.txt')
        return c.text(text)
    }

    @Get('/contribution.txt')
    async contribution(c: Context) {
        const text = await Deno.readTextFile('public/llms/contribution.txt')
        return c.text(text)
    }
}
