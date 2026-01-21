import {
    Card,
    CardContent,
    CodeBlock,
    Hero,
    HeroActions,
    HeroAnnouncement,
    HeroBadge,
    HeroCommand,
    HeroCTA,
    HeroFooter,
    HeroImage,
    HeroLink,
    HeroSeparator,
    HeroSubtitle,
    HeroTitle,
} from '@lockness/ui/components'
import { PageUiLayout } from '@view/layouts/ui_layout.tsx'

export const HeroPage = () => {
    return (
        <PageUiLayout
            title='Hero - Lockness UI'
            noPadding
            currentPath='/ui/hero'
        >
            <div class='p-4 md:p-8 space-y-8 max-w-full'>
                <header>
                    <h1 class='font-pixel text-2xl text-foreground mb-2'>
                        HERO
                    </h1>
                    <p class='text-lg text-muted-foreground'>
                        Customizable hero sections for landing pages with
                        announcements, titles, CTAs, and more.
                    </p>
                </header>

                {/* Complete Example */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        COMPLETE EXAMPLE
                    </h2>
                    <Card>
                        <CardContent class='p-0 overflow-hidden rounded-(--radius)'>
                            <Hero background='pattern' size='lg'>
                                <HeroAnnouncement href='#' badge='New'>
                                    PRO release - Join the waitlist
                                </HeroAnnouncement>
                                <HeroTitle
                                    gradient='Together'
                                    gradientColors='blue-violet'
                                >
                                    Let's Build
                                </HeroTitle>
                                <HeroSubtitle>
                                    Lockness UI is an open-source set of
                                    prebuilt UI components, ready-to-use
                                    examples based on the utility-first Tailwind
                                    CSS framework.
                                </HeroSubtitle>
                                <HeroActions>
                                    <HeroCTA href='#'>Get started</HeroCTA>
                                    <HeroCommand command='deno add @lockness/ui' />
                                </HeroActions>
                                <HeroFooter>
                                    <HeroBadge label='Runtime'>Deno</HeroBadge>
                                    <HeroSeparator />
                                    <HeroLink href='#'>
                                        Installation Guide
                                    </HeroLink>
                                </HeroFooter>
                            </Hero>
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`import {
  Hero,
  HeroAnnouncement,
  HeroTitle,
  HeroSubtitle,
  HeroActions,
  HeroCTA,
  HeroCommand,
  HeroFooter,
  HeroBadge,
  HeroSeparator,
  HeroLink,
} from '@lockness/ui/components'

<Hero background="pattern" size="lg">
  <HeroAnnouncement href="#" badge="New">
    PRO release - Join the waitlist
  </HeroAnnouncement>
  <HeroTitle gradient="Together" gradientColors="blue-violet">
    Let's Build
  </HeroTitle>
  <HeroSubtitle>
    Your description here...
  </HeroSubtitle>
  <HeroActions>
    <HeroCTA href="#">Get started</HeroCTA>
    <HeroCommand command="deno add @lockness/ui" />
  </HeroActions>
  <HeroFooter>
    <HeroBadge label="Runtime">Deno</HeroBadge>
    <HeroSeparator />
    <HeroLink href="#">Installation Guide</HeroLink>
  </HeroFooter>
</Hero>`}
                    </CodeBlock>
                </section>

                {/* Background Variants */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        BACKGROUND VARIANTS
                    </h2>
                    <p class='text-muted-foreground'>
                        Choose from different background styles.
                    </p>

                    <h3 class='font-medium text-foreground mt-6'>
                        None (Default)
                    </h3>
                    <Card>
                        <CardContent class='p-0 overflow-hidden rounded-(--radius)'>
                            <Hero background='none' size='sm'>
                                <HeroTitle size='sm'>
                                    Clean Background
                                </HeroTitle>
                                <HeroSubtitle>
                                    No background decoration.
                                </HeroSubtitle>
                            </Hero>
                        </CardContent>
                    </Card>

                    <h3 class='font-medium text-foreground mt-6'>Gradient</h3>
                    <Card>
                        <CardContent class='p-0 overflow-hidden rounded-(--radius)'>
                            <Hero background='gradient' size='sm'>
                                <HeroTitle size='sm'>
                                    Gradient Background
                                </HeroTitle>
                                <HeroSubtitle>
                                    Subtle gradient from primary color.
                                </HeroSubtitle>
                            </Hero>
                        </CardContent>
                    </Card>

                    <h3 class='font-medium text-foreground mt-6'>Dots</h3>
                    <Card>
                        <CardContent class='p-0 overflow-hidden rounded-(--radius)'>
                            <Hero background='dots' size='sm'>
                                <HeroTitle size='sm'>Dots Pattern</HeroTitle>
                                <HeroSubtitle>
                                    Subtle dot grid background.
                                </HeroSubtitle>
                            </Hero>
                        </CardContent>
                    </Card>

                    <h3 class='font-medium text-foreground mt-6'>Grid</h3>
                    <Card>
                        <CardContent class='p-0 overflow-hidden rounded-(--radius)'>
                            <Hero background='grid' size='sm'>
                                <HeroTitle size='sm'>Grid Pattern</HeroTitle>
                                <HeroSubtitle>
                                    Grid lines background.
                                </HeroSubtitle>
                            </Hero>
                        </CardContent>
                    </Card>

                    <CodeBlock lang='tsx'>
                        {`<Hero background="none">...</Hero>
<Hero background="gradient">...</Hero>
<Hero background="dots">...</Hero>
<Hero background="grid">...</Hero>
<Hero background="pattern">...</Hero>`}
                    </CodeBlock>
                </section>

                {/* Title Gradients */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        TITLE GRADIENTS
                    </h2>
                    <p class='text-muted-foreground'>
                        Add gradient text to your titles.
                    </p>
                    <Card>
                        <CardContent class='p-6 space-y-6'>
                            <HeroTitle
                                size='sm'
                                gradient='Primary'
                                gradientColors='primary'
                            >
                                Gradient
                            </HeroTitle>
                            <HeroTitle
                                size='sm'
                                gradient='Violet'
                                gradientColors='blue-violet'
                            >
                                Blue to
                            </HeroTitle>
                            <HeroTitle
                                size='sm'
                                gradient='Teal'
                                gradientColors='green-teal'
                            >
                                Green to
                            </HeroTitle>
                            <HeroTitle
                                size='sm'
                                gradient='Red'
                                gradientColors='orange-red'
                            >
                                Orange to
                            </HeroTitle>
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<HeroTitle gradient="Primary" gradientColors="primary">
  Gradient
</HeroTitle>

<HeroTitle gradient="Violet" gradientColors="blue-violet">
  Blue to
</HeroTitle>

<HeroTitle gradient="Teal" gradientColors="green-teal">
  Green to
</HeroTitle>

<HeroTitle gradient="Red" gradientColors="orange-red">
  Orange to
</HeroTitle>`}
                    </CodeBlock>
                </section>

                {/* Title Sizes */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        TITLE SIZES
                    </h2>
                    <Card>
                        <CardContent class='p-6 space-y-4'>
                            <HeroTitle size='sm'>Small Title</HeroTitle>
                            <HeroTitle size='default'>Default Title</HeroTitle>
                            <HeroTitle size='lg'>Large Title</HeroTitle>
                            <HeroTitle size='xl'>Extra Large</HeroTitle>
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<HeroTitle size="sm">Small Title</HeroTitle>
<HeroTitle size="default">Default Title</HeroTitle>
<HeroTitle size="lg">Large Title</HeroTitle>
<HeroTitle size="xl">Extra Large</HeroTitle>`}
                    </CodeBlock>
                </section>

                {/* Announcement Banner */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        ANNOUNCEMENT BANNER
                    </h2>
                    <p class='text-muted-foreground'>
                        A pill-style banner for announcements and promotions.
                    </p>
                    <Card>
                        <CardContent class='p-6 space-y-4'>
                            <HeroAnnouncement href='#' badge='New'>
                                Check out our latest features
                            </HeroAnnouncement>
                            <HeroAnnouncement href='#' badge='🎉'>
                                Version 2.0 is here
                            </HeroAnnouncement>
                            <HeroAnnouncement>
                                Simple announcement without link
                            </HeroAnnouncement>
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<HeroAnnouncement href="#" badge="New">
  Check out our latest features
</HeroAnnouncement>

<HeroAnnouncement href="#" badge="🎉">
  Version 2.0 is here
</HeroAnnouncement>

<HeroAnnouncement>
  Simple announcement without link
</HeroAnnouncement>`}
                    </CodeBlock>
                </section>

                {/* CTA Buttons */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        CTA BUTTON VARIANTS
                    </h2>
                    <Card>
                        <CardContent class='p-6 flex flex-wrap gap-4'>
                            <HeroCTA variant='gradient' href='#'>
                                Gradient
                            </HeroCTA>
                            <HeroCTA variant='primary' href='#'>
                                Primary
                            </HeroCTA>
                            <HeroCTA variant='secondary' href='#'>
                                Secondary
                            </HeroCTA>
                            <HeroCTA variant='outline' href='#'>
                                Outline
                            </HeroCTA>
                            <HeroCTA variant='primary' showArrow={false}>
                                No Arrow
                            </HeroCTA>
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<HeroCTA variant="gradient" href="#">Gradient</HeroCTA>
<HeroCTA variant="primary" href="#">Primary</HeroCTA>
<HeroCTA variant="secondary" href="#">Secondary</HeroCTA>
<HeroCTA variant="outline" href="#">Outline</HeroCTA>
<HeroCTA variant="primary" showArrow={false}>No Arrow</HeroCTA>`}
                    </CodeBlock>
                </section>

                {/* CTA Sizes */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        CTA SIZES
                    </h2>
                    <Card>
                        <CardContent class='p-6 flex flex-wrap items-center gap-4'>
                            <HeroCTA size='sm' href='#'>
                                Small
                            </HeroCTA>
                            <HeroCTA size='default' href='#'>
                                Default
                            </HeroCTA>
                            <HeroCTA size='lg' href='#'>
                                Large
                            </HeroCTA>
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<HeroCTA size="sm" href="#">Small</HeroCTA>
<HeroCTA size="default" href="#">Default</HeroCTA>
<HeroCTA size="lg" href="#">Large</HeroCTA>`}
                    </CodeBlock>
                </section>

                {/* Command Button */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        COMMAND BUTTON
                    </h2>
                    <p class='text-muted-foreground'>
                        A copyable command/code display button.
                    </p>
                    <Card>
                        <CardContent class='p-6 flex flex-wrap gap-4'>
                            <HeroCommand command='npm install @lockness/ui' />
                            <HeroCommand command='deno add @lockness/ui' />
                            <HeroCommand command='pnpm add @lockness/ui' />
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<HeroCommand command="npm install @lockness/ui" />
<HeroCommand command="deno add @lockness/ui" />
<HeroCommand command="pnpm add @lockness/ui" />`}
                    </CodeBlock>
                </section>

                {/* Hero Footer */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        HERO FOOTER
                    </h2>
                    <p class='text-muted-foreground'>
                        Footer section for additional links and metadata.
                    </p>
                    <Card>
                        <CardContent class='p-6'>
                            <HeroFooter>
                                <HeroBadge label='Framework'>Deno</HeroBadge>
                                <HeroSeparator />
                                <HeroBadge label='License'>MIT</HeroBadge>
                                <HeroSeparator />
                                <HeroLink href='#'>Documentation</HeroLink>
                            </HeroFooter>
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<HeroFooter>
  <HeroBadge label="Framework">Deno</HeroBadge>
  <HeroSeparator />
  <HeroBadge label="License">MIT</HeroBadge>
  <HeroSeparator />
  <HeroLink href="#">Documentation</HeroLink>
</HeroFooter>`}
                    </CodeBlock>
                </section>

                {/* Hero Sizes */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        HERO SIZES
                    </h2>
                    <p class='text-muted-foreground'>
                        Control the vertical padding of the hero section.
                    </p>
                    <CodeBlock lang='tsx'>
                        {`<Hero size="sm">...</Hero>   {/* py-12 md:py-16 */}
<Hero size="md">...</Hero>   {/* py-16 md:py-24 */}
<Hero size="lg">...</Hero>   {/* py-24 md:py-32 - default */}
<Hero size="xl">...</Hero>   {/* py-32 md:py-48 */}`}
                    </CodeBlock>
                </section>

                {/* Simple Example */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        SIMPLE EXAMPLE
                    </h2>
                    <Card>
                        <CardContent class='p-0 overflow-hidden rounded-(--radius)'>
                            <Hero background='gradient' size='md'>
                                <HeroTitle>Welcome to Lockness</HeroTitle>
                                <HeroSubtitle>
                                    Build fast, modern web applications with
                                    Deno.
                                </HeroSubtitle>
                                <HeroActions>
                                    <HeroCTA variant='primary' href='#'>
                                        Get Started
                                    </HeroCTA>
                                    <HeroCTA variant='outline' href='#'>
                                        Learn More
                                    </HeroCTA>
                                </HeroActions>
                            </Hero>
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<Hero background="gradient" size="md">
  <HeroTitle>Welcome to Lockness</HeroTitle>
  <HeroSubtitle>
    Build fast, modern web applications with Deno.
  </HeroSubtitle>
  <HeroActions>
    <HeroCTA variant="primary" href="#">Get Started</HeroCTA>
    <HeroCTA variant="outline" href="#">Learn More</HeroCTA>
  </HeroActions>
</Hero>`}
                    </CodeBlock>
                </section>

                {/* With Image */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        WITH IMAGE
                    </h2>
                    <Card>
                        <CardContent class='p-0 overflow-hidden rounded-(--radius)'>
                            <Hero background='dots' size='md'>
                                <HeroTitle size='lg'>
                                    Ship faster with components
                                </HeroTitle>
                                <HeroSubtitle maxWidth='lg'>
                                    Pre-built, accessible components that help
                                    you build beautiful UIs in record time.
                                </HeroSubtitle>
                                <HeroActions>
                                    <HeroCTA href='#'>
                                        Browse Components
                                    </HeroCTA>
                                </HeroActions>
                                <HeroImage
                                    src='https://placehold.co/1200x600/1f2937/white?text=Dashboard+Preview'
                                    alt='Dashboard preview'
                                    position='bottom'
                                />
                            </Hero>
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<Hero background="dots" size="md">
  <HeroTitle size="lg">Ship faster with components</HeroTitle>
  <HeroSubtitle maxWidth="lg">
    Pre-built, accessible components...
  </HeroSubtitle>
  <HeroActions>
    <HeroCTA href="#">Browse Components</HeroCTA>
  </HeroActions>
  <HeroImage
    src="/images/dashboard.png"
    alt="Dashboard preview"
    position="bottom"
  />
</Hero>`}
                    </CodeBlock>
                </section>

                {/* Props Reference */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        PROPS REFERENCE
                    </h2>

                    <h3 class='font-medium text-foreground'>Hero</h3>
                    <Card>
                        <CardContent class='p-0'>
                            <div class='overflow-x-auto'>
                                <table class='w-full text-sm'>
                                    <thead>
                                        <tr class='border-b border-border'>
                                            <th class='text-left p-4 font-medium'>
                                                Prop
                                            </th>
                                            <th class='text-left p-4 font-medium'>
                                                Type
                                            </th>
                                            <th class='text-left p-4 font-medium'>
                                                Default
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody class='divide-y divide-border'>
                                        <tr>
                                            <td class='p-4 font-mono text-xs'>
                                                background
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                'none' | 'pattern' | 'gradient'
                                                | 'dots' | 'grid'
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                'none'
                                            </td>
                                        </tr>
                                        <tr>
                                            <td class='p-4 font-mono text-xs'>
                                                size
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                'sm' | 'md' | 'lg' | 'xl'
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                'lg'
                                            </td>
                                        </tr>
                                        <tr>
                                            <td class='p-4 font-mono text-xs'>
                                                align
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                'center' | 'left'
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                'center'
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>

                    <h3 class='font-medium text-foreground mt-6'>HeroTitle</h3>
                    <Card>
                        <CardContent class='p-0'>
                            <div class='overflow-x-auto'>
                                <table class='w-full text-sm'>
                                    <thead>
                                        <tr class='border-b border-border'>
                                            <th class='text-left p-4 font-medium'>
                                                Prop
                                            </th>
                                            <th class='text-left p-4 font-medium'>
                                                Type
                                            </th>
                                            <th class='text-left p-4 font-medium'>
                                                Default
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody class='divide-y divide-border'>
                                        <tr>
                                            <td class='p-4 font-mono text-xs'>
                                                size
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                'sm' | 'default' | 'lg' | 'xl'
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                'default'
                                            </td>
                                        </tr>
                                        <tr>
                                            <td class='p-4 font-mono text-xs'>
                                                gradient
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                string
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                -
                                            </td>
                                        </tr>
                                        <tr>
                                            <td class='p-4 font-mono text-xs'>
                                                gradientColors
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                'primary' | 'blue-violet' |
                                                'green-teal' | 'orange-red' |
                                                'custom'
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                'primary'
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>

                    <h3 class='font-medium text-foreground mt-6'>HeroCTA</h3>
                    <Card>
                        <CardContent class='p-0'>
                            <div class='overflow-x-auto'>
                                <table class='w-full text-sm'>
                                    <thead>
                                        <tr class='border-b border-border'>
                                            <th class='text-left p-4 font-medium'>
                                                Prop
                                            </th>
                                            <th class='text-left p-4 font-medium'>
                                                Type
                                            </th>
                                            <th class='text-left p-4 font-medium'>
                                                Default
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody class='divide-y divide-border'>
                                        <tr>
                                            <td class='p-4 font-mono text-xs'>
                                                href
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                string
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                -
                                            </td>
                                        </tr>
                                        <tr>
                                            <td class='p-4 font-mono text-xs'>
                                                variant
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                'gradient' | 'primary' |
                                                'secondary' | 'outline'
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                'gradient'
                                            </td>
                                        </tr>
                                        <tr>
                                            <td class='p-4 font-mono text-xs'>
                                                size
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                'sm' | 'default' | 'lg'
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                'default'
                                            </td>
                                        </tr>
                                        <tr>
                                            <td class='p-4 font-mono text-xs'>
                                                showArrow
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                boolean
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                true
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                </section>
            </div>
        </PageUiLayout>
    )
}
