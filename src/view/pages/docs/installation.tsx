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

export const InstallationPage = () => {
    return (
        <DocsLayout title='Installation' currentPath='/docs/installation'>
            <div class='prose prose-invert max-w-none'>
                <h1 class='font-pixel text-xl text-primary mb-8 crt-glow'>Installation</h1>

                <div class='pixel-card p-6 mb-8 bg-primary/10 border-primary'>
                    <p class='text-lg mb-0'>
                        Lockness JS requires <strong class='text-primary'>Deno 2.0+</strong>. Make sure you have it installed before proceeding.
                    </p>
                </div>

                <h2 class='font-pixel text-base text-foreground mt-12 mb-6'>📦 Quick Start</h2>
                <p class='text-lg leading-relaxed mb-4'>
                    The fastest way to create a new Lockness project is using the official init command:
                </p>

                <CodeBlock lang='terminal'>
{`deno run -Ar jsr:@lockness/init`}
                </CodeBlock>

                <p class='text-lg leading-relaxed mb-4'>
                    This command will:
                </p>
                <ul class='space-y-2 mb-8 text-lg'>
                    <li class='flex items-start gap-3'>
                        <span class='text-primary mt-1'>▸</span>
                        <span>Scaffold a complete project structure</span>
                    </li>
                    <li class='flex items-start gap-3'>
                        <span class='text-primary mt-1'>▸</span>
                        <span>Install all dependencies</span>
                    </li>
                    <li class='flex items-start gap-3'>
                        <span class='text-primary mt-1'>▸</span>
                        <span>Set up database configuration (PostgreSQL + Drizzle ORM)</span>
                    </li>
                    <li class='flex items-start gap-3'>
                        <span class='text-primary mt-1'>▸</span>
                        <span>Configure Vite for HMR and SSR builds</span>
                    </li>
                </ul>

                <h2 class='font-pixel text-base text-foreground mt-12 mb-6'>🚀 Start Development Server</h2>
                <p class='text-lg leading-relaxed mb-4'>
                    Once the project is created, navigate to the directory and start the development server:
                </p>

                <CodeBlock lang='terminal'>
{`cd my-lockness-app
deno task dev`}
                </CodeBlock>

                <p class='text-lg leading-relaxed mb-8'>
                    Your app will be available at <code class='px-2 py-1 bg-primary/20 text-primary border-2 border-primary/50 font-pixel-body text-sm'>http://localhost:5173</code>
                </p>

                <h2 class='font-pixel text-base text-foreground mt-12 mb-6'>🔧 Available Commands</h2>
                
                <div class='space-y-4'>
                    <div class='pixel-card p-4 hover:border-primary transition-colors'>
                        <code class='text-primary font-pixel-body'>deno task dev</code>
                        <p class='mt-2 text-muted-foreground'>Start development server with hot-reload</p>
                    </div>

                    <div class='pixel-card p-4 hover:border-primary transition-colors'>
                        <code class='text-primary font-pixel-body'>deno task build</code>
                        <p class='mt-2 text-muted-foreground'>Build optimized production bundle</p>
                    </div>

                    <div class='pixel-card p-4 hover:border-primary transition-colors'>
                        <code class='text-primary font-pixel-body'>deno task start</code>
                        <p class='mt-2 text-muted-foreground'>Run production server</p>
                    </div>

                    <div class='pixel-card p-4 hover:border-primary transition-colors'>
                        <code class='text-primary font-pixel-body'>deno task test</code>
                        <p class='mt-2 text-muted-foreground'>Run test suite</p>
                    </div>

                    <div class='pixel-card p-4 hover:border-primary transition-colors'>
                        <code class='text-primary font-pixel-body'>deno task ace</code>
                        <p class='mt-2 text-muted-foreground'>Run ACE CLI commands</p>
                    </div>
                </div>

                <h2 class='font-pixel text-base text-foreground mt-12 mb-6'>📁 Project Structure</h2>
                <p class='text-lg leading-relaxed mb-4'>
                    After initialization, your project will have the following structure:
                </p>

                <CodeBlock lang='plaintext'>
{`my-lockness-app/
├── src/
│   ├── controller/       # HTTP Controllers
│   ├── model/           # Database Models
│   ├── repository/      # Data Access Layer
│   ├── service/         # Business Logic
│   ├── middleware/      # Custom Middlewares
│   ├── command/         # CLI Commands
│   ├── view/            # JSX Views & Layouts
│   └── kernel.ts        # App Configuration
├── migrations/          # Database Migrations
├── static/             # Static Assets
├── main.ts             # Server Entry Point
├── ace.ts              # CLI Entry Point
├── deno.json           # Deno Configuration
└── vite.config.ts      # Vite Configuration`}
                </CodeBlock>

                <div class='pixel-card p-6 mt-12 bg-card/50'>
                    <h3 class='font-pixel text-sm text-primary mb-4'>Next Steps</h3>
                    <p class='mb-4'>Now that you have Lockness installed, you can:</p>
                    <div class='space-y-2'>
                        <a href='/docs/getting-started' class='block px-4 py-2 border-2 border-primary bg-primary/10 text-primary hover:bg-primary/20 transition-all'>
                            → Read the Getting Started Guide
                        </a>
                        <a href='/docs/routing' class='block px-4 py-2 border-2 border-border hover:border-primary hover:text-primary transition-all'>
                            → Learn about Routing & Controllers
                        </a>
                        <a href='/docs/models' class='block px-4 py-2 border-2 border-border hover:border-primary hover:text-primary transition-all'>
                            → Explore Models & Database
                        </a>
                    </div>
                </div>
            </div>
        </DocsLayout>
    )
}
