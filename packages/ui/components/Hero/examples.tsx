/**
 * @fileoverview Live examples for Hero component
 */

import { Card, CardContent } from '../Card/mod.tsx'
import { CodeBlock } from '../CodeBlock/mod.tsx'
import { createDocsSection } from '../../docs_renderer.tsx'
import {
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
} from './mod.tsx'

export interface ExampleSection {
    title: string
    description?: string
    render: () => unknown
}

export const examples: ExampleSection[] = [
    // Documentation section - renders DOCS.md content
    createDocsSection('Hero'),
    {
        title: 'Complete Example',
        render: () => (
            <div class='space-y-4'>
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
                                Lockness UI is an open-source set of prebuilt UI
                                components, ready-to-use examples based on the
                                utility-first Tailwind CSS framework.
                            </HeroSubtitle>
                            <HeroActions>
                                <HeroCTA href='#'>Get started</HeroCTA>
                                <HeroCommand command='deno add @lockness/ui' />
                            </HeroActions>
                            <HeroFooter>
                                <HeroBadge label='Runtime'>Deno</HeroBadge>
                                <HeroSeparator />
                                <HeroLink href='#'>Installation Guide</HeroLink>
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
            </div>
        ),
    },
    {
        title: 'Background Variants',
        description: 'Choose from different background styles.',
        render: () => (
            <div class='space-y-4'>
                <h3 class='font-medium text-foreground mt-6'>None (Default)</h3>
                <Card>
                    <CardContent class='p-0 overflow-hidden rounded-(--radius)'>
                        <Hero background='none' size='sm'>
                            <HeroTitle size='sm'>Clean Background</HeroTitle>
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
                            <HeroTitle size='sm'>Gradient Background</HeroTitle>
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
                            <HeroSubtitle>Grid lines background.</HeroSubtitle>
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
            </div>
        ),
    },
    {
        title: 'Title Gradients',
        description: 'Add gradient text to your titles.',
        render: () => (
            <div class='space-y-4'>
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
            </div>
        ),
    },
    {
        title: 'Title Sizes',
        render: () => (
            <div class='space-y-4'>
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
            </div>
        ),
    },
    {
        title: 'Announcement Banner',
        description: 'A pill-style banner for announcements and promotions.',
        render: () => (
            <div class='space-y-4'>
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
            </div>
        ),
    },
    {
        title: 'CTA Button Variants',
        render: () => (
            <div class='space-y-4'>
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
            </div>
        ),
    },
    {
        title: 'CTA Sizes',
        render: () => (
            <div class='space-y-4'>
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
            </div>
        ),
    },
    {
        title: 'Command Button',
        description: 'A copyable command/code display button.',
        render: () => (
            <div class='space-y-4'>
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
            </div>
        ),
    },
    {
        title: 'Hero Footer',
        description: 'Footer section for additional links and metadata.',
        render: () => (
            <div class='space-y-4'>
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
            </div>
        ),
    },
    {
        title: 'Hero Sizes',
        description: 'Control the vertical padding of the hero section.',
        render: () => (
            <div class='space-y-4'>
                <CodeBlock lang='tsx'>
                    {`<Hero size="sm">...</Hero>   {/* py-12 md:py-16 */}
<Hero size="md">...</Hero>   {/* py-16 md:py-24 */}
<Hero size="lg">...</Hero>   {/* py-24 md:py-32 - default */}
<Hero size="xl">...</Hero>   {/* py-32 md:py-48 */}`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Simple Example',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-0 overflow-hidden rounded-(--radius)'>
                        <Hero background='gradient' size='md'>
                            <HeroTitle>Welcome to Lockness</HeroTitle>
                            <HeroSubtitle>
                                Build fast, modern web applications with Deno.
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
            </div>
        ),
    },
    {
        title: 'With Image',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-0 overflow-hidden rounded-(--radius)'>
                        <Hero background='dots' size='md'>
                            <HeroTitle size='lg'>
                                Ship faster with components
                            </HeroTitle>
                            <HeroSubtitle maxWidth='lg'>
                                Pre-built, accessible components that help you
                                build beautiful UIs in record time.
                            </HeroSubtitle>
                            <HeroActions>
                                <HeroCTA href='#'>Browse Components</HeroCTA>
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
            </div>
        ),
    },
]
