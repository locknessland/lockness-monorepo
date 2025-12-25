import { Controller, Get, Context } from 'lockness'

@Controller('/llms')
export class LlmController {
    @Get('/')
    async index(c: Context) {
        const sections = [
            { name: 'lockness', description: 'Complete Lockness framework documentation' },
            { name: 'routing', description: 'Controllers, decorators, and routing' },
            { name: 'models', description: 'Database models with Drizzle ORM' },
            { name: 'validation', description: 'Request validation with Zod' },
            { name: 'authentication', description: 'Session-based authentication system' },
            { name: 'middleware', description: 'Class-based middleware' },
            { name: 'sessions', description: 'Multi-driver session management' },
            { name: 'cli', description: 'CLI command reference' },
        ]

        const text = [
            'Lockness Framework - LLM Documentation',
            '=====================================',
            '',
            'Main endpoint:',
            '- /llms/lockness.txt - Full comprehensive documentation',
            '',
            'Available sections:',
            '',
            ...sections.map(s => `- /llms/${s.name}.txt - ${s.description}`),
            '',
            'Usage: Fetch any endpoint to get plain text documentation optimized for LLM consumption.',
        ].join('\n')

        return c.text(text)
    }

    @Get('/lockness.txt')
    async lockness(c: Context) {
        const text = await Deno.readTextFile('public/llms/full.txt')
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

    @Get('/cli.txt')
    async cli(c: Context) {
        const text = await Deno.readTextFile('public/llms/cli.txt')
        return c.text(text)
    }
}



