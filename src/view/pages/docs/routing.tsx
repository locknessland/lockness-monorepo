import { DocsLayout } from '@view/layouts/docs_layout.tsx'
import { CodeBlock } from '@view/components/code_block.tsx'

export const RoutingPage = () => (
    <DocsLayout title='Routing & Controllers' currentPath='/docs/routing'>
        <div class='prose prose-invert max-w-none'>
            <h1 class='font-pixel text-xl text-primary mb-8 crt-glow'>Routing & Controllers</h1>
            
            <h2 class='font-pixel text-base text-foreground mt-12 mb-6'>Controllers with Decorators</h2>
            <p class='text-lg leading-relaxed mb-4'>
                Lockness uses class-based controllers with decorators for clean, expressive routing:
            </p>

            <CodeBlock>
{`import { Controller, Get, Post, Put, Delete, Context } from 'lockness'

@Controller('/api/users')
export class UserController {
    @Get('/')
    async index(c: Context) {
        return c.json({ users: [] })
    }

    @Get('/:id')
    async show(c: Context) {
        const id = c.req.param('id')
        return c.json({ id })
    }

    @Post('/')
    async store(c: Context) {
        const body = await c.req.json()
        return c.json(body, 201)
    }

    @Put('/:id')
    async update(c: Context) {
        return c.json({ updated: true })
    }

    @Delete('/:id')
    async destroy(c: Context) {
        return c.json({ deleted: true })
    }
}`}</CodeBlock>

            <h2 class='font-pixel text-base text-foreground mt-12 mb-6'>Available HTTP Methods</h2>
            <div class='grid grid-cols-2 gap-4 mb-8'>
                {['@Get', '@Post', '@Put', '@Delete', '@Patch', '@Options', '@Head'].map(method => (
                    <div class='pixel-card p-3'><code class='text-primary font-pixel-body'>{method}</code></div>
                ))}
            </div>

            <h2 class='font-pixel text-base text-foreground mt-12 mb-6'>Dependency Injection</h2>
            <p class='text-lg leading-relaxed mb-4'>Controllers support automatic dependency injection:</p>

            <CodeBlock>
{`@Controller('/api/posts')
export class PostController {
    constructor(
        private postService: PostService,
        private postRepository: PostRepository
    ) {}

    @Get('/')
    async index(c: Context) {
        const posts = await this.postRepository.findAll()
        return c.json({ posts })
    }
}`}</CodeBlock>

            <div class='pixel-card p-6 mt-8 bg-primary/10 border-primary'>
                <p class='mb-0'><strong>Pro Tip:</strong> Use <code class='px-2 py-1 bg-primary/30'>deno task ace make:controller Name</code> to generate boilerplate</p>
            </div>
        </div>
    </DocsLayout>
)
