import { Context, Controller, Get } from '@lockness/core'

@Controller('/llms')
export class LlmController {
    @Get('/')
    index(c: Context) {
        const sections = [
            {
                name: 'lockness',
                description: 'Complete Lockness framework documentation',
            },
            {
                name: 'installation',
                description: 'Installation and setup guide',
            },
            {
                name: 'getting-started',
                description: 'First steps with Lockness',
            },
            {
                name: 'routing',
                description: 'Controllers, decorators, and routing',
            },
            { name: 'models', description: 'Database models with Drizzle ORM' },
            { name: 'validation', description: 'Request validation with Zod' },
            {
                name: 'authentication',
                description: 'Session-based authentication system',
            },
            { name: 'middleware', description: 'Class-based middleware' },
            {
                name: 'sessions',
                description: 'Multi-driver session management',
            },
            {
                name: 'dependency-injection',
                description: 'Dependency injection container',
            },
            { name: 'cli', description: 'CLI command reference' },
            { name: 'nessy', description: 'Nessy CLI wrapper' },
            { name: 'components', description: 'JSX components for views' },
            {
                name: 'devtools',
                description: 'Development tools and debugging',
            },
            {
                name: 'deprecation',
                description: 'Deprecation system and warnings',
            },
            { name: 'packages', description: 'Official Lockness packages' },
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
            ...sections.map((s) => `- /llms/${s.name}.txt - ${s.description}`),
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
}
