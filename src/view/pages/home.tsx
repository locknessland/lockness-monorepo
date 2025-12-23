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
        class="group relative p-5 pixel-card animate-slide-up"
        style={`animation-delay: ${delay}ms; animation-fill-mode: backwards;`}
    >
        <div class="h-10 w-10 pixel-icon flex items-center justify-center text-primary mb-4 bg-background group-hover:bg-primary/20 transition-all duration-200">
            <span class="group-hover:animate-float">{icon}</span>
        </div>
        <h3 class="font-pixel text-xs text-foreground mb-3 group-hover:text-primary group-hover:crt-glow transition-colors leading-relaxed">{title}</h3>
        <p class="text-muted-foreground leading-relaxed">{description}</p>
    </div>
)

// Code Block Component
const CodeBlock = ({ filename, children }: { filename: string; children: any }) => (
    <div class="pixel-code overflow-hidden transition-all duration-200 hover:translate-x-[-2px] hover:translate-y-[-2px]">
        <div class="flex items-center gap-2 px-4 py-2 bg-card/50 border-b-3 border-border">
            <div class="flex gap-2">
                <div class="w-3 h-3 bg-red-500/80"></div>
                <div class="w-3 h-3 bg-yellow-500/80"></div>
                <div class="w-3 h-3 bg-green-500/80"></div>
            </div>
            <span class="ml-2 text-sm text-primary font-pixel-body">{filename}</span>
        </div>
        <pre class="p-4 overflow-x-auto">
            <code class="text-foreground font-pixel-body leading-relaxed whitespace-pre-wrap break-words">{children}</code>
        </pre>
    </div>
)

// Syntax highlighting helper components - Monokai theme
const Keyword = ({ children }: { children: string }) => <span class="text-[#F92672]/70">{children}</span>
const String = ({ children }: { children: string }) => <span class="text-[#E6DB74]/70">{children}</span>
const Comment = ({ children }: { children: string }) => <span class="text-[#75715E]/70 italic">{children}</span>
const Decorator = ({ children }: { children: string }) => <span class="text-[#A6E22E]/70">{children}</span>
const Func = ({ children }: { children: string }) => <span class="text-[#A6E22E]/70">{children}</span>
const Type = ({ children }: { children: string }) => <span class="text-[#66D9EF]/70 italic">{children}</span>
const Variable = ({ children }: { children: string }) => <span class="text-[#FD971F]/70">{children}</span>
const Punctuation = ({ children }: { children: string }) => <span class="text-[#F8F8F2]/70">{children}</span>
const Symbol = ({ children }: { children: string }) => <span class="text-[#F92672]/70">{children}</span>
const Success = ({ children }: { children: string }) => <span class="text-[#A6E22E]/70">{children}</span>
const Prompt = ({ children }: { children: string }) => <span class="text-[#A6E22E]/70 font-bold">{children}</span>

