import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
    Alert,
    AlertDescription,
    AlertTitle,
    Badge,
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
    Button,
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
    Checkbox,
    Input,
    Kbd,
    Label,
    Link,
    Separator,
    Skeleton,
    Switch,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    Textarea,
} from '@lockness/ui/components'
import { PageUiLayout } from '@view/layouts/ui_layout.tsx'

/**
 * Hero Section Component
 */
const HeroSection = () => (
    <div class='relative overflow-hidden bg-gradient-to-br from-primary/5 via-background to-secondary/5 border-b border-border'>
        <div class='absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent' />
        <div class='relative px-6 py-12 md:py-16 lg:py-20'>
            <div class='max-w-4xl'>
                {/* Badge */}
                <Badge variant='secondary' class='mb-4'>
                    v1.0 • Deno + JSR
                </Badge>

                {/* Title */}
                <h1 class='font-pixel text-2xl md:text-3xl lg:text-4xl text-foreground mb-4'>
                    Lockness UI Components
                </h1>

                {/* Description */}
                <p class='text-lg md:text-xl text-muted-foreground max-w-2xl mb-8'>
                    A modern, type-safe component library built for Deno and
                    Hono. Fully customizable with CSS variables, accessible, and
                    ready for production.
                </p>

                {/* Install Commands */}
                <div class='flex flex-col sm:flex-row gap-4 mb-8'>
                    <div class='flex items-center gap-2 px-4 py-3 bg-card/80 backdrop-blur border border-border rounded-lg'>
                        <span class='text-muted-foreground text-sm'>$</span>
                        <code class='font-mono text-sm text-foreground'>
                            deno run -A jsr:@lockness/ui add button
                        </code>
                    </div>
                    <span class='hidden sm:flex items-center text-muted-foreground'>
                        or
                    </span>
                    <div class='flex items-center gap-2 px-4 py-3 bg-card/80 backdrop-blur border border-border rounded-lg'>
                        <code class='font-mono text-sm text-foreground'>
                            import {'{'} Button {'}'}{' '}
                            from '@lockness/ui/components'
                        </code>
                    </div>
                </div>

                {/* CTA Buttons */}
                <div class='flex flex-wrap gap-4'>
                    <Button href='/docs' variant='primary' size='lg'>
                        Get Started
                    </Button>
                    <Button
                        href='https://github.com/locknessland/lockness'
                        variant='outline'
                        size='lg'
                        target='_blank'
                    >
                        GitHub
                    </Button>
                </div>
            </div>
        </div>
    </div>
)

