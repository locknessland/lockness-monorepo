import {
    Badge,
    Card,
    CardContent,
    CodeBlock,
    PricingCard,
    PricingCardAction,
    PricingCardDescription,
    PricingCardFeature,
    PricingCardFeatures,
    PricingCardHeader,
    PricingCardPrice,
    PricingComparison,
    PricingSection,
    PricingToggle,
    Section,
    SectionContent,
    SectionDescription,
    SectionHeader,
    SectionTitle,
} from '@lockness/ui/components'
import { PageUiLayout } from '@view/layouts/ui_layout.tsx'

export const PricingPage = () => {
    return (
        <PageUiLayout title='Pricing - Lockness UI' currentPath='/ui/pricing'>
            <div class='space-y-12 max-w-full'>
                <header>
                    <h1 class='font-pixel text-2xl text-foreground mb-2'>
                        PRICING
                    </h1>
                    <p class='text-lg text-muted-foreground'>
                        Flexible, customizable pricing components for SaaS
                        landing pages with 2-tier, 3-tier layouts, billing
                        toggles, and feature comparison tables.
                    </p>
                </header>

                {/* Two-Tier Layout */}
                <Section>
                    <SectionHeader>
                        <SectionTitle>Two-Tier Layout</SectionTitle>
                        <SectionDescription>
                            Perfect for simple pricing with free and paid tiers.
                        </SectionDescription>
                    </SectionHeader>
                    <SectionContent>
                        <PricingSection columns={2}>
                            <PricingCard>
                                <PricingCardHeader title='Starter' />
                                <PricingCardPrice
                                    price={0}
                                    description='Free forever'
                                />
                                <PricingCardDescription>
                                    Perfect for individuals and small projects
                                </PricingCardDescription>
                                <PricingCardFeatures>
                                    <PricingCardFeature>
                                        Up to 3 projects
                                    </PricingCardFeature>
                                    <PricingCardFeature>
                                        1 GB storage
                                    </PricingCardFeature>
                                    <PricingCardFeature>
                                        Community support
                                    </PricingCardFeature>
                                    <PricingCardFeature included={false}>
                                        Advanced analytics
                                    </PricingCardFeature>
                                    <PricingCardFeature included={false}>
                                        Priority support
                                    </PricingCardFeature>
                                </PricingCardFeatures>
                                <PricingCardAction
                                    href='/signup'
                                    variant='outline'
                                >
                                    Get Started Free
                                </PricingCardAction>
                            </PricingCard>

                            <PricingCard featured>
                                <PricingCardHeader
                                    title='Pro'
                                    badge='Popular'
                                />
                                <PricingCardPrice price={29} period='month' />
                                <PricingCardDescription>
                                    For professionals and growing teams
                                </PricingCardDescription>
                                <PricingCardFeatures>
                                    <PricingCardFeature>
                                        Unlimited projects
                                    </PricingCardFeature>
                                    <PricingCardFeature>
                                        50 GB storage
                                    </PricingCardFeature>
                                    <PricingCardFeature>
                                        Email support
                                    </PricingCardFeature>
                                    <PricingCardFeature>
                                        Advanced analytics
                                    </PricingCardFeature>
                                    <PricingCardFeature>
                                        Priority support
                                    </PricingCardFeature>
                                </PricingCardFeatures>
                                <PricingCardAction href='/signup'>
                                    Start Free Trial
                                </PricingCardAction>
                            </PricingCard>
                        </PricingSection>

                        <div class='mt-8'>
                            <CodeBlock lang='tsx'>
                                {`import {
  PricingSection,
  PricingCard,
  PricingCardHeader,
  PricingCardPrice,
  PricingCardDescription,
  PricingCardFeatures,
  PricingCardFeature,
  PricingCardAction,
} from '@lockness/ui/components'

<PricingSection columns={2}>
  <PricingCard>
    <PricingCardHeader title="Starter" />
    <PricingCardPrice price={0} description="Free forever" />
    <PricingCardDescription>
      Perfect for individuals and small projects
    </PricingCardDescription>
    <PricingCardFeatures>
      <PricingCardFeature>Up to 3 projects</PricingCardFeature>
      <PricingCardFeature included={false}>Priority support</PricingCardFeature>
    </PricingCardFeatures>
    <PricingCardAction href="/signup" variant="outline">
      Get Started Free
    </PricingCardAction>
  </PricingCard>
  
  <PricingCard featured>
    <PricingCardHeader title="Pro" badge="Popular" />
    <PricingCardPrice price={29} period="month" />
    <PricingCardAction href="/signup">Start Free Trial</PricingCardAction>
  </PricingCard>
</PricingSection>`}
                            </CodeBlock>
                        </div>
                    </SectionContent>
                </Section>

                {/* Three-Tier Layout */}
                <Section>
                    <SectionHeader>
                        <SectionTitle>Three-Tier Layout</SectionTitle>
                        <SectionDescription>
                            Full pricing structure with free, pro, and
                            enterprise tiers.
                        </SectionDescription>
                    </SectionHeader>
                    <SectionContent>
                        <PricingSection columns={3}>
                            <PricingCard>
                                <PricingCardHeader title='Free' />
                                <PricingCardPrice
                                    price={0}
                                    description='No credit card required'
                                />
                                <PricingCardDescription>
                                    Get started with the basics
                                </PricingCardDescription>
                                <PricingCardFeatures>
                                    <PricingCardFeature>
                                        5 projects
                                    </PricingCardFeature>
                                    <PricingCardFeature>
                                        2 GB storage
                                    </PricingCardFeature>
                                    <PricingCardFeature>
                                        Community forum
                                    </PricingCardFeature>
                                    <PricingCardFeature included={false}>
                                        Custom domain
                                    </PricingCardFeature>
                                    <PricingCardFeature included={false}>
                                        API access
                                    </PricingCardFeature>
                                </PricingCardFeatures>
                                <PricingCardAction
                                    href='/signup'
                                    variant='outline'
                                >
                                    Sign Up
                                </PricingCardAction>
                            </PricingCard>

                            <PricingCard featured>
                                <PricingCardHeader
                                    title='Pro'
                                    badge='Most Popular'
                                />
                                <PricingCardPrice price={49} period='month' />
                                <PricingCardDescription>
                                    Everything you need to scale
                                </PricingCardDescription>
                                <PricingCardFeatures>
                                    <PricingCardFeature>
                                        Unlimited projects
                                    </PricingCardFeature>
                                    <PricingCardFeature>
                                        100 GB storage
                                    </PricingCardFeature>
                                    <PricingCardFeature>
                                        Priority email support
                                    </PricingCardFeature>
                                    <PricingCardFeature>
                                        Custom domain
                                    </PricingCardFeature>
                                    <PricingCardFeature>
                                        API access
                                    </PricingCardFeature>
                                </PricingCardFeatures>
                                <PricingCardAction href='/signup'>
                                    Start Free Trial
                                </PricingCardAction>
                            </PricingCard>

                            <PricingCard>
                                <PricingCardHeader
                                    title='Enterprise'
                                    badge='Custom'
                                    badgeVariant='secondary'
                                />
                                <PricingCardPrice
                                    price='Custom'
                                    description='Contact us for pricing'
                                />
                                <PricingCardDescription>
                                    Advanced features for large teams
                                </PricingCardDescription>
                                <PricingCardFeatures>
                                    <PricingCardFeature>
                                        Everything in Pro
                                    </PricingCardFeature>
                                    <PricingCardFeature>
                                        Unlimited storage
                                    </PricingCardFeature>
                                    <PricingCardFeature>
                                        24/7 phone support
                                    </PricingCardFeature>
                                    <PricingCardFeature>
                                        Dedicated account manager
                                    </PricingCardFeature>
                                    <PricingCardFeature>
                                        Custom integrations
                                    </PricingCardFeature>
                                </PricingCardFeatures>
                                <PricingCardAction
                                    href='/contact'
                                    variant='outline'
                                >
                                    Contact Sales
                                </PricingCardAction>
                            </PricingCard>
                        </PricingSection>

                        <div class='mt-8'>
                            <CodeBlock lang='tsx'>
                                {`<PricingSection columns={3}>
  <PricingCard>
    <PricingCardHeader title="Free" />
    <PricingCardPrice price={0} description="No credit card required" />
    <PricingCardFeatures>...</PricingCardFeatures>
    <PricingCardAction href="/signup" variant="outline">Sign Up</PricingCardAction>
  </PricingCard>
  
  <PricingCard featured>
    <PricingCardHeader title="Pro" badge="Most Popular" />
    <PricingCardPrice price={49} period="month" />
    <PricingCardFeatures>...</PricingCardFeatures>
    <PricingCardAction href="/signup">Start Free Trial</PricingCardAction>
  </PricingCard>
  
  <PricingCard>
    <PricingCardHeader title="Enterprise" badge="Custom" badgeVariant="secondary" />
    <PricingCardPrice price="Custom" description="Contact us for pricing" />
    <PricingCardFeatures>...</PricingCardFeatures>
    <PricingCardAction href="/contact" variant="outline">Contact Sales</PricingCardAction>
  </PricingCard>
</PricingSection>`}
                            </CodeBlock>
                        </div>
                    </SectionContent>
                </Section>

                {/* Billing Toggle */}
                <Section>
                    <SectionHeader>
                        <SectionTitle>Monthly/Yearly Toggle</SectionTitle>
                        <SectionDescription>
                            Toggle between monthly and yearly billing with
                            discount badge. Implement toggle logic with
                            JavaScript/Alpine.js/Unpoly.
                        </SectionDescription>
                    </SectionHeader>
                    <SectionContent>
                        <div class='max-w-4xl mx-auto'>
                            <PricingToggle
                                selected='yearly'
                                yearlyBadge='Save 20%'
                            />

                            <PricingSection columns={2}>
                                <PricingCard>
                                    <PricingCardHeader title='Pro Monthly' />
                                    <PricingCardPrice
                                        price={29}
                                        period='month'
                                    />
                                    <PricingCardFeatures>
                                        <PricingCardFeature>
                                            Unlimited projects
                                        </PricingCardFeature>
                                        <PricingCardFeature>
                                            50 GB storage
                                        </PricingCardFeature>
                                    </PricingCardFeatures>
                                    <PricingCardAction href='/signup'>
                                        Subscribe
                                    </PricingCardAction>
                                </PricingCard>

                                <PricingCard featured>
                                    <PricingCardHeader
                                        title='Pro Yearly'
                                        badge='Best Value'
                                    />
                                    <PricingCardPrice
                                        price={278}
                                        period='year'
                                        originalPrice={348}
                                        description='Save $70 per year'
                                    />
                                    <PricingCardFeatures>
                                        <PricingCardFeature>
                                            Everything in Monthly
                                        </PricingCardFeature>
                                        <PricingCardFeature>
                                            2 months free
                                        </PricingCardFeature>
                                    </PricingCardFeatures>
                                    <PricingCardAction href='/signup'>
                                        Subscribe Yearly
                                    </PricingCardAction>
                                </PricingCard>
                            </PricingSection>
                        </div>

                        <div class='mt-8'>
                            <CodeBlock lang='tsx'>
                                {`import { PricingToggle } from '@lockness/ui/components'

<PricingToggle selected="yearly" yearlyBadge="Save 20%" />

<PricingSection columns={2}>
  <PricingCard>
    <PricingCardHeader title="Pro Monthly" />
    <PricingCardPrice price={29} period="month" />
    <PricingCardAction href="/signup">Subscribe</PricingCardAction>
  </PricingCard>
  
  <PricingCard featured>
    <PricingCardHeader title="Pro Yearly" badge="Best Value" />
    <PricingCardPrice 
      price={278} 
      period="year" 
      originalPrice={348}
      description="Save $70 per year"
    />
    <PricingCardAction href="/signup">Subscribe Yearly</PricingCardAction>
  </PricingCard>
</PricingSection>`}
                            </CodeBlock>
                        </div>
                    </SectionContent>
                </Section>

                {/* Feature Comparison Table */}
                <Section>
                    <SectionHeader>
                        <SectionTitle>Feature Comparison Table</SectionTitle>
                        <SectionDescription>
                            Detailed feature comparison across all pricing
                            tiers.
                        </SectionDescription>
                    </SectionHeader>
                    <SectionContent>
                        <Card>
                            <CardContent class='p-6'>
                                <PricingComparison
                                    tiers={['Free', 'Pro', 'Enterprise']}
                                    features={[
                                        ['Projects', '5', '50', 'Unlimited'],
                                        ['Storage', '2 GB', '100 GB', '1 TB'],
                                        [
                                            'Team Members',
                                            '1',
                                            '10',
                                            'Unlimited',
                                        ],
                                        ['API Access', false, true, true],
                                        ['Custom Domain', false, true, true],
                                        [
                                            'Support',
                                            'Community',
                                            'Email',
                                            '24/7 Phone',
                                        ],
                                        [
                                            'Analytics',
                                            'Basic',
                                            'Advanced',
                                            'Custom',
                                        ],
                                        [
                                            'Integrations',
                                            'Limited',
                                            'All',
                                            'Custom',
                                        ],
                                        ['SSO', false, false, true],
                                        ['SLA', false, '99.9%', '99.99%'],
                                    ]}
                                />
                            </CardContent>
                        </Card>

                        <div class='mt-8'>
                            <CodeBlock lang='tsx'>
                                {`import { PricingComparison } from '@lockness/ui/components'

<PricingComparison
  tiers={['Free', 'Pro', 'Enterprise']}
  features={[
    ['Projects', '5', '50', 'Unlimited'],
    ['Storage', '2 GB', '100 GB', '1 TB'],
    ['API Access', false, true, true],
    ['Custom Domain', false, true, true],
    ['Support', 'Community', 'Email', '24/7 Phone'],
    ['SSO', false, false, true],
  ]}
/>`}
                            </CodeBlock>
                        </div>
                    </SectionContent>
                </Section>

                {/* Props Reference */}
                <Section>
                    <SectionHeader>
                        <SectionTitle>Component Props</SectionTitle>
                        <SectionDescription>
                            Reference for all available component properties.
                        </SectionDescription>
                    </SectionHeader>
                    <SectionContent>
                        <div class='space-y-6'>
                            {/* PricingCard Props */}
                            <Card>
                                <CardContent class='p-6'>
                                    <h3 class='font-semibold text-lg mb-4'>
                                        PricingCard
                                    </h3>
                                    <dl class='space-y-2 text-sm'>
                                        <div class='flex gap-4'>
                                            <dt class='font-mono text-muted-foreground min-w-32'>
                                                featured
                                            </dt>
                                            <dd>
                                                <Badge
                                                    variant='outline'
                                                    class='mr-2'
                                                >
                                                    boolean
                                                </Badge>
                                                Emphasize this tier with border
                                                and scale
                                            </dd>
                                        </div>
                                        <div class='flex gap-4'>
                                            <dt class='font-mono text-muted-foreground min-w-32'>
                                                class
                                            </dt>
                                            <dd>
                                                <Badge
                                                    variant='outline'
                                                    class='mr-2'
                                                >
                                                    string
                                                </Badge>
                                                Additional CSS classes
                                            </dd>
                                        </div>
                                    </dl>
                                </CardContent>
                            </Card>

                            {/* PricingCardHeader Props */}
                            <Card>
                                <CardContent class='p-6'>
                                    <h3 class='font-semibold text-lg mb-4'>
                                        PricingCardHeader
                                    </h3>
                                    <dl class='space-y-2 text-sm'>
                                        <div class='flex gap-4'>
                                            <dt class='font-mono text-muted-foreground min-w-32'>
                                                title
                                            </dt>
                                            <dd>
                                                <Badge
                                                    variant='outline'
                                                    class='mr-2'
                                                >
                                                    string
                                                </Badge>
                                                <Badge class='mr-2'>
                                                    required
                                                </Badge>
                                                Tier name
                                            </dd>
                                        </div>
                                        <div class='flex gap-4'>
                                            <dt class='font-mono text-muted-foreground min-w-32'>
                                                badge
                                            </dt>
                                            <dd>
                                                <Badge
                                                    variant='outline'
                                                    class='mr-2'
                                                >
                                                    string
                                                </Badge>
                                                Optional badge text (e.g.,
                                                "Popular")
                                            </dd>
                                        </div>
                                        <div class='flex gap-4'>
                                            <dt class='font-mono text-muted-foreground min-w-32'>
                                                badgeVariant
                                            </dt>
                                            <dd>
                                                <Badge
                                                    variant='outline'
                                                    class='mr-2'
                                                >
                                                    string
                                                </Badge>
                                                Badge style variant
                                            </dd>
                                        </div>
                                    </dl>
                                </CardContent>
                            </Card>

                            {/* PricingCardPrice Props */}
                            <Card>
                                <CardContent class='p-6'>
                                    <h3 class='font-semibold text-lg mb-4'>
                                        PricingCardPrice
                                    </h3>
                                    <dl class='space-y-2 text-sm'>
                                        <div class='flex gap-4'>
                                            <dt class='font-mono text-muted-foreground min-w-32'>
                                                price
                                            </dt>
                                            <dd>
                                                <Badge
                                                    variant='outline'
                                                    class='mr-2'
                                                >
                                                    number | string
                                                </Badge>
                                                <Badge class='mr-2'>
                                                    required
                                                </Badge>
                                                Price amount
                                            </dd>
                                        </div>
                                        <div class='flex gap-4'>
                                            <dt class='font-mono text-muted-foreground min-w-32'>
                                                currency
                                            </dt>
                                            <dd>
                                                <Badge
                                                    variant='outline'
                                                    class='mr-2'
                                                >
                                                    string
                                                </Badge>
                                                Currency symbol (default: "$")
                                            </dd>
                                        </div>
                                        <div class='flex gap-4'>
                                            <dt class='font-mono text-muted-foreground min-w-32'>
                                                period
                                            </dt>
                                            <dd>
                                                <Badge
                                                    variant='outline'
                                                    class='mr-2'
                                                >
                                                    string
                                                </Badge>
                                                Billing period (e.g., "month")
                                            </dd>
                                        </div>
                                        <div class='flex gap-4'>
                                            <dt class='font-mono text-muted-foreground min-w-32'>
                                                originalPrice
                                            </dt>
                                            <dd>
                                                <Badge
                                                    variant='outline'
                                                    class='mr-2'
                                                >
                                                    number | string
                                                </Badge>
                                                Original price for discounts
                                            </dd>
                                        </div>
                                        <div class='flex gap-4'>
                                            <dt class='font-mono text-muted-foreground min-w-32'>
                                                description
                                            </dt>
                                            <dd>
                                                <Badge
                                                    variant='outline'
                                                    class='mr-2'
                                                >
                                                    string
                                                </Badge>
                                                Additional description
                                            </dd>
                                        </div>
                                    </dl>
                                </CardContent>
                            </Card>

                            {/* PricingCardFeature Props */}
                            <Card>
                                <CardContent class='p-6'>
                                    <h3 class='font-semibold text-lg mb-4'>
                                        PricingCardFeature
                                    </h3>
                                    <dl class='space-y-2 text-sm'>
                                        <div class='flex gap-4'>
                                            <dt class='font-mono text-muted-foreground min-w-32'>
                                                included
                                            </dt>
                                            <dd>
                                                <Badge
                                                    variant='outline'
                                                    class='mr-2'
                                                >
                                                    boolean
                                                </Badge>
                                                Whether feature is included
                                                (default: true)
                                            </dd>
                                        </div>
                                    </dl>
                                </CardContent>
                            </Card>
                        </div>
                    </SectionContent>
                </Section>

                {/* Usage Notes */}
                <Section>
                    <SectionHeader>
                        <SectionTitle>Usage Notes</SectionTitle>
                    </SectionHeader>
                    <SectionContent>
                        <Card>
                            <CardContent class='p-6 space-y-4'>
                                <div>
                                    <h4 class='font-semibold mb-2'>
                                        Accessibility
                                    </h4>
                                    <p class='text-sm text-muted-foreground'>
                                        All pricing components are built with
                                        semantic HTML and proper ARIA labels for
                                        screen readers.
                                    </p>
                                </div>
                                <div>
                                    <h4 class='font-semibold mb-2'>
                                        Responsive Design
                                    </h4>
                                    <p class='text-sm text-muted-foreground'>
                                        Pricing sections automatically adjust to
                                        single column on mobile devices and
                                        expand to grid layouts on larger
                                        screens.
                                    </p>
                                </div>
                                <div>
                                    <h4 class='font-semibold mb-2'>
                                        Theming
                                    </h4>
                                    <p class='text-sm text-muted-foreground'>
                                        All colors and spacing use CSS variables
                                        from the design system. Customize via
                                        your theme configuration.
                                    </p>
                                </div>
                                <div>
                                    <h4 class='font-semibold mb-2'>
                                        Interactive Toggle
                                    </h4>
                                    <p class='text-sm text-muted-foreground'>
                                        PricingToggle is a UI component. For
                                        functional monthly/yearly switching,
                                        implement logic with JavaScript,
                                        Alpine.js, or Unpoly attributes.
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    </SectionContent>
                </Section>
            </div>
        </PageUiLayout>
    )
}