export const HomeView = () => {
    return (
        <LandingLayout title='Lockness JS - The Fullstack MVC Framework for Deno'>
            <div class='min-h-screen'>
                {/* Header */}
                <header class='fixed top-0 left-0 right-0 z-50 border-b-4 border-border bg-background/95 animate-fade-in'>
                    <div class='max-w-6xl mx-auto px-6 h-16 flex items-center justify-between'>
                        <div class='flex items-center gap-3 group cursor-pointer'>
                            <div class='w-8 h-8 bg-primary flex items-center justify-center border-2 border-primary-foreground/20' style='box-shadow: 2px 2px 0 0 rgba(0,0,0,0.5);'>
                                <span class='font-pixel text-[8px] text-primary-foreground'>L</span>
                            </div>
                            <span class='font-pixel text-xs text-foreground tracking-tight mt-1'>
                                LOCKNESS<span class='text-primary'>JS</span>
                            </span>
                        </div>
                        
                        <nav class='hidden md:flex items-center gap-6'>
                            <a href='#features' class='text-muted-foreground hover:text-primary transition-colors'>Features</a>
                            <a href='#getting-started' class='text-muted-foreground hover:text-primary transition-colors'>Getting Started</a>
                            <a href='#examples' class='text-muted-foreground hover:text-primary transition-colors'>Examples</a>
                            <span class='font-pixel text-[8px] px-3 py-1 border-2 border-primary/50 bg-background text-primary'>v{pkg.version}</span>
                        </nav>

                        <div class='flex items-center gap-3'>
                            <a href='https://github.com/locknessjs/lockness' class='hidden md:inline-flex items-center gap-2 px-3 py-1.5 text-muted-foreground hover:text-primary transition-all'>
                                <GithubIcon />
                            </a>
                            <a href='#getting-started' class='pixel-btn bg-primary text-primary-foreground'>
                                START
                            </a>
                        </div>
                    </div>
                </header>

                {/* Hero Section */}
                <section class='pt-28 pb-20 px-6 relative overflow-hidden scanlines'>
                    {/* Background Pattern - Pixel grid */}
                    <div class='absolute inset-0 bg-[linear-gradient(to_right,var(--border)_2px,transparent_2px),linear-gradient(to_bottom,var(--border)_2px,transparent_2px)] bg-[size:2rem_2rem] opacity-30'></div>
                    
                    {/* Animated glow orbs */}
                    <div class='absolute top-20 left-1/4 w-72 h-72 bg-primary/30 blur-[100px] animate-pulse-glow'></div>
                    <div class='absolute bottom-20 right-1/4 w-96 h-96 bg-secondary/30 blur-[120px] animate-pulse-glow' style='animation-delay: 1s;'></div>
                    
                    <div class='max-w-7xl mx-auto relative z-10'>
                        <div class='flex flex-col lg:flex-row items-center gap-12 lg:gap-16'>
                            
                            {/* Left side - Text content */}
                            <div class='flex-1 text-center lg:text-left space-y-6'>
                                {/* Badge */}
                                <div class='inline-flex items-center gap-2 px-3 py-2 border-2 border-primary/50 bg-background text-sm animate-slide-up cursor-default' style='box-shadow: 3px 3px 0 0 rgba(0,0,0,0.3);'>
                                    <span class='relative flex h-2 w-2'>
                                        <span class='animate-ping absolute inline-flex h-full w-full bg-primary opacity-75'></span>
                                        <span class='relative inline-flex h-2 w-2 bg-primary'></span>
                                    </span>
                                    <span class='text-primary font-pixel text-[8px] mt-0.5'>v{pkg.version} ON JSR</span>
                                </div>

                                {/* Title */}
                                <h1 class='font-pixel text-xl md:text-2xl lg:text-3xl leading-relaxed tracking-tight animate-slide-up animate-flicker' style='animation-delay: 100ms; animation-fill-mode: backwards;'>
                                    Build fullstack apps<br/>
                                    <span class='text-primary crt-glow'>at monster speed.</span>
                                </h1>

                                {/* Description */}
                                <p class='text-xl text-muted-foreground max-w-xl mx-auto lg:mx-0 leading-relaxed animate-slide-up' style='animation-delay: 200ms; animation-fill-mode: backwards;'>
                                    The MVC framework that combines <strong class='text-primary'>Laravel's</strong> elegance with <strong class='text-primary'>HonoJS</strong> speed. Native to Deno.
                                </p>

                                {/* CTA Buttons */}
                                <div class='flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start pt-2 animate-slide-up' style='animation-delay: 300ms; animation-fill-mode: backwards;'>
                                    <a href='/docs/installation' class='pixel-btn bg-primary text-primary-foreground'>
                                        GET STARTED
                                    </a>
                                    
                                    {/* Install Command */}
                                    <div class='flex items-center gap-2 px-4 py-3 bg-background border-3 border-border font-pixel-body text-lg cursor-pointer group' id='install-command' style='box-shadow: 3px 3px 0 0 rgba(0,0,0,0.4);'>
                                        <span class='text-primary'>$</span>
                                        <span class='text-foreground' id='install-text'>deno run -Ar jsr:@lockness/init</span>
                                        <button 
                                            type='button' 
                                            id='copy-btn'
                                            class='p-1 hover:text-primary transition-all text-muted-foreground cursor-pointer'
                                            title='Copy to clipboard'
                                        >
                                            <span id='copy-icon'><CopyIcon /></span>
                                            <span id='check-icon' class='hidden text-primary'><CheckIcon /></span>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Right side - Code Preview */}
                            <div class='flex-1 w-full max-w-lg lg:max-w-xl animate-slide-up' style='animation-delay: 400ms; animation-fill-mode: backwards;'>
                                <div class='relative'>
                                    {/* Glow effect behind the card */}
                                    <div class='absolute -inset-4 bg-primary/20 blur-2xl opacity-50'></div>
                                    
                                    {/* Code block */}
                                    <div class='relative pixel-code overflow-hidden transform hover:translate-x-[-2px] hover:translate-y-[-2px] transition-transform duration-200'>
                                        <div class='flex items-center px-4 py-2 bg-card border-b-3 border-border gap-2'>
                                            <div class='flex gap-2'>
                                                <div class='w-3 h-3 bg-red-500/80'></div>
                                                <div class='w-3 h-3 bg-yellow-500/80'></div>
                                                <div class='w-3 h-3 bg-green-500/80'></div>
                                            </div>
                                            <span class='ml-auto text-sm text-primary font-pixel-body'>home_controller.ts</span>
                                        </div>
                                        <div class='p-5 overflow-x-auto font-pixel-body text-lg leading-relaxed'>
                                            <pre><code class='whitespace-pre-wrap'><Decorator>@Controller</Decorator><Punctuation>(</Punctuation><String>'/'</String><Punctuation>)</Punctuation>{"\n"}<Keyword>export class</Keyword> <Type>HomeController</Type> <Punctuation>{'{'}</Punctuation>{"\n"}{"\n"}{'    '}<Decorator>@Get</Decorator><Punctuation>(</Punctuation><String>'/'</String><Punctuation>)</Punctuation>{"\n"}{'    '}<Decorator>@Use</Decorator><Punctuation>(</Punctuation><Type>AuthMiddleware</Type><Punctuation>)</Punctuation>{"\n"}{'    '}<Keyword>async</Keyword> <Func>index</Func><Punctuation>(</Punctuation><Variable>c</Variable><Punctuation>:</Punctuation> <Type>Context</Type><Punctuation>)</Punctuation> <Punctuation>{'{'}</Punctuation>{"\n"}{'        '}<Keyword>const</Keyword> <Variable>user</Variable> <Symbol>=</Symbol> <Keyword>await</Keyword> <Func>auth</Func><Punctuation>(</Punctuation><Variable>c</Variable><Punctuation>)</Punctuation>.<Func>user</Func><Punctuation>()</Punctuation>{"\n"}{"\n"}{'        '}<Keyword>return</Keyword> <Variable>c</Variable>.<Func>json</Func><Punctuation>(</Punctuation><Punctuation>{'{'}</Punctuation>{"\n"}{'            '}monster<Punctuation>:</Punctuation> <Type>true</Type><Punctuation>,</Punctuation>{"\n"}{'            '}message<Punctuation>:</Punctuation> <String>"Hello from the Deep"</String>{"\n"}{'        '}<Punctuation>{'}'}</Punctuation><Punctuation>)</Punctuation>{"\n"}{'    '}<Punctuation>{'}'}</Punctuation>{"\n"}<Punctuation>{'}'}</Punctuation></code></pre>
                                        </div>
                                    </div>
                                </div>
                            </div>
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
                </section>

                {/* Stats Section */}
                <section class='py-12 px-6 border-y-4 border-border bg-card/50'>
                    <div class='max-w-5xl mx-auto'>
                        <div class='grid grid-cols-2 md:grid-cols-4 gap-8'>
                            <div class='text-center group cursor-default'>
                                <div class='font-pixel text-sm text-foreground group-hover:text-primary group-hover:crt-glow transition-colors'>MVC</div>
                                <div class='text-muted-foreground mt-2'>Architecture</div>
                            </div>
                            <div class='text-center group cursor-default'>
                                <div class='font-pixel text-sm text-foreground group-hover:text-primary group-hover:crt-glow transition-colors'>TypeScript</div>
                                <div class='text-muted-foreground mt-2'>First Class</div>
                            </div>
                            <div class='text-center group cursor-default'>
                                <div class='font-pixel text-sm text-foreground group-hover:text-primary group-hover:crt-glow transition-colors'>Deno 2.0</div>
                                <div class='text-muted-foreground mt-2'>Native Support</div>
                            </div>
                            <div class='text-center group cursor-default'>
                                <div class='font-pixel text-sm text-foreground group-hover:text-primary group-hover:crt-glow transition-colors'>Hono</div>
                                <div class='text-muted-foreground mt-2'>Powered</div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Features Section */}
                <section id='features' class='py-24 px-6'>
                    <div class='max-w-5xl mx-auto'>
                        <div class='text-center mb-16'>
                            <h2 class='font-pixel text-lg md:text-xl text-foreground mb-6'>THE COMPLETE ARSENAL</h2>
                            <p class='text-xl text-muted-foreground max-w-2xl mx-auto'>
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
                            <h2 class='font-pixel text-lg md:text-xl text-foreground mb-6'>ACE PRODUCTIVITY</h2>
                            <p class='text-xl text-muted-foreground max-w-2xl mx-auto'>
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
                                <div class='p-4 pixel-card group'>
                                    <div class='flex items-center gap-3 mb-2'>
                                        <span class='text-primary'><CheckIcon /></span>
                                        <span class='font-pixel text-[10px] text-foreground'>Development</span>
                                    </div>
                                    <code class='text-muted-foreground font-pixel-body text-lg'>deno task dev</code>
                                </div>
                                <div class='p-4 pixel-card group'>
                                    <div class='flex items-center gap-3 mb-2'>
                                        <span class='text-primary'><CheckIcon /></span>
                                        <span class='font-pixel text-[10px] text-foreground'>Production Build</span>
                                    </div>
                                    <code class='text-muted-foreground font-pixel-body text-lg'>deno task build && deno task start</code>
                                </div>
                                <div class='p-4 pixel-card group'>
                                    <div class='flex items-center gap-3 mb-2'>
                                        <span class='text-primary'><CheckIcon /></span>
                                        <span class='font-pixel text-[10px] text-foreground'>Database Migrations</span>
                                    </div>
                                    <code class='text-muted-foreground font-pixel-body text-lg'>deno task ace db:migrate</code>
                                </div>
                                <div class='p-4 pixel-card group'>
                                    <div class='flex items-center gap-3 mb-2'>
                                        <span class='text-primary'><CheckIcon /></span>
                                        <span class='font-pixel text-[10px] text-foreground'>Testing</span>
                                    </div>
                                    <code class='text-muted-foreground font-pixel-body text-lg'>deno task test</code>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Code Examples Section */}
                <section id='examples' class='py-24 px-6'>
                    <div class='max-w-5xl mx-auto'>
                        <div class='text-center mb-16'>
                            <h2 class='font-pixel text-lg md:text-xl text-foreground mb-6'>CODE EXAMPLES</h2>
                            <p class='text-xl text-muted-foreground max-w-2xl mx-auto'>
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
                <section class='py-24 px-6 relative overflow-hidden border-t-4 border-border'>
                    <div class='absolute inset-0 bg-card/50'></div>
                    {/* Animated background elements */}
                    <div class='absolute top-1/2 left-1/4 w-64 h-64 bg-primary/20 blur-[100px] animate-pulse-glow'></div>
                    <div class='absolute top-1/3 right-1/4 w-48 h-48 bg-secondary/20 blur-[80px] animate-pulse-glow' style='animation-delay: 0.5s;'></div>
                    <div class='max-w-3xl mx-auto relative z-10 text-center space-y-8'>
                        <h2 class='font-pixel text-lg md:text-xl text-foreground leading-relaxed'>
                            READY TO BUILD<br/>SOMETHING <span class='text-primary crt-glow'>AMAZING</span>?
                        </h2>
                        <p class='text-xl text-muted-foreground'>
                            Start building your next project with Lockness JS today
                        </p>
                        <div class='flex flex-col sm:flex-row items-center justify-center gap-4'>
                            <a href='/docs/installation' class='pixel-btn bg-primary text-primary-foreground'>
                                GET STARTED NOW
                            </a>
                            <a href='https://github.com/locknessjs/lockness' class='pixel-btn bg-card text-foreground border-2 border-border'>
                                STAR ON GITHUB
                            </a>
                        </div>
                    </div>
                </section>

                {/* Footer */}
                <footer class='border-t-4 border-border py-16 px-6 bg-card/30'>
                    <div class='max-w-5xl mx-auto'>
                        <div class='grid grid-cols-1 md:grid-cols-4 gap-12'>
                            <div class='space-y-4'>
                                <div class='font-pixel text-[10px] group cursor-pointer inline-block'>
                                    <span class='text-foreground'>LOCKNESS<span class='text-primary'>JS</span></span>
                                </div>
                                <p class='text-muted-foreground leading-relaxed'>
                                    The modern full-stack MVC framework for Deno 2.0
                                </p>
                            </div>
                            
                            <div>
                                <h3 class='font-pixel text-[8px] mb-4 text-foreground'>PRODUCT</h3>
                                <ul class='space-y-3'>
                                    <li><a href='#features' class='text-muted-foreground hover:text-primary transition-colors'>Features</a></li>
                                    <li><a href='#getting-started' class='text-muted-foreground hover:text-primary transition-colors'>Getting Started</a></li>
                                    <li><a href='#examples' class='text-muted-foreground hover:text-primary transition-colors'>Examples</a></li>
                                </ul>
                            </div>
                            
                            <div>
                                <h3 class='font-pixel text-[8px] mb-4 text-foreground'>RESOURCES</h3>
                                <ul class='space-y-3'>
                                    <li><a href='https://jsr.io/@lockness/core' class='text-muted-foreground hover:text-primary transition-colors'>Documentation</a></li>
                                    <li><a href='https://jsr.io/@lockness' class='text-muted-foreground hover:text-primary transition-colors'>JSR Packages</a></li>
                                    <li><a href='https://github.com/locknessjs/lockness' class='text-muted-foreground hover:text-primary transition-colors'>GitHub</a></li>
                                </ul>
                            </div>
                            
                            <div>
                                <h3 class='font-pixel text-[8px] mb-4 text-foreground'>COMMUNITY</h3>
                                <ul class='space-y-3'>
                                    <li><a href='https://github.com/locknessjs/lockness/discussions' class='text-muted-foreground hover:text-primary transition-colors'>Discussions</a></li>
                                    <li><a href='https://github.com/locknessjs/lockness/issues' class='text-muted-foreground hover:text-primary transition-colors'>Issues</a></li>
                                    <li><a href='https://github.com/locknessjs/lockness/blob/main/CONTRIBUTING.md' class='text-muted-foreground hover:text-primary transition-colors'>Contributing</a></li>
                                </ul>
                            </div>
                        </div>
                        
                        <div class='mt-12 pt-8 border-t-2 border-border text-center'>
                            <p class='font-pixel text-[8px] text-primary mb-2'>LOCKNESS JS</p>
                            <p class='text-muted-foreground'>MIT License © 2025</p>
                        </div>
                    </div>
                </footer>
            </div>
        </LandingLayout>
    )
}