export const UiIndex = () => {
    return (
        <PageUiLayout title='UI Components' noPadding>
            {/* Hero Section */}
            <HeroSection />

            <div class='p-6 md:p-8 space-y-12'>
                {/* Buttons Section */}
                <section class='space-y-6'>
                    <div class='pb-3'>
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
                        <div class='flex flex-wrap gap-4 items-center p-6 bg-card'>
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
                        <div class='flex flex-wrap gap-4 items-center p-6 bg-card'>
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
                        <div class='flex flex-wrap gap-4 items-center p-6 bg-card'>
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
                    <div class='pb-3'>
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

                {/* Form Components Section */}
                <section class='space-y-6'>
                    <div class='pb-3'>
                        <h2 class='font-pixel text-lg text-foreground mb-2'>
                            FORM COMPONENTS
                        </h2>
                        <p class='text-muted-foreground'>
                            Input, textarea, checkbox, switch, and label
                            components
                        </p>
                    </div>

                    {/* Label & Input */}
                    <div class='space-y-4'>
                        <h3 class='font-pixel text-[10px] text-foreground'>
                            LABEL & INPUT
                        </h3>
                        <Card>
                            <CardContent class='p-6 space-y-4'>
                                <div class='space-y-2'>
                                    <Label for='email'>Email Address</Label>
                                    <Input
                                        id='email'
                                        type='email'
                                        placeholder='you@example.com'
                                    />
                                </div>
                                <div class='space-y-2'>
                                    <Label for='password'>Password</Label>
                                    <Input
                                        id='password'
                                        type='password'
                                        placeholder='Enter password'
                                    />
                                </div>
                                <div class='space-y-2'>
                                    <Label for='number'>Number</Label>
                                    <Input
                                        id='number'
                                        type='number'
                                        placeholder='42'
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Textarea */}
                    <div class='space-y-4'>
                        <h3 class='font-pixel text-[10px] text-foreground'>
                            TEXTAREA
                        </h3>
                        <Card>
                            <CardContent class='p-6 space-y-4'>
                                <div class='space-y-2'>
                                    <Label for='message'>Message</Label>
                                    <Textarea
                                        id='message'
                                        rows={4}
                                        placeholder='Enter your message...'
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Checkbox */}
                    <div class='space-y-4'>
                        <h3 class='font-pixel text-[10px] text-foreground'>
                            CHECKBOX
                        </h3>
                        <Card>
                            <CardContent class='p-6 space-y-3'>
                                <div class='flex items-center space-x-2'>
                                    <Checkbox id='terms' />
                                    <Label for='terms'>
                                        Accept terms and conditions
                                    </Label>
                                </div>
                                <div class='flex items-center space-x-2'>
                                    <Checkbox id='marketing' />
                                    <Label for='marketing'>
                                        Receive marketing emails
                                    </Label>
                                </div>
                                <div class='flex items-center space-x-2'>
                                    <Checkbox id='disabled' disabled />
                                    <Label for='disabled'>
                                        Disabled checkbox
                                    </Label>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Switch */}
                    <div class='space-y-4'>
                        <h3 class='font-pixel text-[10px] text-foreground'>
                            SWITCH
                        </h3>
                        <Card>
                            <CardContent class='p-6 space-y-3'>
                                <div class='flex items-center space-x-2'>
                                    <Switch id='notifications' />
                                    <Label for='notifications'>
                                        Enable notifications
                                    </Label>
                                </div>
                                <div class='flex items-center space-x-2'>
                                    <Switch id='dark-mode' />
                                    <Label for='dark-mode'>
                                        Dark mode
                                    </Label>
                                </div>
                                <div class='flex items-center space-x-2'>
                                    <Switch id='disabled-switch' disabled />
                                    <Label for='disabled-switch'>
                                        Disabled switch
                                    </Label>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </section>

                {/* Display Components Section */}
                <section class='space-y-6'>
                    <div class='pb-3'>
                        <h2 class='font-pixel text-lg text-foreground mb-2'>
                            DISPLAY COMPONENTS
                        </h2>
                        <p class='text-muted-foreground'>
                            Badges, alerts, skeletons, and visual elements
                        </p>
                    </div>

                    {/* Badge */}
                    <div class='space-y-4'>
                        <h3 class='font-pixel text-[10px] text-foreground'>
                            BADGE
                        </h3>
                        <div class='flex flex-wrap gap-3 items-center p-6 bg-card'>
                            <Badge>Default</Badge>
                            <Badge variant='secondary'>Secondary</Badge>
                            <Badge variant='destructive'>Destructive</Badge>
                            <Badge variant='outline'>Outline</Badge>
                        </div>
                    </div>

                    {/* Alert */}
                    <div class='space-y-4'>
                        <h3 class='font-pixel text-[10px] text-foreground'>
                            ALERT
                        </h3>
                        <div class='space-y-4'>
                            <Alert>
                                <AlertTitle>Heads up!</AlertTitle>
                                <AlertDescription>
                                    You can add components to your app using the
                                    CLI.
                                </AlertDescription>
                            </Alert>
                            <Alert variant='destructive'>
                                <AlertTitle>Error</AlertTitle>
                                <AlertDescription>
                                    Your session has expired. Please log in
                                    again.
                                </AlertDescription>
                            </Alert>
                        </div>
                    </div>

                    {/* Separator */}
                    <div class='space-y-4'>
                        <h3 class='font-pixel text-[10px] text-foreground'>
                            SEPARATOR
                        </h3>
                        <Card>
                            <CardContent class='p-6 space-y-4'>
                                <div>Content Above</div>
                                <Separator />
                                <div>Content Below</div>
                                <div class='flex items-center h-5 space-x-4 text-sm'>
                                    <div>Item 1</div>
                                    <Separator orientation='vertical' />
                                    <div>Item 2</div>
                                    <Separator orientation='vertical' />
                                    <div>Item 3</div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Skeleton */}
                    <div class='space-y-4'>
                        <h3 class='font-pixel text-[10px] text-foreground'>
                            SKELETON
                        </h3>
                        <Card>
                            <CardContent class='p-6 space-y-4'>
                                <div class='flex items-center space-x-4'>
                                    <Skeleton class='h-12 w-12 rounded-full' />
                                    <div class='space-y-2'>
                                        <Skeleton class='h-4 w-[250px]' />
                                        <Skeleton class='h-4 w-[200px]' />
                                    </div>
                                </div>
                                <Skeleton class='h-[125px] w-full rounded-xl' />
                            </CardContent>
                        </Card>
                    </div>

                    {/* Kbd */}
                    <div class='space-y-4'>
                        <h3 class='font-pixel text-[10px] text-foreground'>
                            KEYBOARD SHORTCUT (KBD)
                        </h3>
                        <Card>
                            <CardContent class='p-6 space-y-3'>
                                <div class='flex items-center gap-2'>
                                    <span>Press</span>
                                    <Kbd>⌘</Kbd>
                                    <span>+</span>
                                    <Kbd>K</Kbd>
                                    <span>to open command palette</span>
                                </div>
                                <div class='flex items-center gap-2'>
                                    <span>Use</span>
                                    <Kbd>Ctrl</Kbd>
                                    <span>+</span>
                                    <Kbd>C</Kbd>
                                    <span>to copy</span>
                                </div>
                                <div class='flex items-center gap-2'>
                                    <Kbd>Esc</Kbd>
                                    <span>to close dialog</span>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </section>

                {/* Navigation Components Section */}
                <section class='space-y-6'>
                    <div class='pb-3'>
                        <h2 class='font-pixel text-lg text-foreground mb-2'>
                            NAVIGATION COMPONENTS
                        </h2>
                        <p class='text-muted-foreground'>
                            Breadcrumbs and tabs for content organization
                        </p>
                    </div>

                    {/* Breadcrumb */}
                    <div class='space-y-4'>
                        <h3 class='font-pixel text-[10px] text-foreground'>
                            BREADCRUMB
                        </h3>
                        <Card>
                            <CardContent class='p-6'>
                                <Breadcrumb>
                                    <BreadcrumbList>
                                        <BreadcrumbItem>
                                            <BreadcrumbLink href='/'>
                                                Home
                                            </BreadcrumbLink>
                                        </BreadcrumbItem>
                                        <BreadcrumbSeparator />
                                        <BreadcrumbItem>
                                            <BreadcrumbLink href='/products'>
                                                Products
                                            </BreadcrumbLink>
                                        </BreadcrumbItem>
                                        <BreadcrumbSeparator />
                                        <BreadcrumbItem>
                                            <BreadcrumbPage>
                                                Current Page
                                            </BreadcrumbPage>
                                        </BreadcrumbItem>
                                    </BreadcrumbList>
                                </Breadcrumb>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Tabs */}
                    <div class='space-y-4'>
                        <h3 class='font-pixel text-[10px] text-foreground'>
                            TABS
                        </h3>
                        <Card>
                            <CardContent class='p-6'>
                                <Tabs name='demo-tabs'>
                                    <TabsList>
                                        <TabsTrigger
                                            value='account'
                                            name='demo-tabs'
                                            checked
                                        >
                                            Account
                                        </TabsTrigger>
                                        <TabsTrigger
                                            value='password'
                                            name='demo-tabs'
                                        >
                                            Password
                                        </TabsTrigger>
                                        <TabsTrigger
                                            value='settings'
                                            name='demo-tabs'
                                        >
                                            Settings
                                        </TabsTrigger>
                                    </TabsList>
                                    <TabsContent
                                        value='account'
                                        name='demo-tabs'
                                    >
                                        <p class='text-muted-foreground py-4'>
                                            Manage your account settings and
                                            preferences.
                                        </p>
                                    </TabsContent>
                                    <TabsContent
                                        value='password'
                                        name='demo-tabs'
                                    >
                                        <p class='text-muted-foreground py-4'>
                                            Change your password and security
                                            settings.
                                        </p>
                                    </TabsContent>
                                    <TabsContent
                                        value='settings'
                                        name='demo-tabs'
                                    >
                                        <p class='text-muted-foreground py-4'>
                                            Configure application settings.
                                        </p>
                                    </TabsContent>
                                </Tabs>
                                <div class='mt-4'>
                                    <Link
                                        href='/ui/tabs'
                                        variant='outline'
                                        size='sm'
                                    >
                                        View Advanced Tabs Demo →
                                    </Link>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </section>

                {/* Layout Components Section */}
                <section class='space-y-6'>
                    <div class='pb-3'>
                        <h2 class='font-pixel text-lg text-foreground mb-2'>
                            LAYOUT COMPONENTS
                        </h2>
                        <p class='text-muted-foreground'>
                            Accordion for collapsible content sections
                        </p>
                    </div>

                    {/* Accordion */}
                    <div class='space-y-4'>
                        <h3 class='font-pixel text-[10px] text-foreground'>
                            ACCORDION
                        </h3>
                        <Accordion>
                            <AccordionItem value='item-1'>
                                <AccordionTrigger>
                                    Is it accessible?
                                </AccordionTrigger>
                                <AccordionContent>
                                    Yes. It adheres to the WAI-ARIA design
                                    pattern and uses native HTML details/summary
                                    elements.
                                </AccordionContent>
                            </AccordionItem>
                            <AccordionItem value='item-2'>
                                <AccordionTrigger>
                                    Is it styled?
                                </AccordionTrigger>
                                <AccordionContent>
                                    Yes. It comes with default styles that use
                                    CSS variables for easy theming.
                                </AccordionContent>
                            </AccordionItem>
                            <AccordionItem value='item-3'>
                                <AccordionTrigger>
                                    Can it be animated?
                                </AccordionTrigger>
                                <AccordionContent>
                                    Yes. The component uses CSS transitions for
                                    smooth expand/collapse animations.
                                </AccordionContent>
                            </AccordionItem>
                        </Accordion>
                    </div>
                </section>

                {/* Usage Examples */}
                <section class='space-y-6'>
                    <div class='pb-3'>
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
                                    <code class='block px-4 py-3 bg-background text-sm font-pixel-body'>
                                        # Add a single component
                                        <br />
                                        deno run -A jsr:@lockness/ui add button
                                    </code>
                                    <code class='block px-4 py-3 bg-background text-sm font-pixel-body'>
                                        # Add multiple components
                                        <br />
                                        deno run -A jsr:@lockness/ui add button
                                        card
                                    </code>
                                    <code class='block px-4 py-3 bg-background text-sm font-pixel-body'>
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
                                <code class='block px-4 py-3 bg-background text-sm font-pixel-body'>
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
            </div>
        </PageUiLayout>
    )
}
