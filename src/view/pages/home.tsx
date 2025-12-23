import { LandingLayout } from '../layouts/landing_layout.tsx'
import pkg from '../../../lockness/core/deno.json' with { type: 'json' }

// Icons as components
const CodeIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="16 18 22 12 16 6"></polyline>
        <polyline points="8 6 2 12 8 18"></polyline>
    </svg>
)

const TerminalIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="4 17 10 11 4 5"></polyline>
        <line x1="12" x2="20" y1="19" y2="19"></line>
    </svg>
)

const ZapIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"></path>
    </svg>
)

const ShieldIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"></path>
        <path d="m9 12 2 2 4-4"></path>
    </svg>
)

const DatabaseIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
        <path d="M3 5V19A9 3 0 0 0 21 19V5"></path>
        <path d="M3 12A9 3 0 0 0 21 12"></path>
    </svg>
)

const LayersIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"></path>
        <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"></path>
        <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"></path>
    </svg>
)

const BoxIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"></path>
        <path d="m3.3 7 8.7 5 8.7-5"></path>
        <path d="M12 22V12"></path>
    </svg>
)

const MailIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect width="20" height="16" x="2" y="4" rx="2"></rect>
        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>
    </svg>
)

const UsersIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
        <circle cx="9" cy="7" r="4"></circle>
        <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
    </svg>
)

const ClockIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <polyline points="12 6 12 12 16 14"></polyline>
    </svg>
)

const ArrowRightIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 12h14"></path>
        <path d="m12 5 7 7-7 7"></path>
    </svg>
)

const GithubIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"></path>
        <path d="M9 18c-4.51 2-5-2-7-2"></path>
    </svg>
)

const CheckIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 6 9 17l-5-5"></path>
    </svg>
)

const CopyIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect>
        <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>
    </svg>
)

// Feature Card Component
const FeatureCard = ({ icon, title, description, delay = 0 }: { icon: any; title: string; description: string; delay?: number }) => (
    <div 
        class="group relative p-6 rounded-xl border border-border bg-card/50 backdrop-blur-sm hover:bg-card hover:border-primary/30 transition-all duration-300 hover-lift card-tilt animate-slide-up"
        style={`animation-delay: ${delay}ms; animation-fill-mode: backwards;`}
    >
        <div class="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary mb-4 group-hover:bg-primary/20 group-hover:scale-110 transition-all duration-300">
            <span class="group-hover:animate-float">{icon}</span>
        </div>
        <h3 class="text-lg font-semibold text-foreground mb-2 group-hover:text-primary transition-colors">{title}</h3>
        <p class="text-sm text-muted-foreground leading-relaxed">{description}</p>
        <div class="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" style="box-shadow: 0 0 30px color-mix(in oklch, var(--primary) 15%, transparent);"></div>
    </div>
)

// Code Block Component
const CodeBlock = ({ filename, children }: { filename: string; children: any }) => (
    <div class="rounded-xl border border-border bg-card overflow-hidden hover-lift transition-all duration-300 hover:border-primary/30">
        <div class="flex items-center gap-2 px-4 py-3 bg-muted/50 border-b border-border">
            <div class="flex gap-1.5">
                <div class="w-3 h-3 rounded-full bg-red-500/60 hover:bg-red-500 transition-colors cursor-pointer"></div>
                <div class="w-3 h-3 rounded-full bg-yellow-500/60 hover:bg-yellow-500 transition-colors cursor-pointer"></div>
                <div class="w-3 h-3 rounded-full bg-green-500/60 hover:bg-green-500 transition-colors cursor-pointer"></div>
            </div>
            <span class="ml-2 text-xs text-muted-foreground font-mono">{filename}</span>
        </div>
        <pre class="p-4 overflow-x-auto text-sm">
            <code class="text-foreground font-mono leading-relaxed whitespace-pre-wrap break-words">{children}</code>
        </pre>
    </div>
)

