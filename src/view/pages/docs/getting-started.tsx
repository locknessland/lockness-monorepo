import { DocsLayout } from '@view/layouts/docs_layout.tsx'

const CodeBlock = ({ children, lang = 'bash' }: { children: string; lang?: string }) => (
    <div class='my-6 pixel-code overflow-hidden'>
        <div class='flex items-center gap-2 px-4 py-2 bg-card/50 border-b-3 border-border'>
            <div class='flex gap-2'>
                <div class='w-3 h-3 bg-red-500/80'></div>
                <div class='w-3 h-3 bg-yellow-500/80'></div>
                <div class='w-3 h-3 bg-green-500/80'></div>
            </div>
            <span class='ml-2 text-sm text-primary font-pixel-body'>{lang}</span>
        </div>
        <pre class='p-4 overflow-x-auto'>
            <code class='text-foreground font-pixel-body text-sm leading-relaxed whitespace-pre'>{children}</code>
        </pre>
    </div>
)

export const GettingStartedPage = () => {
    return (
        <DocsLayout title='Getting Started' currentPath='/docs/getting-started'>
            <div class='prose prose-invert max-w-none'>
                <h1 class='font-pixel text-xl text-primary mb-8 crt-glow'>Getting Started</h1>

                <p class='text-lg leading-relaxed mb-8'>
                    This guide will walk you through creating your first Lockness application, from setup to deployment.
                </p>

                <h2 class='font-pixel text-base text-foreground mt-12 mb-6'>🎯 Your First Controller</h2>
                <p class='text-lg leading-relaxed mb-4'>
                    Let's create a simple API endpoint. Use the ACE CLI to scaffold a controller:
                </p>

                <CodeBlock lang='terminal'>
{`deno task ace make:controller Hello`}
                </CodeBlock>

                <p class='text-lg leading-relaxed mb-4'>
                    This creates <code class='px-2 py-1 bg-primary/20 text-primary'>src/controller/hello_controller.ts</code>. Edit it:
                </p>

                <CodeBlock lang='typescript'>
{`import { Controller, Get, Context } from 'lockness'

@Controller('/api/hello')
export class HelloController {
    @Get('/')
    index(c: Context) {
        return c.json({ 
            message: 'Hello from Lockness!',
            timestamp: new Date().toISOString()
        })
    }

    @Get('/:name')
    greet(c: Context) {
        const name = c.req.param('name')
        return c.json({ message: \`Hello, \${name}!\` })
    }
}`}
                </CodeBlock>

                <p class='text-lg leading-relaxed mb-8'>
                    Test it: <code class='px-2 py-1 bg-primary/20 text-primary'>http://localhost:5173/api/hello</code>
                </p>

                <h2 class='font-pixel text-base text-foreground mt-12 mb-6'>🗄️ Adding a Database Model</h2>
                <p class='text-lg leading-relaxed mb-4'>
                    Create a model with repository, controller, and seeder in one command:
                </p>

                <CodeBlock lang='terminal'>
{`deno task ace make:model Post -a`}
                </CodeBlock>

                <p class='text-lg leading-relaxed mb-4'>
                    The <code class='px-2 py-1 bg-primary/20 text-primary'>-a</code> flag generates:
                </p>
                <ul class='space-y-2 mb-8 text-lg'>
                    <li class='flex items-start gap-3'>
                        <span class='text-primary mt-1'>▸</span>
                        <span><code class='px-2 py-1 bg-primary/20 text-primary'>src/model/post.ts</code> - Drizzle schema + Zod validation</span>
                    </li>
                    <li class='flex items-start gap-3'>
                        <span class='text-primary mt-1'>▸</span>
                        <span><code class='px-2 py-1 bg-primary/20 text-primary'>src/repository/post_repository.ts</code> - Data access layer</span>
                    </li>
                    <li class='flex items-start gap-3'>
                        <span class='text-primary mt-1'>▸</span>
                        <span><code class='px-2 py-1 bg-primary/20 text-primary'>src/controller/post_controller.ts</code> - CRUD API</span>
                    </li>
                    <li class='flex items-start gap-3'>
                        <span class='text-primary mt-1'>▸</span>
                        <span><code class='px-2 py-1 bg-primary/20 text-primary'>src/seeder/post_seeder.ts</code> - Test data</span>
                    </li>
                </ul>

                <h2 class='font-pixel text-base text-foreground mt-12 mb-6'>🚀 Database Workflow</h2>
                
                <CodeBlock lang='terminal'>
{`# Generate migration from your model
deno task ace db:generate

# Run migrations
deno task ace db:migrate

# Seed database with test data
deno task ace db:seed`}
                </CodeBlock>

                <h2 class='font-pixel text-base text-foreground mt-12 mb-6'>✅ Testing Your API</h2>
                <p class='text-lg leading-relaxed mb-4'>
                    Your PostController is now available at:
                </p>

                <div class='space-y-2 mb-8'>
                    <div class='pixel-card p-3 bg-card/30'>
                        <code class='text-primary font-pixel-body text-sm'>GET /api/posts</code>
                        <span class='text-muted-foreground ml-4'>List all posts</span>
                    </div>
                    <div class='pixel-card p-3 bg-card/30'>
                        <code class='text-primary font-pixel-body text-sm'>GET /api/posts/:id</code>
                        <span class='text-muted-foreground ml-4'>Get single post</span>
                    </div>
                    <div class='pixel-card p-3 bg-card/30'>
                        <code class='text-primary font-pixel-body text-sm'>POST /api/posts</code>
                        <span class='text-muted-foreground ml-4'>Create post</span>
                    </div>
                    <div class='pixel-card p-3 bg-card/30'>
                        <code class='text-primary font-pixel-body text-sm'>PUT /api/posts/:id</code>
                        <span class='text-muted-foreground ml-4'>Update post</span>
                    </div>
                    <div class='pixel-card p-3 bg-card/30'>
                        <code class='text-primary font-pixel-body text-sm'>DELETE /api/posts/:id</code>
                        <span class='text-muted-foreground ml-4'>Delete post</span>
                    </div>
                </div>

                <div class='pixel-card p-6 mt-12 bg-card/50'>
                    <h3 class='font-pixel text-sm text-primary mb-4'>What's Next?</h3>
                    <div class='space-y-2'>
                        <a href='/docs/routing' class='block px-4 py-2 border-2 border-border hover:border-primary hover:text-primary transition-all'>
                            → Learn more about Routing & Controllers
                        </a>
                        <a href='/docs/models' class='block px-4 py-2 border-2 border-border hover:border-primary hover:text-primary transition-all'>
                            → Deep dive into Models & Database
                        </a>
                        <a href='/docs/validation' class='block px-4 py-2 border-2 border-border hover:border-primary hover:text-primary transition-all'>
                            → Add Request Validation
                        </a>
                    </div>
                </div>
            </div>
        </DocsLayout>
    )
}
