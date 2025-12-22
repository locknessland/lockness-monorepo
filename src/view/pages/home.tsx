import { LandingLayout } from '../layouts/landing_layout.tsx'
import { Card } from '../components/ui.tsx'
import pkg from '../../../lockness/core/deno.json' with { type: 'json' }

export const HomeView = () => {
    return (
        <LandingLayout title='Lockness JS - The Fullstack MVC Framework for Deno'>
            <div class='w-full'>
                {/* Navbar */}
                <header class='fixed w-full top-0 left-0 z-50 bg-background/40 backdrop-blur-xl border-b border-border/50'>
                    <div class='max-w-6xl mx-auto px-6 h-20 flex items-center justify-between'>
                        <div class='flex items-center gap-2'>
                            <span class='text-2xl font-black tracking-tighter text-foreground'>
                                Lockness<span class='text-primary'>JS</span>
                            </span>
                        </div>
                        <nav class='hidden md:flex items-center gap-10 font-medium text-sm text-muted-foreground'>
                            <a
                                href='#features'
                                class='hover:text-primary transition-colors uppercase tracking-widest text-[10px]'
                            >
                                Features
                            </a>
                            <a
                                href='#architecture'
                                class='hover:text-primary transition-colors uppercase tracking-widest text-[10px]'
                            >
                                Architecture
                            </a>
                            <a
                                href='https://jsr.io/@lockness/core'
                                class='hover:text-primary transition-colors uppercase tracking-widest text-[10px]'
                            >
                                JSR
                            </a>
                            <a
                                href='https://github.com/locknessjs/lockness'
                                class='hover:text-primary transition-colors uppercase tracking-widest text-[10px]'
                            >
                                GitHub
                            </a>
                        </nav>
                        <button
                            type='button'
                            class='bg-primary text-primary-foreground px-6 py-2.5 rounded-full font-bold text-sm hover:opacity-90 transition-all duration-300 shadow-sm shadow-primary/20'
                        >
                            Get Started
                        </button>
                    </div>
                </header>

                {/* Hero Section */}
                <section class='relative pt-48 pb-32 px-6 overflow-hidden'>
                    {/* Background glow */}
                    <div class='absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-full bg-primary/20 blur-[120px] rounded-full -z-10 pointer-events-none'>
                    </div>

                    <div class='max-w-6xl mx-auto text-center'>
                        <div class='inline-flex items-center gap-2 px-4 py-2 mb-10 rounded-full bg-accent text-accent-foreground text-sm font-semibold tracking-wide border border-border/10'>
                            <span class='relative flex h-2 w-2'>
                                <span class='animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75'>
                                </span>
                                <span class='relative inline-flex rounded-full h-2 w-2 bg-primary'>
                                </span>
                            </span>
                            v${pkg.version} is now available on JSR
                        </div>

                        <h1 class='text-6xl md:text-8xl font-black mb-8 tracking-tighter leading-[0.9] text-foreground'>
                            MVC Elegance Meets <br />
                            <span class='text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-400'>
                                Deno Performance
                            </span>
                        </h1>

                        <p class='text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto mb-12 leading-relaxed'>
                            A high-performance, fullstack MVC web framework
                            inspired by Laravel and AdonisJS. Built natively for
                            Deno, powered by the speed of Hono
                        </p>

                        <div class='flex flex-wrap justify-center gap-6 mb-20'>
                            <button
                                type='button'
                                class='bg-primary text-primary-foreground px-10 py-5 rounded-2xl font-black text-xl shadow-2xl shadow-primary/40 transition-all hover:scale-105 active:scale-95'
                            >
                                Start Building
                            </button>
                            <button
                                type='button'
                                class='bg-secondary text-secondary-foreground border border-border px-10 py-5 rounded-2xl font-black text-xl transition-all hover:scale-105 active:scale-95'
                            >
                                View Documentation
                            </button>
                        </div>

                        {/* Terminal Sample */}
                        <div class='max-w-2xl mx-auto text-left relative group'>
                            <div class='absolute -inset-1 bg-gradient-to-r from-primary to-blue-500 rounded-3xl blur opacity-20 group-hover:opacity-40 transition duration-1000'>
                            </div>
                            <div class='relative bg-card border border-border rounded-xl p-4 font-mono text-sm leading-relaxed overflow-hidden shadow-2xl'>
                                <div class='flex gap-2 mb-4 border-b border-border/50 pb-3'>
                                    <div class='w-3 h-3 rounded-full bg-red-500/50'>
                                    </div>
                                    <div class='w-3 h-3 rounded-full bg-amber-500/50'>
                                    </div>
                                    <div class='w-3 h-3 rounded-full bg-green-500/50'>
                                    </div>
                                    <span class='ml-4 text-muted-foreground text-xs'>
                                        zsh — 80x24
                                    </span>
                                </div>
                                <div class='space-y-1'>
                                    <div class='flex gap-3'>
                                        <span class='text-primary'>$</span>
                                        <span class='text-foreground'>
                                            deno add jsr:@lockness/core
                                        </span>
                                    </div>
                                    <div class='text-muted-foreground'>
                                        Add @lockness/core@${pkg.version} (jsr)
                                    </div>
                                    <div class='flex gap-3 pt-2'>
                                        <span class='text-primary'>$</span>
                                        <span class='text-foreground'>
                                            deno task ace make:controller User
                                        </span>
                                    </div>
                                    <div class='text-primary font-bold'>
                                        ✅ Controller created at
                                        ./src/controller/user_controller.ts
                                    </div>
                                    <div class='flex gap-3 pt-2'>
                                        <span class='text-primary'>$</span>
                                        <span class='text-foreground'>
                                            deno task dev
                                        </span>
                                    </div>
                                    <div class='text-muted-foreground pt-1'>
                                        🚀 Server is flying at{' '}
                                        <span class='text-primary underline italic'>
                                            http://localhost:8888
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Features Grid */}
                <section id='features' class='py-32 px-6 bg-accent/5'>
                    <div class='max-w-6xl mx-auto'>
                        <div class='grid md:grid-cols-3 gap-8'>
                            <Card
                                title='MVC Foundation'
                                description='A clear structure separating logic, data, and display. Inspired by the elegance of Laravel.'
                            >
                                <div class='w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-6 group-hover:bg-primary/20 transition-colors text-2xl'>
                                    🏗️
                                </div>
                            </Card>
                            <Card
                                title='Dependency Injection'
                                description='Built-in IoC container for clean, testable code. Just use the @Inject decorator.'
                            >
                                <div class='w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-6 group-hover:bg-primary/20 transition-colors text-2xl'>
                                    💉
                                </div>
                            </Card>
                            <Card
                                title='Deno First'
                                description='Native TypeScript, no node_modules, and top-tier security out of the box.'
                            >
                                <div class='w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-6 group-hover:bg-primary/20 transition-colors text-2xl'>
                                    ⚡
                                </div>
                            </Card>
                        </div>
                    </div>
                </section>

                {/* Architecture Section */}
                <section id='architecture' class='py-32 px-6'>
                    <div class='max-w-6xl mx-auto flex flex-col md:flex-row items-center gap-20'>
                        <div class='md:w-1/2'>
                            <h2 class='text-4xl md:text-5xl font-black mb-8 text-foreground tracking-tighter'>
                                Solid foundation, <br />
                                <span class='text-primary'>modular design</span>
                            </h2>
                            <p class='text-xl text-muted-foreground mb-8 leading-relaxed'>
                                Lockness abstracts the high-performance HonoJS
                                engine to provide a complete MVC architecture.
                                Its modular design lets you use exactly what you
                                need.
                            </p>
                            <ul class='space-y-4'>
                                <li class='flex items-center gap-3 text-muted-foreground'>
                                    <div class='w-2 h-2 rounded-full bg-primary'>
                                    </div>{' '}
                                    Native JSX powered by Hono runtime
                                </li>
                                <li class='flex items-center gap-3 text-muted-foreground'>
                                    <div class='w-2 h-2 rounded-full bg-primary'>
                                    </div>{' '}
                                    Agile CLI engine (Ace)
                                </li>
                                <li class='flex items-center gap-3 text-muted-foreground'>
                                    <div class='w-2 h-2 rounded-full bg-primary'>
                                    </div>{' '}
                                    Official Kysely ORM extension
                                </li>
                            </ul>
                        </div>
                        <div class='md:w-1/2 grid grid-cols-2 gap-4'>
                            <div class='p-6 rounded-2xl bg-primary/10 border border-primary/20 text-center'>
                                <div class='text-3xl font-black text-foreground mb-1'>
                                    Core
                                </div>
                                <div class='text-xs text-primary uppercase tracking-widest font-bold'>
                                    Base Library
                                </div>
                            </div>
                            <div class='p-6 rounded-2xl bg-card border border-border text-center opacity-80 shadow-sm'>
                                <div class='text-3xl font-black text-foreground mb-1'>
                                    Ace
                                </div>
                                <div class='text-xs text-muted-foreground uppercase tracking-widest font-bold'>
                                    CLI Engine
                                </div>
                            </div>
                            <div class='p-6 rounded-2xl bg-card border border-border text-center opacity-80 shadow-sm'>
                                <div class='text-3xl font-black text-white mb-1'>
                                    ORM
                                </div>
                                <div class='text-xs text-muted-foreground uppercase tracking-widest font-bold'>
                                    Kysely
                                </div>
                            </div>
                            <div class='p-6 rounded-2xl bg-primary/10 border border-primary/20 text-center shadow-sm shadow-primary/20'>
                                <div class='text-3xl font-black text-foreground mb-1'>
                                    JSX
                                </div>
                                <div class='text-xs text-primary uppercase tracking-widest font-bold'>
                                    View Engine
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Footer */}
                <footer class='py-20 px-6 border-t border-border bg-background'>
                    <div class='max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-10'>
                        <div class='text-center md:text-left'>
                            <span class='text-2xl font-black text-foreground mb-4 block'>
                                🌊 Lockness<span class='text-primary'>JS</span>
                            </span>
                            <p class='text-muted-foreground max-w-sm'>
                                The high-performance fullstack framework for the
                                modern Deno ecosystem. Built with love for
                                developers.
                            </p>
                        </div>
                        <div class='flex gap-10 text-xs font-bold uppercase tracking-widest text-muted-foreground'>
                            <a
                                href='https://jsr.io/@lockness'
                                class='hover:text-primary transition-colors'
                            >
                                JSR
                            </a>
                            <a
                                href='https://github.com/locknessjs'
                                class='hover:text-primary transition-colors'
                            >
                                GitHub
                            </a>
                            <a
                                href='#'
                                class='hover:text-primary transition-colors'
                            >
                                Docs
                            </a>
                        </div>
                    </div>
                    <div class='max-w-6xl mx-auto mt-20 pt-10 border-t border-border text-center text-muted-foreground text-xs'>
                        © 2025 Lockness JS Framework. Licensed under MIT.
                    </div>
                </footer>
            </div>
        </LandingLayout>
    )
}
