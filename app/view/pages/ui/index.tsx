import {
    Button,
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
    RootLayout,
} from '@lockness/ui/components'

export const UiIndex = () => {
    return (
        <RootLayout title='UI Showcase - Lockness Components'>
            <div class='container mx-auto p-8 space-y-12'>
                {/* Header */}
                <header class='border-b-4 border-border pb-8'>
                    <h1 class='font-pixel text-xl md:text-2xl text-foreground mb-4'>
                        LOCKNESS UI COMPONENTS
                    </h1>
                    <p class='text-xl text-muted-foreground max-w-3xl'>
                        A showcase of all available{' '}
                        <code class='text-primary'>@lockness/ui</code>{' '}
                        components. These components can be added to your
                        project using the CLI or imported directly from the
                        library.
                    </p>
                    <div class='mt-6 flex gap-4 items-center'>
                        <code class='px-4 py-2 bg-card border-2 border-border text-sm font-pixel-body'>
                            deno run -A jsr:@lockness/ui add button
                        </code>
                        <span class='text-muted-foreground'>or</span>
                        <code class='px-4 py-2 bg-card border-2 border-border text-sm font-pixel-body'>
                            import {'{'} Button {'}'}{' '}
                            from '@lockness/ui/components'
                        </code>
                    </div>
                </header>

                {/* Buttons Section */}
                <section class='space-y-6'>
                    <div class='border-b-2 border-border pb-3'>
                        <h2 class='font-pixel text-lg text-foreground mb-2'>
                            BUTTONS
                        </h2>
                        <p class='text-muted-foreground'>
                            Flexible button component with multiple variants and
                            sizes
                        </p>
                    </div>

                    {/* Button Variants */}
                    <div class='space-y-4'>
                        <h3 class='font-pixel text-[10px] text-foreground'>
                            VARIANTS
                        </h3>
                        <div class='flex flex-wrap gap-4 items-center p-6 bg-card border-2 border-border'>
                            <Button variant='primary'>Primary</Button>
                            <Button variant='secondary'>Secondary</Button>
                            <Button variant='outline'>Outline</Button>
                            <Button variant='ghost'>Ghost</Button>
                            <Button variant='danger'>Danger</Button>
                            <Button disabled>Disabled</Button>
                        </div>
                    </div>

                    {/* Button Sizes */}
                    <div class='space-y-4'>
                        <h3 class='font-pixel text-[10px] text-foreground'>
                            SIZES
                        </h3>
                        <div class='flex flex-wrap gap-4 items-center p-6 bg-card border-2 border-border'>
                            <Button size='sm' variant='primary'>
                                Small
                            </Button>
                            <Button size='md' variant='primary'>
                                Medium
                            </Button>
                            <Button size='lg' variant='primary'>
                                Large
                            </Button>
                        </div>
                    </div>

                    {/* Button with Unpoly */}
                    <div class='space-y-4'>
                        <h3 class='font-pixel text-[10px] text-foreground'>
                            WITH UNPOLY
                        </h3>
                        <div class='flex flex-wrap gap-4 items-center p-6 bg-card border-2 border-border'>
                            <Button
                                variant='primary'
                                up-target='.main'
                                up-href='/'
                            >
                                Navigate Home
                            </Button>
                            <Button
                                variant='secondary'
                                up-layer='new modal'
                                up-href='/auth/login'
                            >
                                Open Modal
                            </Button>
                        </div>
                    </div>
                </section>

                {/* Cards Section */}
                <section class='space-y-6'>
                    <div class='border-b-2 border-border pb-3'>
                        <h2 class='font-pixel text-lg text-foreground mb-2'>
                            CARDS
                        </h2>
                        <p class='text-muted-foreground'>
                            Compound card components for content containers
                        </p>
                    </div>

                    <div class='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'>
                        {/* Basic Card */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Basic Card</CardTitle>
                                <CardDescription>
                                    A simple card with header and content
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <p class='text-muted-foreground'>
                                    This is the content area of the card. You
                                    can place any content here.
                                </p>
                            </CardContent>
                        </Card>

                        {/* Card with Footer */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Card with Footer</CardTitle>
                                <CardDescription>
                                    Includes an action footer
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <p class='text-muted-foreground'>
                                    Cards can have footers for actions like
                                    buttons or links.
                                </p>
                            </CardContent>
                            <CardFooter>
                                <Button variant='outline' class='w-full'>
                                    Action Button
                                </Button>
                            </CardFooter>
                        </Card>

                        {/* Feature Card */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Feature Card</CardTitle>
                                <CardDescription>
                                    With multiple actions
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ul class='space-y-2 text-muted-foreground'>
                                    <li class='flex items-center gap-2'>
                                        <span class='text-primary'>✓</span>{' '}
                                        Type-safe
                                    </li>
                                    <li class='flex items-center gap-2'>
                                        <span class='text-primary'>✓</span>{' '}
                                        Composable
                                    </li>
                                    <li class='flex items-center gap-2'>
                                        <span class='text-primary'>✓</span>{' '}
                                        Accessible
                                    </li>
                                </ul>
                            </CardContent>
                            <CardFooter class='flex gap-2'>
                                <Button variant='primary' size='sm'>
                                    Learn More
                                </Button>
                                <Button variant='ghost' size='sm'>
                                    Dismiss
                                </Button>
                            </CardFooter>
                        </Card>

                        {/* Full-width Card */}
                        <Card class='md:col-span-2 lg:col-span-3'>
                            <CardHeader>
                                <CardTitle>Full-width Card</CardTitle>
                                <CardDescription>
                                    Spans multiple columns for emphasis
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <p class='text-muted-foreground mb-4'>
                                    This card spans all columns in its grid.
                                    Perfect for highlighting important
                                    information or creating hero sections.
                                </p>
                                <div class='flex flex-wrap gap-3'>
                                    <Button variant='primary'>
                                        Get Started
                                    </Button>
                                    <Button variant='secondary'>
                                        Learn More
                                    </Button>
                                    <Button variant='outline'>
                                        Documentation
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </section>

                {/* Usage Examples */}
                <section class='space-y-6'>
                    <div class='border-b-2 border-border pb-3'>
                        <h2 class='font-pixel text-lg text-foreground mb-2'>
                            USAGE EXAMPLES
                        </h2>
                        <p class='text-muted-foreground'>
                            Code examples for importing and using components
                        </p>
                    </div>

                    <div class='space-y-4'>
                        {/* CLI Usage */}
                        <Card>
                            <CardHeader>
                                <CardTitle>CLI Mode (Recommended)</CardTitle>
                                <CardDescription>
                                    Copy components to your project for full
                                    control
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div class='space-y-3'>
                                    <code class='block px-4 py-3 bg-background border-2 border-border text-sm font-pixel-body'>
                                        # Add a single component
                                        <br />
                                        deno run -A jsr:@lockness/ui add button
                                    </code>
                                    <code class='block px-4 py-3 bg-background border-2 border-border text-sm font-pixel-body'>
                                        # Add multiple components
                                        <br />
                                        deno run -A jsr:@lockness/ui add button
                                        card
                                    </code>
                                    <code class='block px-4 py-3 bg-background border-2 border-border text-sm font-pixel-body'>
                                        # List available components
                                        <br />
                                        deno run -A jsr:@lockness/ui list
                                    </code>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Library Usage */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Library Mode</CardTitle>
                                <CardDescription>
                                    Import directly for quick prototyping
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <code class='block px-4 py-3 bg-background border-2 border-border text-sm font-pixel-body'>
                                    <span class='text-[#F92672]'>import</span>
                                    {' '}
                                    {'{'} Button, Card, RootLayout, cn {'}'}
                                    {' '}
                                    <span class='text-[#F92672]'>from</span>
                                    {' '}
                                    <span class='text-[#E6DB74]'>
                                        '@lockness/ui/components'
                                    </span>
                                    <br />
                                    <br />
                                    <span class='text-[#66D9EF]'>
                                        export const
                                    </span>{' '}
                                    MyPage ={' '}
                                    <span class='text-[#F8F8F2]'>
                                        () =&gt;
                                    </span>{' '}
                                    <span class='text-[#F8F8F2]'>(</span>
                                    <br />{'  '}
                                    <span class='text-[#F8F8F2]'>&lt;</span>
                                    <span class='text-[#A6E22E]'>Button</span>
                                    {' '}
                                    <span class='text-[#FD971F]'>variant</span>
                                    <span class='text-[#F8F8F2]'>
                                        =
                                    </span>
                                    <span class='text-[#E6DB74]'>
                                        "primary"
                                    </span>
                                    <span class='text-[#F8F8F2]'>
                                        &gt;
                                    </span>
                                    Click Me
                                    <span class='text-[#F8F8F2]'>
                                        &lt;/
                                    </span>
                                    <span class='text-[#A6E22E]'>Button</span>
                                    <span class='text-[#F8F8F2]'>&gt;</span>
                                    <br />
                                    <span class='text-[#F8F8F2]'>)</span>
                                </code>
                            </CardContent>
                        </Card>
                    </div>
                </section>

                {/* Footer */}
                <footer class='border-t-4 border-border pt-8 mt-12'>
                    <div class='text-center space-y-4'>
                        <p class='font-pixel text-[10px] text-foreground'>
                            LOCKNESS UI COMPONENTS
                        </p>
                        <p class='text-muted-foreground'>
                            Built with Hono JSX, Tailwind CSS, and Unpoly
                        </p>
                        <div class='flex justify-center gap-4'>
                            <a
                                href='https://jsr.io/@lockness/ui'
                                class='text-primary hover:underline'
                            >
                                JSR Package
                            </a>
                            <a
                                href='https://github.com/locknessjs/lockness/tree/main/packages/ui'
                                class='text-primary hover:underline'
                            >
                                GitHub
                            </a>
                            <a
                                href='/'
                                class='text-primary hover:underline'
                            >
                                Back Home
                            </a>
                        </div>
                    </div>
                </footer>
            </div>
        </RootLayout>
    )
}
