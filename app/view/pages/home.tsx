import { route } from '@lockness/core'
import { LandingLayout } from '../layouts/landing_layout.tsx'
import pkg from '../../../packages/core/deno.json' with { type: 'json' }

// Import @lockness/ui components
import {
    Button,
    Card,
    CardContent,
    CodeBlock,
    CommandBlock,
    FeatureCard,
    Footer,
    FooterSection,
    FooterSectionItem,
    Hero,
    HeroActions,
    HeroAnnouncement,
    HeroCommand,
    HeroCTA,
    HeroSubtitle,
    HeroTitle,
    Navbar,
    NavbarBrand,
    NavbarContent,
    NavbarMenuItem,
    Section,
    SectionContent,
    SectionDescription,
    SectionHeader,
    SectionTitle,
    ThemeSwitch,
    ThemeSwitchScript,
} from '@lockness/ui/components'

// Import icons from @lockness/ui
import {
    BoxIcon,
    CheckIcon,
    ClockIcon,
    DatabaseIcon,
    GithubIcon,
    LayersIcon,
    MailIcon,
    ShieldIcon,
    TerminalIcon,
    UserIcon,
    UsersIcon,
    ZapIcon,
} from '@lockness/ui/components'

// Stats item component
const StatItem = (
    { title, subtitle }: { title: string; subtitle: string },
) => (
    <div class='text-center group cursor-default'>
        <div class='text-xl font-semibold text-foreground group-hover:text-primary transition-colors'>
            {title}
        </div>
        <div class='text-sm text-muted-foreground mt-1'>{subtitle}</div>
    </div>
)

// Command item for the getting started section
const CommandItem = (
    { label, command }: { label: string; command: string },
) => (
    <Card class='group hover:border-primary/50 transition-colors'>
        <CardContent class='p-4'>
            <div class='flex items-center gap-3 mb-2'>
                <span class='text-primary'>
                    <CheckIcon size={16} />
                </span>
                <span class='text-sm font-medium text-foreground'>
                    {label}
                </span>
            </div>
            <code class='text-muted-foreground font-mono text-sm'>
                {command}
            </code>
        </CardContent>
    </Card>
)

