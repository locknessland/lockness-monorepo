/**
 * @fileoverview Live examples for Pricing component
 */

import { Card, CardContent } from '../Card/mod.tsx'
import { CodeBlock } from '../CodeBlock/mod.tsx'
import { type PropDefinition, PropsTable } from '../PropsTable/mod.tsx'
import {
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
} from './mod.tsx'

export interface ExampleSection {
    title: string
    description?: string
    render: () => unknown
}

const pricingCardProps: PropDefinition[] = [
    {
        name: 'featured',
        type: 'boolean',
        default: 'false',
        description: 'Whether this tier is emphasized/featured',
    },
    {
        name: 'class',
        type: 'string',
        description: 'Additional CSS class names',
    },
]

const pricingCardHeaderProps: PropDefinition[] = [
    {
        name: 'title',
        type: 'string',
        required: true,
        description: 'Tier name displayed as the card title',
    },
    {
        name: 'badge',
        type: 'string',
        description: 'Optional badge text displayed above the title',
    },
    {
        name: 'badgeVariant',
        type: 'default | secondary | destructive | outline',
        default: 'default',
        description: 'Visual variant for the badge',
    },
    {
        name: 'class',
        type: 'string',
        description: 'Additional CSS class names',
    },
]

const pricingCardPriceProps: PropDefinition[] = [
    {
        name: 'price',
        type: 'number | string',
        required: true,
        description: 'Price value or custom text like "Custom"',
    },
    {
        name: 'period',
        type: 'string',
        default: 'month',
        description: 'Billing period (month, year, etc.)',
    },
    {
        name: 'currency',
        type: 'string',
        default: '$',
        description: 'Currency symbol',
    },
    {
        name: 'description',
        type: 'string',
        description: 'Optional description below price',
    },
]

export const examples: ExampleSection[] = [
    {
        title: 'Two-Tier Layout',
        description: 'Perfect for simple pricing with free and paid tiers.',
        render: () => (
            <div class='space-y-4'>
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
                        <PricingCardAction href='/signup' variant='outline'>
                            Get Started Free
                        </PricingCardAction>
                    </PricingCard>

                    <PricingCard featured>
                        <PricingCardHeader title='Pro' badge='Popular' />
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
        ),
    },
    {
        title: 'Three-Tier Layout',
        description:
            'Full pricing structure with free, pro, and enterprise tiers.',
        render: () => (
            <div class='space-y-4'>
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
                            <PricingCardFeature>5 projects</PricingCardFeature>
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
                        <PricingCardAction href='/signup' variant='outline'>
                            Sign Up
                        </PricingCardAction>
                    </PricingCard>

                    <PricingCard featured>
                        <PricingCardHeader title='Pro' badge='Most Popular' />
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
                            <PricingCardFeature>API access</PricingCardFeature>
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
                        <PricingCardAction href='/contact' variant='outline'>
                            Contact Sales
                        </PricingCardAction>
                    </PricingCard>
                </PricingSection>

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
        ),
    },
    {
        title: 'Monthly/Yearly Toggle',
        description:
            'Toggle between monthly and yearly billing with discount badge. Implement toggle logic with JavaScript/Alpine.js/Unpoly.',
        render: () => (
            <div class='space-y-4'>
                <div class='max-w-4xl mx-auto'>
                    <PricingToggle selected='yearly' yearlyBadge='Save 20%' />

                    <PricingSection columns={2}>
                        <PricingCard>
                            <PricingCardHeader title='Pro Monthly' />
                            <PricingCardPrice price={29} period='month' />
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
        ),
    },
    {
        title: 'Feature Comparison Table',
        description: 'Detailed feature comparison across all pricing tiers.',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <PricingComparison
                            tiers={['Free', 'Pro', 'Enterprise']}
                            features={[
                                ['Projects', '5', '50', 'Unlimited'],
                                ['Storage', '2 GB', '100 GB', '1 TB'],
                                ['Team Members', '1', '10', 'Unlimited'],
                                ['API Access', false, true, true],
                                ['Custom Domain', false, true, true],
                                ['Support', 'Community', 'Email', '24/7 Phone'],
                                ['Analytics', 'Basic', 'Advanced', 'Custom'],
                                ['Integrations', 'Limited', 'All', 'Custom'],
                                ['SSO', false, false, true],
                                ['SLA', false, '99.9%', '99.99%'],
                            ]}
                        />
                    </CardContent>
                </Card>

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
        ),
    },
    {
        title: 'Props',
        render: () => (
            <div class='space-y-6'>
                <PropsTable title='PricingCard' props={pricingCardProps} />
                <PropsTable
                    title='PricingCardHeader'
                    props={pricingCardHeaderProps}
                />
                <PropsTable
                    title='PricingCardPrice'
                    props={pricingCardPriceProps}
                />
            </div>
        ),
    },
]