// Syntax highlighting helper components - Monokai theme
const Keyword = ({ children }: { children: string }) => <span class="text-[#F92672]">{children}</span>
const String = ({ children }: { children: string }) => <span class="text-[#E6DB74]">{children}</span>
const Comment = ({ children }: { children: string }) => <span class="text-[#75715E] italic">{children}</span>
const Decorator = ({ children }: { children: string }) => <span class="text-[#A6E22E]">{children}</span>
const Func = ({ children }: { children: string }) => <span class="text-[#A6E22E]">{children}</span>
const Type = ({ children }: { children: string }) => <span class="text-[#66D9EF] italic">{children}</span>
const Variable = ({ children }: { children: string }) => <span class="text-[#FD971F]">{children}</span>
const Punctuation = ({ children }: { children: string }) => <span class="text-[#F8F8F2]">{children}</span>
const Symbol = ({ children }: { children: string }) => <span class="text-[#F92672]">{children}</span>
const Success = ({ children }: { children: string }) => <span class="text-[#A6E22E]">{children}</span>
const Prompt = ({ children }: { children: string }) => <span class="text-[#A6E22E] font-bold">{children}</span>

export const HomeView = () => {
    return (
        <LandingLayout title='Lockness JS - The Fullstack MVC Framework for Deno'>
            <div class='min-h-screen'>
                {/* Header */}
                <header class='fixed top-0 left-0 right-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-xl animate-fade-in'>
                    <div class='max-w-6xl mx-auto px-6 h-16 flex items-center justify-between'>
                        <div class='flex items-center gap-2 group cursor-pointer'>
                            <span class='text-xl font-bold text-foreground transition-transform group-hover:scale-105'>
                                Lockness<span class='text-primary'>JS</span>
                            </span>
                        </div>
                        
                        <nav class='hidden md:flex items-center gap-8'>
                            <a href='#features' class='text-sm text-muted-foreground hover:text-foreground transition-colors link-underline'>Features</a>
                            <a href='#getting-started' class='text-sm text-muted-foreground hover:text-foreground transition-colors link-underline'>Getting Started</a>
                            <a href='#examples' class='text-sm text-muted-foreground hover:text-foreground transition-colors link-underline'>Examples</a>
                            <a href='https://jsr.io/@lockness/core' class='text-sm text-muted-foreground hover:text-foreground transition-colors link-underline'>JSR</a>
                        </nav>

                        <div class='flex items-center gap-3'>
                            <a href='https://github.com/locknessjs/lockness' class='hidden md:inline-flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-all hover:scale-105'>
                                <GithubIcon />
                                <span>GitHub</span>
                            </a>
                            <a href='#getting-started' class='inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all btn-interactive hover:scale-105 hover:shadow-lg'>
                                Get Started
                            </a>
                        </div>
                    </div>
                </header>

                {/* Hero Section */}
                <section class='pt-32 pb-24 px-6 relative overflow-hidden'>
                    {/* Background Pattern */}
                    <div class='absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_110%)]'></div>
                    
                    {/* Animated glow orbs */}
                    <div class='absolute top-20 left-1/4 w-72 h-72 bg-primary/20 rounded-full blur-[120px] animate-pulse-glow'></div>
                    <div class='absolute bottom-20 right-1/4 w-96 h-96 bg-secondary/20 rounded-full blur-[150px] animate-pulse-glow' style='animation-delay: 1s;'></div>
                    
                    <div class='max-w-5xl mx-auto relative z-10'>
                        <div class='text-center space-y-8'>
                            {/* Badge */}
                            <div class='inline-flex items-center gap-2 px-4 py-2 rounded-full bg-card border border-border text-sm animate-slide-up hover:border-primary/50 hover:scale-105 transition-all cursor-default'>
                                <span class='relative flex h-2 w-2'>
                                    <span class='animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75'></span>
                                    <span class='relative inline-flex rounded-full h-2 w-2 bg-primary'></span>
                                </span>
                                <span class='text-muted-foreground'>v{pkg.version} now available on JSR</span>
                            </div>

                            {/* Title */}
                            <h1 class='text-4xl md:text-6xl lg:text-7xl font-bold leading-tight tracking-tight animate-slide-up' style='animation-delay: 100ms; animation-fill-mode: backwards;'>
                                Create and ship TypeScript fast with
                                <span class='text-primary gradient-text'> Deno</span>
                            </h1>

                            {/* Description */}
                            <p class='text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed animate-slide-up' style='animation-delay: 200ms; animation-fill-mode: backwards;'>
                                A high-performance, fullstack MVC web framework inspired by Laravel and AdonisJS. 
                                Built natively for Deno, powered by the speed of Hono.
                            </p>

                            {/* CTA Buttons */}
                            <div class='flex flex-col sm:flex-row items-center justify-center gap-4 pt-4 animate-slide-up' style='animation-delay: 300ms; animation-fill-mode: backwards;'>
                                <a href='#getting-started' class='inline-flex items-center gap-2 px-6 py-3 text-base font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all group btn-interactive hover:scale-105 hover:shadow-lg glow-primary'>
                                    Get Started
                                    <span class='group-hover:translate-x-1 transition-transform'><ArrowRightIcon /></span>
                                </a>
                                <a href='https://github.com/locknessjs/lockness' class='inline-flex items-center gap-2 px-6 py-3 text-base font-medium rounded-lg border border-border bg-card hover:bg-muted transition-all hover:scale-105 hover:border-primary/50'>
                                    <GithubIcon />
                                    View on GitHub
                                </a>
                            </div>

                            {/* Install Command */}
                            <div class='pt-4 animate-slide-up' style='animation-delay: 400ms; animation-fill-mode: backwards;'>
                                <div class='inline-flex items-center gap-3 px-5 py-3 rounded-lg bg-card border border-border font-mono text-sm hover:border-primary/50 transition-all group' id='install-command'>
                                    <span class='text-primary group-hover:animate-pulse'>$</span>
                                    <span class='text-foreground' id='install-text'>deno run -Ar jsr:@lockness/init</span>
                                    <button 
                                        type='button' 
                                        id='copy-btn'
                                        class='ml-2 p-1.5 rounded hover:bg-muted transition-all text-muted-foreground hover:text-foreground hover:scale-110 active:scale-95 cursor-pointer'
                                        title='Copy to clipboard'
                                    >
                                        <span id='copy-icon'><CopyIcon /></span>
                                        <span id='check-icon' class='hidden text-emerald-400'><CheckIcon /></span>
                                    </button>
                                </div>
                            </div>
                            
                            {/* Copy to clipboard script */}
                            <script dangerouslySetInnerHTML={{__html: `
                                document.getElementById('copy-btn').addEventListener('click', async function() {
                                    const text = document.getElementById('install-text').textContent;
                                    try {
                                        await navigator.clipboard.writeText(text);
                                        document.getElementById('copy-icon').classList.add('hidden');
                                        document.getElementById('check-icon').classList.remove('hidden');
                                        setTimeout(() => {
                                            document.getElementById('copy-icon').classList.remove('hidden');
                                            document.getElementById('check-icon').classList.add('hidden');
                                        }, 2000);
                                    } catch (err) {
                                        console.error('Failed to copy:', err);
                                    }
                                });
                            `}} />
                        </div>
                    </div>
                </section>

                {/* Stats Section */}
                <section class='py-12 px-6 border-y border-border bg-muted/30'>
                    <div class='max-w-5xl mx-auto'>
                        <div class='grid grid-cols-2 md:grid-cols-4 gap-8'>
                            <div class='text-center group cursor-default'>
                                <div class='text-3xl font-bold text-foreground group-hover:text-primary transition-colors group-hover:scale-110 inline-block'>MVC</div>
                                <div class='text-sm text-muted-foreground mt-1'>Architecture</div>
                            </div>
                            <div class='text-center group cursor-default'>
                                <div class='text-3xl font-bold text-foreground group-hover:text-primary transition-colors group-hover:scale-110 inline-block'>TypeScript</div>
                                <div class='text-sm text-muted-foreground mt-1'>First Class</div>
                            </div>
                            <div class='text-center group cursor-default'>
                                <div class='text-3xl font-bold text-foreground group-hover:text-primary transition-colors group-hover:scale-110 inline-block'>Deno 2.0</div>
                                <div class='text-sm text-muted-foreground mt-1'>Native Support</div>
                            </div>
                            <div class='text-center group cursor-default'>
                                <div class='text-3xl font-bold text-foreground group-hover:text-primary transition-colors group-hover:scale-110 inline-block'>Hono</div>
                                <div class='text-sm text-muted-foreground mt-1'>Powered</div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Features Section */}
                <section id='features' class='py-24 px-6'>
                    <div class='max-w-5xl mx-auto'>
                        <div class='text-center mb-16'>
                            <h2 class='text-3xl md:text-4xl font-bold text-foreground mb-4'>Everything you need to build modern apps</h2>
                            <p class='text-lg text-muted-foreground max-w-2xl mx-auto'>
                                Lockness provides a complete toolkit with batteries included for rapid development
                            </p>
                        </div>

                        <div class='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
                            <FeatureCard 
                                icon={<LayersIcon />}
                                title='MVC Architecture'
                                description='Clear separation of concerns with Models, Views, and Controllers. Inspired by Laravel and AdonisJS.'
                                delay={0}
                            />
                            <FeatureCard 
                                icon={<BoxIcon />}
                                title='Dependency Injection'
                                description='Built-in IoC container for clean, testable code. Just use the @Inject decorator.'
                                delay={100}
                            />
                            <FeatureCard 
                                icon={<ZapIcon />}
                                title='Blazing Fast'
                                description='Built on Hono, one of the fastest web frameworks. Sub-millisecond response times.'
                                delay={200}
                            />
                            <FeatureCard 
                                icon={<ShieldIcon />}
                                title='Secure by Default'
                                description="Leverage Deno's security model with explicit permissions. Session, Auth, and CSRF protection built-in."
                                delay={300}
                            />
                            <FeatureCard 
                                icon={<DatabaseIcon />}
                                title='Drizzle ORM'
                                description='Type-safe database operations with migrations, seeders, and Drizzle Studio integration.'
                                delay={400}
                            />
                            <FeatureCard 
                                icon={<TerminalIcon />}
                                title='Powerful CLI (Ace)'
                                description='Scaffold controllers, models, middleware, jobs and more with the Ace CLI engine.'
                                delay={500}
                            />
                            <FeatureCard 
                                icon={<UsersIcon />}
                                title='Authentication'
                                description='Complete auth system with sessions, password hashing, and social OAuth providers.'
                                delay={600}
                            />
                            <FeatureCard 
                                icon={<MailIcon />}
                                title='Mail System'
                                description='Expressive fluent API for sending emails. Supports SMTP, Resend, and more drivers.'
                                delay={700}
                            />
                            <FeatureCard 
                                icon={<ClockIcon />}
                                title='Background Jobs'
                                description='Queue and process long-running tasks in the background with memory or Deno KV drivers.'
                                delay={800}
                            />
                        </div>
                    </div>
                </section>

                {/* Getting Started Section */}
                <section id='getting-started' class='py-24 px-6 bg-muted/20'>
                    <div class='max-w-5xl mx-auto'>
                        <div class='text-center mb-16'>
                            <h2 class='text-3xl md:text-4xl font-bold text-foreground mb-4'>Get started in seconds</h2>
                            <p class='text-lg text-muted-foreground max-w-2xl mx-auto'>
                                Initialize your project and start building immediately
                            </p>
                        </div>

                        <div class='grid grid-cols-1 lg:grid-cols-2 gap-8'>
                            {/* Terminal Preview */}
                            <div class='space-y-4'>
                                <CodeBlock filename='terminal'>
                                    <Prompt>$</Prompt> deno run -Ar jsr:@lockness/init{'\n'}
                                    <Success>✨</Success> Creating new Lockness project...{'\n'}
                                    {'\n'}
                                    <Prompt>$</Prompt> deno task ace make:controller User{'\n'}
                                    <Success>✅</Success> Controller created at <String>./src/controller/user_controller.ts</String>{'\n'}
                                    {'\n'}
                                    <Prompt>$</Prompt> deno task ace make:model Post -a{'\n'}
                                    <Success>✅</Success> Model created at <String>./src/model/post.ts</String>{'\n'}
                                    <Success>✅</Success> Repository created at <String>./src/repository/post_repository.ts</String>{'\n'}
                                    <Success>✅</Success> Seeder created at <String>./src/seeder/post_seeder.ts</String>{'\n'}
                                    <Success>✅</Success> Controller created at <String>./src/controller/post_controller.ts</String>{'\n'}
                                    {'\n'}
                                    <Prompt>$</Prompt> deno task dev{'\n'}
                                    <Success>🚀</Success> Server is flying at <Type>http://localhost:8888</Type>
                                </CodeBlock>
                            </div>

                            {/* Commands List */}
                            <div class='space-y-4'>
                                <div class='p-4 rounded-lg border border-border bg-card hover-lift transition-all hover:border-primary/30 group'>
                                    <div class='flex items-center gap-3 mb-2'>
                                        <span class='text-primary group-hover:scale-110 transition-transform'><CheckIcon /></span>
                                        <span class='font-medium text-foreground'>Development</span>
                                    </div>
                                    <code class='text-sm text-muted-foreground font-mono'>deno task dev</code>
                                </div>
                                <div class='p-4 rounded-lg border border-border bg-card hover-lift transition-all hover:border-primary/30 group'>
                                    <div class='flex items-center gap-3 mb-2'>
                                        <span class='text-primary group-hover:scale-110 transition-transform'><CheckIcon /></span>
                                        <span class='font-medium text-foreground'>Production Build</span>
                                    </div>
                                    <code class='text-sm text-muted-foreground font-mono'>deno task build && deno task start</code>
                                </div>
                                <div class='p-4 rounded-lg border border-border bg-card hover-lift transition-all hover:border-primary/30 group'>
                                    <div class='flex items-center gap-3 mb-2'>
                                        <span class='text-primary group-hover:scale-110 transition-transform'><CheckIcon /></span>
                                        <span class='font-medium text-foreground'>Database Migrations</span>
                                    </div>
                                    <code class='text-sm text-muted-foreground font-mono'>deno task ace db:generate && deno task ace db:migrate</code>
                                </div>
                                <div class='p-4 rounded-lg border border-border bg-card hover-lift transition-all hover:border-primary/30 group'>
                                    <div class='flex items-center gap-3 mb-2'>
                                        <span class='text-primary group-hover:scale-110 transition-transform'><CheckIcon /></span>
                                        <span class='font-medium text-foreground'>Testing</span>
                                    </div>
                                    <code class='text-sm text-muted-foreground font-mono'>deno task test</code>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Code Examples Section */}
                <section id='examples' class='py-24 px-6'>
                    <div class='max-w-5xl mx-auto'>
                        <div class='text-center mb-16'>
                            <h2 class='text-3xl md:text-4xl font-bold text-foreground mb-4'>Clean, expressive code</h2>
                            <p class='text-lg text-muted-foreground max-w-2xl mx-auto'>
                                Write elegant code with decorators, dependency injection, and type-safe validation
                            </p>
                        </div>

                        <div class='grid grid-cols-1 lg:grid-cols-2 gap-6'>
                            {/* Controller Example */}
                            <CodeBlock filename='src/controller/user_controller.ts'>
                                <Keyword>import</Keyword> <Punctuation>{'{'}</Punctuation> <Type>Controller</Type><Punctuation>,</Punctuation> <Type>Get</Type><Punctuation>,</Punctuation> <Type>Post</Type><Punctuation>,</Punctuation> <Type>Validate</Type> <Punctuation>{'}'}</Punctuation> <Keyword>from</Keyword> <String>'lockness'</String>{'\n'}
                                <Keyword>import</Keyword> <Punctuation>{'{'}</Punctuation> <Type>UserService</Type> <Punctuation>{'}'}</Punctuation> <Keyword>from</Keyword> <String>'@service/user_service.ts'</String>{'\n'}
                                <Keyword>import</Keyword> <Punctuation>{'{'}</Punctuation> <Variable>insertUserSchema</Variable> <Punctuation>{'}'}</Punctuation> <Keyword>from</Keyword> <String>'@model/user.ts'</String>{'\n'}
                                {'\n'}
                                <Decorator>@Controller</Decorator><Punctuation>(</Punctuation><String>'/api/users'</String><Punctuation>)</Punctuation>{'\n'}
                                <Keyword>export class</Keyword> <Type>UserController</Type> <Punctuation>{'{'}</Punctuation>{'\n'}
                                {'    '}<Keyword>constructor</Keyword><Punctuation>(</Punctuation><Keyword>private</Keyword> <Variable>userService</Variable><Punctuation>:</Punctuation> <Type>UserService</Type><Punctuation>)</Punctuation> <Punctuation>{'{}'}</Punctuation>{'\n'}
                                {'\n'}
                                {'    '}<Decorator>@Get</Decorator><Punctuation>(</Punctuation><String>'/'</String><Punctuation>)</Punctuation>{'\n'}
                                {'    '}<Keyword>async</Keyword> <Func>index</Func><Punctuation>(</Punctuation><Variable>c</Variable><Punctuation>:</Punctuation> <Type>Context</Type><Punctuation>)</Punctuation> <Punctuation>{'{'}</Punctuation>{'\n'}
                                {'        '}<Keyword>const</Keyword> <Variable>users</Variable> <Symbol>=</Symbol> <Keyword>await</Keyword> <Keyword>this</Keyword>.<Variable>userService</Variable>.<Func>findAll</Func><Punctuation>()</Punctuation>{'\n'}
                                {'        '}<Keyword>return</Keyword> <Variable>c</Variable>.<Func>json</Func><Punctuation>(</Punctuation><Punctuation>{'{'}</Punctuation> <Variable>users</Variable> <Punctuation>{'}'}</Punctuation><Punctuation>)</Punctuation>{'\n'}
                                {'    '}<Punctuation>{'}'}</Punctuation>{'\n'}
                                {'\n'}
                                {'    '}<Decorator>@Post</Decorator><Punctuation>(</Punctuation><String>'/'</String><Punctuation>)</Punctuation>{'\n'}
                                {'    '}<Decorator>@Validate</Decorator><Punctuation>(</Punctuation><String>'json'</String><Punctuation>,</Punctuation> <Variable>insertUserSchema</Variable><Punctuation>)</Punctuation>{'\n'}
                                {'    '}<Keyword>async</Keyword> <Func>store</Func><Punctuation>(</Punctuation><Variable>c</Variable><Punctuation>:</Punctuation> <Type>Context</Type><Punctuation>)</Punctuation> <Punctuation>{'{'}</Punctuation>{'\n'}
                                {'        '}<Keyword>const</Keyword> <Variable>data</Variable> <Symbol>=</Symbol> <Variable>c</Variable>.<Variable>req</Variable>.<Func>valid</Func><Punctuation>(</Punctuation><String>'json'</String><Punctuation>)</Punctuation>{'\n'}
                                {'        '}<Keyword>const</Keyword> <Variable>user</Variable> <Symbol>=</Symbol> <Keyword>await</Keyword> <Keyword>this</Keyword>.<Variable>userService</Variable>.<Func>create</Func><Punctuation>(</Punctuation><Variable>data</Variable><Punctuation>)</Punctuation>{'\n'}
                                {'        '}<Keyword>return</Keyword> <Variable>c</Variable>.<Func>json</Func><Punctuation>(</Punctuation><Punctuation>{'{'}</Punctuation> <Variable>user</Variable> <Punctuation>{'}'}</Punctuation><Punctuation>,</Punctuation> <Type>201</Type><Punctuation>)</Punctuation>{'\n'}
                                {'    '}<Punctuation>{'}'}</Punctuation>{'\n'}
                                <Punctuation>{'}'}</Punctuation>
                            </CodeBlock>

                            {/* Auth Example */}
                            <CodeBlock filename='src/controller/auth_controller.ts'>
                                <Keyword>import</Keyword> <Punctuation>{'{'}</Punctuation> <Type>Controller</Type><Punctuation>,</Punctuation> <Type>Get</Type><Punctuation>,</Punctuation> <Type>Post</Type><Punctuation>,</Punctuation> <Type>Auth</Type><Punctuation>,</Punctuation> <Type>Guest</Type> <Punctuation>{'}'}</Punctuation> <Keyword>from</Keyword> <String>'lockness'</String>{'\n'}
                                <Keyword>import</Keyword> <Punctuation>{'{'}</Punctuation> <Func>auth</Func><Punctuation>,</Punctuation> <Func>session</Func> <Punctuation>{'}'}</Punctuation> <Keyword>from</Keyword> <String>'lockness'</String>{'\n'}
                                {'\n'}
                                <Decorator>@Controller</Decorator><Punctuation>(</Punctuation><String>'/auth'</String><Punctuation>)</Punctuation>{'\n'}
                                <Keyword>export class</Keyword> <Type>AuthController</Type> <Punctuation>{'{'}</Punctuation>{'\n'}
                                {'    '}<Decorator>@Guest</Decorator><Punctuation>(</Punctuation><String>'/dashboard'</String><Punctuation>)</Punctuation>{'\n'}
                                {'    '}<Decorator>@Get</Decorator><Punctuation>(</Punctuation><String>'/login'</String><Punctuation>)</Punctuation>{'\n'}
                                {'    '}<Func>showLogin</Func><Punctuation>(</Punctuation><Variable>c</Variable><Punctuation>:</Punctuation> <Type>Context</Type><Punctuation>)</Punctuation> <Punctuation>{'{'}</Punctuation>{'\n'}
                                {'        '}<Keyword>return</Keyword> <Variable>c</Variable>.<Func>render</Func><Punctuation>(</Punctuation><Symbol>{'<'}</Symbol><Type>LoginPage</Type> <Symbol>{'/>'}</Symbol><Punctuation>)</Punctuation>{'\n'}
                                {'    '}<Punctuation>{'}'}</Punctuation>{'\n'}
                                {'\n'}
                                {'    '}<Decorator>@Post</Decorator><Punctuation>(</Punctuation><String>'/login'</String><Punctuation>)</Punctuation>{'\n'}
                                {'    '}<Keyword>async</Keyword> <Func>login</Func><Punctuation>(</Punctuation><Variable>c</Variable><Punctuation>:</Punctuation> <Type>Context</Type><Punctuation>)</Punctuation> <Punctuation>{'{'}</Punctuation>{'\n'}
                                {'        '}<Keyword>const</Keyword> <Punctuation>{'{'}</Punctuation> <Variable>email</Variable><Punctuation>,</Punctuation> <Variable>password</Variable> <Punctuation>{'}'}</Punctuation> <Symbol>=</Symbol> <Keyword>await</Keyword> <Variable>c</Variable>.<Variable>req</Variable>.<Func>parseBody</Func><Punctuation>()</Punctuation>{'\n'}
                                {'\n'}
                                {'        '}<Keyword>if</Keyword> <Punctuation>(</Punctuation><Keyword>await</Keyword> <Func>auth</Func><Punctuation>(</Punctuation><Variable>c</Variable><Punctuation>)</Punctuation>.<Func>attempt</Func><Punctuation>(</Punctuation><Variable>email</Variable><Punctuation>,</Punctuation> <Variable>password</Variable><Punctuation>)</Punctuation><Punctuation>)</Punctuation> <Punctuation>{'{'}</Punctuation>{'\n'}
                                {'            '}<Keyword>return</Keyword> <Variable>c</Variable>.<Func>redirect</Func><Punctuation>(</Punctuation><String>'/dashboard'</String><Punctuation>)</Punctuation>{'\n'}
                                {'        '}<Punctuation>{'}'}</Punctuation>{'\n'}
                                {'\n'}
                                {'        '}<Func>session</Func><Punctuation>(</Punctuation><Variable>c</Variable><Punctuation>)</Punctuation>.<Func>flash</Func><Punctuation>(</Punctuation><String>'error'</String><Punctuation>,</Punctuation> <String>'Invalid credentials'</String><Punctuation>)</Punctuation>{'\n'}
                                {'        '}<Keyword>return</Keyword> <Variable>c</Variable>.<Func>redirect</Func><Punctuation>(</Punctuation><String>'/auth/login'</String><Punctuation>)</Punctuation>{'\n'}
                                {'    '}<Punctuation>{'}'}</Punctuation>{'\n'}
                                {'\n'}
                                {'    '}<Decorator>@Auth</Decorator><Punctuation>()</Punctuation>{'\n'}
                                {'    '}<Decorator>@Post</Decorator><Punctuation>(</Punctuation><String>'/logout'</String><Punctuation>)</Punctuation>{'\n'}
                                {'    '}<Keyword>async</Keyword> <Func>logout</Func><Punctuation>(</Punctuation><Variable>c</Variable><Punctuation>:</Punctuation> <Type>Context</Type><Punctuation>)</Punctuation> <Punctuation>{'{'}</Punctuation>{'\n'}
                                {'        '}<Keyword>await</Keyword> <Func>auth</Func><Punctuation>(</Punctuation><Variable>c</Variable><Punctuation>)</Punctuation>.<Func>logout</Func><Punctuation>()</Punctuation>{'\n'}
                                {'        '}<Keyword>return</Keyword> <Variable>c</Variable>.<Func>redirect</Func><Punctuation>(</Punctuation><String>'/auth/login'</String><Punctuation>)</Punctuation>{'\n'}
                                {'    '}<Punctuation>{'}'}</Punctuation>{'\n'}
                                <Punctuation>{'}'}</Punctuation>
                            </CodeBlock>
                        </div>
                    </div>
                </section>

                {/* CTA Section */}
                <section class='py-24 px-6 relative overflow-hidden'>
                    <div class='absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent'></div>
                    {/* Animated background elements */}
                    <div class='absolute top-1/2 left-1/4 w-64 h-64 bg-primary/10 rounded-full blur-[100px] animate-pulse-glow'></div>
                    <div class='absolute top-1/3 right-1/4 w-48 h-48 bg-secondary/10 rounded-full blur-[80px] animate-pulse-glow' style='animation-delay: 0.5s;'></div>
                    <div class='max-w-3xl mx-auto relative z-10 text-center space-y-8'>
                        <h2 class='text-3xl md:text-5xl font-bold text-foreground'>
                            Ready to build something <span class='gradient-text'>amazing</span>?
                        </h2>
                        <p class='text-lg text-muted-foreground'>
                            Start building your next project with Lockness JS today
                        </p>
                        <div class='flex flex-col sm:flex-row items-center justify-center gap-4'>
                            <a href='https://jsr.io/@lockness/core' class='inline-flex items-center gap-2 px-6 py-3 text-base font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-all group btn-interactive hover:scale-105 hover:shadow-lg glow-primary'>
                                Get Started Now
                                <span class='group-hover:translate-x-1 transition-transform'><ArrowRightIcon /></span>
                            </a>
                            <a href='https://github.com/locknessjs/lockness' class='inline-flex items-center gap-2 px-6 py-3 text-base font-medium rounded-lg border border-border bg-card hover:bg-muted transition-all hover:scale-105 hover:border-primary/50'>
                                <GithubIcon />
                                Star on GitHub
                            </a>
                        </div>
                    </div>
                </section>

                {/* Footer */}
                <footer class='border-t border-border py-16 px-6'>
                    <div class='max-w-5xl mx-auto'>
                        <div class='grid grid-cols-1 md:grid-cols-4 gap-12'>
                            <div class='space-y-4'>
                                <div class='text-lg font-bold group cursor-pointer inline-block'>
                                    <span class='group-hover:scale-105 inline-block transition-transform'>Lockness<span class='text-primary'>JS</span></span>
                                </div>
                                <p class='text-sm text-muted-foreground leading-relaxed'>
                                    The modern full-stack MVC framework for Deno 2.0
                                </p>
                            </div>
                            
                            <div>
                                <h3 class='font-semibold mb-4'>Product</h3>
                                <ul class='space-y-3'>
                                    <li><a href='#features' class='text-sm text-muted-foreground hover:text-foreground transition-colors link-underline'>Features</a></li>
                                    <li><a href='#getting-started' class='text-sm text-muted-foreground hover:text-foreground transition-colors link-underline'>Getting Started</a></li>
                                    <li><a href='#examples' class='text-sm text-muted-foreground hover:text-foreground transition-colors link-underline'>Examples</a></li>
                                </ul>
                            </div>
                            
                            <div>
                                <h3 class='font-semibold mb-4'>Resources</h3>
                                <ul class='space-y-3'>
                                    <li><a href='https://jsr.io/@lockness/core' class='text-sm text-muted-foreground hover:text-foreground transition-colors link-underline'>Documentation</a></li>
                                    <li><a href='https://jsr.io/@lockness' class='text-sm text-muted-foreground hover:text-foreground transition-colors link-underline'>JSR Packages</a></li>
                                    <li><a href='https://github.com/locknessjs/lockness' class='text-sm text-muted-foreground hover:text-foreground transition-colors link-underline'>GitHub</a></li>
                                </ul>
                            </div>
                            
                            <div>
                                <h3 class='font-semibold mb-4'>Community</h3>
                                <ul class='space-y-3'>
                                    <li><a href='https://github.com/locknessjs/lockness/discussions' class='text-sm text-muted-foreground hover:text-foreground transition-colors link-underline'>Discussions</a></li>
                                    <li><a href='https://github.com/locknessjs/lockness/issues' class='text-sm text-muted-foreground hover:text-foreground transition-colors link-underline'>Issues</a></li>
                                    <li><a href='https://github.com/locknessjs/lockness/blob/main/CONTRIBUTING.md' class='text-sm text-muted-foreground hover:text-foreground transition-colors link-underline'>Contributing</a></li>
                                </ul>
                            </div>
                        </div>
                        
                        <div class='mt-12 pt-8 border-t border-border text-center text-sm text-muted-foreground'>
                            <p>© 2025 Lockness JS. Built with <span class='inline-block hover:scale-125 transition-transform cursor-default'>❤️</span> for the Deno community. Licensed under MIT.</p>
                        </div>
                    </div>
                </footer>
            </div>
        </LandingLayout>
    )
}