export const Home = () => {
    return (
        <LandingLayout title='Lockness JS - The Fullstack MVC Framework for Deno'>
            <div class='min-h-screen'>
                {/* Header */}
                <Navbar position='fixed'>
                    <NavbarBrand href='/'>
                        <div class='w-8 h-8 bg-primary rounded-(--radius) flex items-center justify-center'>
                            <span class='text-sm font-bold text-primary-foreground'>
                                L
                            </span>
                        </div>
                        <span class='font-semibold'>
                            Lockness<span class='text-primary'>JS</span>
                        </span>
                    </NavbarBrand>

                    <NavbarContent class='hidden md:flex'>
                        <NavbarMenuItem href='#features'>
                            Features
                        </NavbarMenuItem>
                        <NavbarMenuItem href={route('docs.ui')}>
                            UI Components
                        </NavbarMenuItem>
                    </NavbarContent>

                    <NavbarContent position='right'>
                        <a
                            href={route('auth.profile')}
                            class='hidden md:inline-flex items-center text-muted-foreground hover:text-primary transition-colors'
                            title='Profile'
                        >
                            <UserIcon size={20} />
                        </a>
                        <ThemeSwitch variant='toggle' />
                        <a
                            href='https://github.com/locknessjs/core'
                            class='hidden md:inline-flex items-center text-muted-foreground hover:text-primary transition-colors'
                        >
                            <GithubIcon size={20} />
                        </a>
                        <Button href='/docs/getting-started'>
                            Get Started
                        </Button>
                    </NavbarContent>
                </Navbar>

                <ThemeSwitchScript />

                {/* Hero Section */}
                <Hero background='gradient' size='xl' class='pt-32'>
                    <HeroAnnouncement badge={`v${pkg.version}`}>
                        Now available on JSR
                    </HeroAnnouncement>

                    <HeroTitle size='lg' gradient='at monster speed.'>
                        Build fullstack apps
                    </HeroTitle>

                    <HeroSubtitle maxWidth='lg'>
                        The MVC framework that combines{' '}
                        <strong class='text-primary'>Laravel's</strong>{' '}
                        elegance with{' '}
                        <strong class='text-primary'>HonoJS</strong>{' '}
                        speed. Native to Deno.
                    </HeroSubtitle>

                    <HeroActions>
                        <HeroCTA
                            href='/docs/getting-started'
                            variant='primary'
                            size='lg'
                        >
                            Get Started
                        </HeroCTA>
                        <HeroCommand command='deno run -Ar jsr:@lockness/init' />
                    </HeroActions>
                </Hero>

                {/* Stats Section */}
                <Section variant='card' size='sm'>
                    <SectionContent>
                        <div class='grid grid-cols-2 md:grid-cols-4 gap-8'>
                            <StatItem title='MVC' subtitle='Architecture' />
                            <StatItem
                                title='TypeScript'
                                subtitle='First Class'
                            />
                            <StatItem
                                title='Deno 2.0'
                                subtitle='Native Support'
                            />
                            <StatItem title='Hono' subtitle='Powered' />
                        </div>
                    </SectionContent>
                </Section>

                {/* Features Section */}
                <Section id='features'>
                    <SectionHeader>
                        <SectionTitle>The Complete Arsenal</SectionTitle>
                        <SectionDescription>
                            Lockness provides a complete toolkit with batteries
                            included for rapid development
                        </SectionDescription>
                    </SectionHeader>
                    <SectionContent>
                        <div class='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
                            <FeatureCard
                                icon={<LayersIcon size={24} />}
                                title='MVC Architecture'
                                description='Clear separation of concerns with Models, Views, and Controllers. Inspired by Laravel and AdonisJS.'
                            />
                            <FeatureCard
                                icon={<BoxIcon size={24} />}
                                title='Dependency Injection'
                                description='Built-in IoC container for clean, testable code. Just use the @Inject decorator.'
                            />
                            <FeatureCard
                                icon={<ZapIcon size={24} />}
                                title='Blazing Fast'
                                description='Built on Hono, one of the fastest web frameworks. Sub-millisecond response times.'
                            />
                            <FeatureCard
                                icon={<ShieldIcon size={24} />}
                                title='Secure by Default'
                                description="Leverage Deno's security model with explicit permissions. Session, Auth, and CSRF protection built-in."
                            />
                            <FeatureCard
                                icon={<DatabaseIcon size={24} />}
                                title='Drizzle ORM'
                                description='Type-safe database operations with migrations, seeders, and Drizzle Studio integration.'
                            />
                            <FeatureCard
                                icon={<TerminalIcon size={24} />}
                                title='Powerful CLI'
                                description='Scaffold controllers, models, middleware, jobs and more with the Cli CLI engine.'
                            />
                            <FeatureCard
                                icon={<UsersIcon size={24} />}
                                title='Authentication'
                                description='Complete auth system with sessions, password hashing, and social OAuth providers.'
                            />
                            <FeatureCard
                                icon={<MailIcon size={24} />}
                                title='Mail System'
                                description='Expressive fluent API for sending emails. Supports SMTP, Resend, and more drivers.'
                            />
                            <FeatureCard
                                icon={<ClockIcon size={24} />}
                                title='Background Jobs'
                                description='Queue and process long-running tasks in the background with memory or Deno KV drivers.'
                            />
                        </div>
                    </SectionContent>
                </Section>

                {/* Getting Started Section */}
                <Section id='getting-started' variant='muted'>
                    <SectionHeader>
                        <SectionTitle>CLI Productivity</SectionTitle>
                        <SectionDescription>
                            Initialize your project and start building
                            immediately
                        </SectionDescription>
                    </SectionHeader>
                    <SectionContent>
                        <div class='grid grid-cols-1 lg:grid-cols-2 gap-8'>
                            {/* Terminal Preview */}
                            <div>
                                <CommandBlock lang='bash'>
                                    {`$ deno run -Ar jsr:@lockness/init
✨ Creating new Lockness project...

$ deno task cli make:controller User
✅ Controller created at ./app/controller/user_controller.ts

$ deno task cli make:model Post -a
✅ Model created at ./app/model/post.ts
✅ Repository created at ./app/repository/post_repository.ts
✅ Seeder created at ./app/seeder/post_seeder.ts
✅ Controller created at ./app/controller/post_controller.ts

$ deno task dev
🚀 Server is flying at http://localhost:8888`}
                                </CommandBlock>
                            </div>

                            {/* Commands List */}
                            <div class='space-y-4'>
                                <CommandItem
                                    label='Development'
                                    command='deno task dev'
                                />
                                <CommandItem
                                    label='Production Build'
                                    command='deno task build && deno task start'
                                />
                                <CommandItem
                                    label='Database Migrations'
                                    command='deno task cli db:migrate'
                                />
                                <CommandItem
                                    label='Testing'
                                    command='deno task test'
                                />
                            </div>
                        </div>
                    </SectionContent>
                </Section>

                {/* Code Examples Section */}
                <Section id='examples'>
                    <SectionHeader>
                        <SectionTitle>Code Examples</SectionTitle>
                        <SectionDescription>
                            Write elegant code with decorators, dependency
                            injection, and type-safe validation
                        </SectionDescription>
                    </SectionHeader>
                    <SectionContent>
                        <div class='grid grid-cols-1 lg:grid-cols-2 gap-6'>
                            {/* Controller Example */}
                            <CodeBlock lang='typescript'>
                                {`import { Controller, Get, Post, Validate } from '@lockness/core'
import { UserService } from '@service/user_service.ts'
import { insertUserSchema } from '@model/user.ts'

@Controller('/api/users')
export class UserController {
    constructor(private userService: UserService) {}

    @Get('/')
    async index(c: Context) {
        const users = await this.userService.findAll()
        return c.json({ users })
    }

    @Post('/')
    @Validate('json', insertUserSchema)
    async store(c: Context) {
        const data = c.req.valid('json')
        const user = await this.userService.create(data)
        return c.json({ user }, 201)
    }
}`}
                            </CodeBlock>

                            {/* Auth Example */}
                            <CodeBlock lang='typescript'>
                                {`import { Controller, Get, Post, Auth, Guest } from '@lockness/core'
import { auth, session } from '@lockness/core'

@Controller('/auth')
export class AuthController {
    @Guest('/dashboard')
    @Get('/login')
    showLogin(c: Context) {
        return c.render(<LoginPage />)
    }

    @Post('/login')
    async login(c: Context) {
        const { email, password } = await c.req.parseBody()

        if (await auth(c).attempt(email, password)) {
            return c.redirect('/dashboard')
        }

        session(c).flash('error', 'Invalid credentials')
        return c.redirect('/auth/login')
    }

    @Auth()
    @Post('/logout')
    async logout(c: Context) {
        await auth(c).logout()
        return c.redirect('/auth/login')
    }
}`}
                            </CodeBlock>
                        </div>
                    </SectionContent>
                </Section>

                {/* CTA Section */}
                <Section
                    variant='muted'
                    container='md'
                    class='relative overflow-hidden border-t border-border'
                >
                    {/* Background elements */}
                    <div class='absolute top-1/2 left-1/4 w-64 h-64 bg-primary/10 blur-[100px]' />
                    <div class='absolute top-1/3 right-1/4 w-48 h-48 bg-secondary/10 blur-[80px]' />

                    <SectionHeader>
                        <SectionTitle>
                            Ready to Build Something Amazing?
                        </SectionTitle>
                        <SectionDescription>
                            Start building your next project with Lockness JS
                            today
                        </SectionDescription>
                    </SectionHeader>
                    <SectionContent class='flex flex-col sm:flex-row items-center justify-center gap-4 relative z-10'>
                        <Button
                            as='a'
                            href='/docs/getting-started'
                            size='lg'
                        >
                            Get Started Now
                        </Button>
                        <Button
                            as='a'
                            href='https://github.com/locknessjs/core'
                            variant='outline'
                            size='lg'
                        >
                            <GithubIcon size={18} class='mr-2' />
                            Star on GitHub
                        </Button>
                    </SectionContent>
                </Section>

                {/* Footer */}
                <Footer
                    brand={
                        <span class='font-semibold'>
                            Lockness<span class='text-primary'>JS</span>
                        </span>
                    }
                    copyright='MIT License © 2025'
                >
                    <FooterSection title='Product'>
                        <FooterSectionItem href='#features'>
                            Features
                        </FooterSectionItem>
                        <FooterSectionItem href='#getting-started'>
                            Getting Started
                        </FooterSectionItem>
                        <FooterSectionItem href='#examples'>
                            Examples
                        </FooterSectionItem>
                    </FooterSection>

                    <FooterSection title='Resources'>
                        <FooterSectionItem
                            href='https://jsr.io/@lockness/core'
                            external
                        >
                            Documentation
                        </FooterSectionItem>
                        <FooterSectionItem
                            href='https://jsr.io/@lockness/core'
                            external
                        >
                            JSR Packages
                        </FooterSectionItem>
                        <FooterSectionItem
                            href='https://github.com/locknessjs/core'
                            external
                        >
                            GitHub
                        </FooterSectionItem>
                    </FooterSection>

                    <FooterSection title='Community'>
                        <FooterSectionItem
                            href='https://github.com/locknessjs/core/discussions'
                            external
                        >
                            Discussions
                        </FooterSectionItem>
                        <FooterSectionItem
                            href='https://github.com/locknessjs/core/issues'
                            external
                        >
                            Issues
                        </FooterSectionItem>
                        <FooterSectionItem
                            href='https://github.com/locknessjs/core/blob/main/CONTRIBUTING.md'
                            external
                        >
                            Contributing
                        </FooterSectionItem>
                    </FooterSection>
                </Footer>
            </div>
        </LandingLayout>
    )
}
