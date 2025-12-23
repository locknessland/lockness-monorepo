import { DocsLayout } from '@view/layouts/docs_layout.tsx'
import {
    CodeBlock,
    CommandBlock,
    InlineCode,
} from '@view/components/code_block.tsx'
import { PageTitle } from '@view/components/page_title.tsx'

export const RoutingPage = () => {
    return (
        <DocsLayout title='Routing & Controllers' currentPath='/docs/routing'>
            <div class='prose prose-invert max-w-none'>
                <PageTitle>Routing & Controllers</PageTitle>

                <h2 class='font-pixel text-base text-foreground mt-12 mb-6'>
                    Controllers with Decorators
                </h2>
                <p class='text-lg leading-relaxed mb-4'>
                    Lockness uses class-based controllers with decorators for clean,
                    expressive routing:
                </p>

                <CodeBlock lang='typescript'>
                {`
    import { Controller, Get, Post, Put, Delete, Context } from 'lockness'

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
        }
        `}
                </CodeBlock>

                <h2 class='font-pixel text-base text-foreground mt-12 mb-6'>
                    Available HTTP Methods
                </h2>
                <div class='grid grid-cols-2 gap-4 mb-8'>
                    {[
                        '@Get',
                        '@Post',
                        '@Put',
                        '@Delete',
                        '@Patch',
                        '@Options',
                        '@Head',
                    ].map((method) => (
                        <div class='pixel-card p-3'>
                            <code class='text-primary font-pixel-body'>
                                {method}
                            </code>
                        </div>
                    ))}
                </div>

                <h2 class='font-pixel text-base text-foreground mt-12 mb-6'>
                    Dependency Injection
                </h2>
                <p class='text-lg leading-relaxed mb-4'>
                    Controllers support automatic dependency injection:
                </p>

                <CodeBlock>
                {`
    @Controller('/api/posts')
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
    }
        
`}
                </CodeBlock>

                <div class='pixel-card p-6 mt-8 bg-primary/10 border-primary'>
                    <p class='mb-0'>
                        <strong>Pro Tip:</strong> Use{' '}
                        <InlineCode>deno task ace make:controller Name</InlineCode>
                        {' '}
                        to generate boilerplate
                    </p>
                </div>

                <h2 class='font-pixel text-base text-foreground mt-12 mb-6'>
                    Display All Routes
                </h2>
                <p class='text-lg leading-relaxed mb-4'>
                    Use the <InlineCode>router:list</InlineCode> command to see
                    all registered routes in your application:
                </p>

                <CommandBlock lang='terminal'>
                    {`deno task ace router:list`}
                </CommandBlock>

                <p class='text-lg leading-relaxed mb-4 mt-6'>
                    This displays a formatted table with:
                </p>

                <ul class='list-disc list-inside space-y-2 mb-6 text-lg'>
                    <li>
                        <strong>METHOD</strong>: HTTP method (color-coded by type)
                    </li>
                    <li>
                        <strong>PATH</strong>: Route path with parameters
                    </li>
                    <li>
                        <strong>CONTROLLER</strong>: Controller class name
                    </li>
                    <li>
                        <strong>ACTION</strong>: Method name
                    </li>
                    <li>
                        <strong>MIDDLEWARES</strong>: Applied middlewares
                        (decorators and named)
                    </li>
                </ul>

                <CodeBlock lang='bash'>
                    {`📋 Registered Routes (11 total)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┃ METHOD ┃ PATH           ┃ CONTROLLER     ┃ ACTION ┃ MIDDLEWARES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┃ GET    ┃ /              ┃ AppController  ┃ index  ┃ -
┃ POST   ┃ /api/users     ┃ UserController ┃ create ┃ @Auth, @Validate
┃ GET    ┃ /api/users/:id ┃ UserController ┃ show   ┃ auth
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`}
                </CodeBlock>

                <div class='pixel-card p-6 mt-8 bg-primary/10 border-primary'>
                    <p class='mb-0'>
                        <strong>💡 Tip:</strong> HTTP methods are color-coded
                        in the terminal (GET=green, POST=yellow, PUT=blue,
                        DELETE=red) for easy visual scanning.
                    </p>
                </div>
            </div>
        </DocsLayout>
    )
}
