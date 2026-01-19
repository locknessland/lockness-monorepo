import { assertStringIncludes } from '@std/assert'
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
} from '../components/Pricing.tsx'

/**
 * Helper to render a component to string
 */
function renderToString(component: unknown): string {
    const result = component as unknown as { toString: () => string }
    return result.toString()
}

Deno.test('Pricing components', async (t) => {
    await t.step('PricingCard renders with base styles', () => {
        const html = renderToString(
            <PricingCard>
                <div>Content</div>
            </PricingCard>,
        )
        assertStringIncludes(html, 'rounded-(--radius)')
        assertStringIncludes(html, 'border')
        assertStringIncludes(html, 'Content')
    })

    await t.step('PricingCard renders with featured style', () => {
        const html = renderToString(
            <PricingCard featured>Content</PricingCard>,
        )
        assertStringIncludes(html, 'border-primary')
        assertStringIncludes(html, 'shadow-lg')
        assertStringIncludes(html, 'scale-105')
    })

    await t.step('PricingCardHeader renders with title', () => {
        const html = renderToString(
            <PricingCardHeader title='Pro Plan' />,
        )
        assertStringIncludes(html, 'Pro Plan')
        assertStringIncludes(html, 'text-center')
    })

    await t.step('PricingCardHeader renders with badge', () => {
        const html = renderToString(
            <PricingCardHeader title='Pro' badge='Popular' />,
        )
        assertStringIncludes(html, 'Pro')
        assertStringIncludes(html, 'Popular')
    })

    await t.step('PricingCardPrice renders with default currency', () => {
        const html = renderToString(<PricingCardPrice price={29} />)
        assertStringIncludes(html, '29')
        assertStringIncludes(html, '$')
    })

    await t.step('PricingCardPrice renders with custom currency', () => {
        const html = renderToString(
            <PricingCardPrice price={29} currency='€' />,
        )
        assertStringIncludes(html, '29')
        assertStringIncludes(html, '€')
    })

    await t.step('PricingCardPrice renders with period', () => {
        const html = renderToString(
            <PricingCardPrice price={29} period='month' />,
        )
        assertStringIncludes(html, '29')
        assertStringIncludes(html, '/month')
    })

    await t.step('PricingCardPrice renders with original price', () => {
        const html = renderToString(
            <PricingCardPrice price={29} originalPrice={49} />,
        )
        assertStringIncludes(html, '29')
        assertStringIncludes(html, '49')
        assertStringIncludes(html, 'line-through')
    })

    await t.step('PricingCardPrice renders with description', () => {
        const html = renderToString(
            <PricingCardPrice price={0} description='Free forever' />,
        )
        assertStringIncludes(html, '0')
        assertStringIncludes(html, 'Free forever')
    })

    await t.step('PricingCardPrice handles string price', () => {
        const html = renderToString(<PricingCardPrice price='Custom' />)
        assertStringIncludes(html, 'Custom')
    })

    await t.step('PricingCardDescription renders text', () => {
        const html = renderToString(
            <PricingCardDescription>
                Perfect for individuals
            </PricingCardDescription>,
        )
        assertStringIncludes(html, 'Perfect for individuals')
        assertStringIncludes(html, 'text-center')
    })

    await t.step('PricingCardFeatures renders container', () => {
        const html = renderToString(
            <PricingCardFeatures>
                <PricingCardFeature>Feature 1</PricingCardFeature>
            </PricingCardFeatures>,
        )
        assertStringIncludes(html, 'Feature 1')
        assertStringIncludes(html, '<ul')
    })

    await t.step('PricingCardFeature renders with check icon', () => {
        const html = renderToString(
            <PricingCardFeature>Unlimited projects</PricingCardFeature>,
        )
        assertStringIncludes(html, 'Unlimited projects')
        // Check icon should be present
        assertStringIncludes(html, 'text-primary')
    })

    await t.step(
        'PricingCardFeature renders with cross icon when not included',
        () => {
            const html = renderToString(
                <PricingCardFeature included={false}>
                    Priority support
                </PricingCardFeature>,
            )
            assertStringIncludes(html, 'Priority support')
            assertStringIncludes(html, 'text-muted-foreground')
        },
    )

    await t.step('PricingCardAction renders button', () => {
        const html = renderToString(
            <PricingCardAction>Get Started</PricingCardAction>,
        )
        assertStringIncludes(html, 'Get Started')
        assertStringIncludes(html, 'w-full')
    })

    await t.step('PricingCardAction renders with custom variant', () => {
        const html = renderToString(
            <PricingCardAction variant='outline'>
                Sign Up
            </PricingCardAction>,
        )
        assertStringIncludes(html, 'Sign Up')
    })

    await t.step('PricingCardAction renders as link with href', () => {
        const html = renderToString(
            <PricingCardAction href='/signup'>Subscribe</PricingCardAction>,
        )
        assertStringIncludes(html, 'Subscribe')
        assertStringIncludes(html, '/signup')
    })

    await t.step('PricingToggle renders with monthly selected', () => {
        const html = renderToString(<PricingToggle selected='monthly' />)
        assertStringIncludes(html, 'Monthly')
        assertStringIncludes(html, 'Yearly')
        assertStringIncludes(html, 'data-billing-period="monthly"')
    })

    await t.step('PricingToggle renders with yearly selected', () => {
        const html = renderToString(<PricingToggle selected='yearly' />)
        assertStringIncludes(html, 'Monthly')
        assertStringIncludes(html, 'Yearly')
        assertStringIncludes(html, 'data-billing-period="yearly"')
    })

    await t.step('PricingToggle renders with yearly badge', () => {
        const html = renderToString(
            <PricingToggle selected='yearly' yearlyBadge='Save 20%' />,
        )
        assertStringIncludes(html, 'Save 20%')
    })

    await t.step('PricingToggle renders with custom labels', () => {
        const html = renderToString(
            <PricingToggle
                monthlyLabel='Per Month'
                yearlyLabel='Per Year'
            />,
        )
        assertStringIncludes(html, 'Per Month')
        assertStringIncludes(html, 'Per Year')
    })

    await t.step('PricingSection renders with 2 columns', () => {
        const html = renderToString(
            <PricingSection columns={2}>
                <div>Card 1</div>
                <div>Card 2</div>
            </PricingSection>,
        )
        assertStringIncludes(html, 'md:grid-cols-2')
        assertStringIncludes(html, 'Card 1')
        assertStringIncludes(html, 'Card 2')
    })

    await t.step('PricingSection renders with 3 columns', () => {
        const html = renderToString(
            <PricingSection columns={3}>
                <div>Card 1</div>
                <div>Card 2</div>
                <div>Card 3</div>
            </PricingSection>,
        )
        assertStringIncludes(html, 'lg:grid-cols-3')
        assertStringIncludes(html, 'Card 1')
        assertStringIncludes(html, 'Card 2')
        assertStringIncludes(html, 'Card 3')
    })

    await t.step('PricingComparison renders table with headers', () => {
        const html = renderToString(
            <PricingComparison
                tiers={['Free', 'Pro', 'Enterprise']}
                features={[
                    ['Projects', '5', '10', 'Unlimited'],
                    ['Storage', '1 GB', '10 GB', '100 GB'],
                ]}
            />,
        )
        assertStringIncludes(html, '<table')
        assertStringIncludes(html, 'Free')
        assertStringIncludes(html, 'Pro')
        assertStringIncludes(html, 'Enterprise')
        assertStringIncludes(html, 'Features')
    })

    await t.step('PricingComparison renders feature rows', () => {
        const html = renderToString(
            <PricingComparison
                tiers={['Free', 'Pro']}
                features={[
                    ['Projects', '5', 'Unlimited'],
                    ['Storage', '1 GB', '100 GB'],
                ]}
            />,
        )
        assertStringIncludes(html, 'Projects')
        assertStringIncludes(html, '5')
        assertStringIncludes(html, 'Unlimited')
        assertStringIncludes(html, 'Storage')
        assertStringIncludes(html, '1 GB')
        assertStringIncludes(html, '100 GB')
    })

    await t.step('PricingComparison renders boolean values as icons', () => {
        const html = renderToString(
            <PricingComparison
                tiers={['Free', 'Pro']}
                features={[
                    ['API Access', false, true],
                    ['Custom Domain', false, true],
                ]}
            />,
        )
        assertStringIncludes(html, 'API Access')
        assertStringIncludes(html, 'Custom Domain')
        // Should contain check and cross icons
        assertStringIncludes(html, 'text-primary')
        assertStringIncludes(html, 'text-muted-foreground')
    })

    await t.step('renders full pricing card composition', () => {
        const html = renderToString(
            <PricingCard featured>
                <PricingCardHeader title='Pro' badge='Popular' />
                <PricingCardPrice price={29} period='month' />
                <PricingCardDescription>
                    For professionals
                </PricingCardDescription>
                <PricingCardFeatures>
                    <PricingCardFeature>Unlimited projects</PricingCardFeature>
                    <PricingCardFeature included={false}>
                        Priority support
                    </PricingCardFeature>
                </PricingCardFeatures>
                <PricingCardAction href='/signup'>
                    Get Started
                </PricingCardAction>
            </PricingCard>,
        )

        assertStringIncludes(html, 'Pro')
        assertStringIncludes(html, 'Popular')
        assertStringIncludes(html, '29')
        assertStringIncludes(html, '/month')
        assertStringIncludes(html, 'For professionals')
        assertStringIncludes(html, 'Unlimited projects')
        assertStringIncludes(html, 'Priority support')
        assertStringIncludes(html, 'Get Started')
        assertStringIncludes(html, '/signup')
    })

    await t.step('all components forward custom classes', () => {
        const cardHtml = renderToString(
            <PricingCard class='custom-card'>Test</PricingCard>,
        )
        assertStringIncludes(cardHtml, 'custom-card')

        const headerHtml = renderToString(
            <PricingCardHeader title='Test' class='custom-header' />,
        )
        assertStringIncludes(headerHtml, 'custom-header')

        const priceHtml = renderToString(
            <PricingCardPrice price={29} class='custom-price' />,
        )
        assertStringIncludes(priceHtml, 'custom-price')
    })
})
