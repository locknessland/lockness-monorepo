import {
    Card,
    CardContent,
    CodeBlock,
    Newsletter,
    NewsletterSection,
} from '@lockness/ui/components'
import { PageUiLayout } from '@view/layouts/ui_layout.tsx'

export const NewsletterPage = () => {
    return (
        <PageUiLayout
            title='Newsletter - Lockness UI'
           
        >
            <div class='space-y-8 max-w-full'>
                <header>
                    <h1 class='font-pixel text-2xl text-foreground mb-2'>
                        NEWSLETTER
                    </h1>
                    <p class='text-lg text-muted-foreground'>
                        Email subscription form components with multiple layout
                        variants. Perfect for capturing leads and building
                        mailing lists.
                    </p>
                </header>

                {/* Inline (Default) */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        INLINE (DEFAULT)
                    </h2>
                    <p class='text-muted-foreground'>
                        Horizontal layout with input and button side by side.
                        Ideal for headers or compact spaces.
                    </p>
                    <Card>
                        <CardContent class='p-6'>
                            <Newsletter action='/subscribe' />
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`import { Newsletter } from '@lockness/ui/components'

<Newsletter action="/subscribe" />`}
                    </CodeBlock>
                </section>

                {/* Inline with Icon */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        WITH ICON
                    </h2>
                    <p class='text-muted-foreground'>
                        Add an email icon inside the input for visual context.
                    </p>
                    <Card>
                        <CardContent class='p-6'>
                            <Newsletter action='/subscribe' showIcon />
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<Newsletter action="/subscribe" showIcon />`}
                    </CodeBlock>
                </section>

                {/* Stacked Variant */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        STACKED VARIANT
                    </h2>
                    <p class='text-muted-foreground'>
                        Vertical layout with title and description. Great for
                        sidebars or footer sections.
                    </p>
                    <Card>
                        <CardContent class='p-6'>
                            <div class='max-w-sm'>
                                <Newsletter
                                    variant='stacked'
                                    title='Stay updated'
                                    description='Get the latest news and updates delivered directly to your inbox.'
                                    action='/subscribe'
                                />
                            </div>
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<Newsletter
  variant="stacked"
  title="Stay updated"
  description="Get the latest news and updates delivered directly to your inbox."
  action="/subscribe"
/>`}
                    </CodeBlock>
                </section>

                {/* Card Variant */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        CARD VARIANT
                    </h2>
                    <p class='text-muted-foreground'>
                        Self-contained card with icon, title, and form.
                    </p>
                    <Card>
                        <CardContent class='p-6'>
                            <div class='max-w-md'>
                                <Newsletter
                                    variant='card'
                                    title='Subscribe to our newsletter'
                                    description='Join 10,000+ developers who receive our weekly updates.'
                                    action='/subscribe'
                                    showIcon
                                />
                            </div>
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<Newsletter
  variant="card"
  title="Subscribe to our newsletter"
  description="Join 10,000+ developers who receive our weekly updates."
  action="/subscribe"
  showIcon
/>`}
                    </CodeBlock>
                </section>

                {/* Minimal Variant */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        MINIMAL VARIANT
                    </h2>
                    <p class='text-muted-foreground'>
                        Clean, borderless design with just an underline. Perfect
                        for modern, minimalist layouts.
                    </p>
                    <Card>
                        <CardContent class='p-6'>
                            <div class='max-w-sm'>
                                <Newsletter
                                    variant='minimal'
                                    action='/subscribe'
                                />
                            </div>
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<Newsletter variant="minimal" action="/subscribe" />`}
                    </CodeBlock>
                </section>

                {/* Custom Button Text */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        CUSTOM TEXT
                    </h2>
                    <p class='text-muted-foreground'>
                        Customize placeholder and button text.
                    </p>
                    <Card>
                        <CardContent class='p-6 space-y-4'>
                            <Newsletter
                                placeholder='you@company.com'
                                buttonText='Join Waitlist'
                                showIcon
                            />
                            <Newsletter
                                placeholder='Your best email'
                                buttonText='Get Started →'
                            />
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<Newsletter
  placeholder="you@company.com"
  buttonText="Join Waitlist"
  showIcon
/>

<Newsletter
  placeholder="Your best email"
  buttonText="Get Started →"
/>`}
                    </CodeBlock>
                </section>

                {/* Newsletter Section - Default */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        SECTION - DEFAULT
                    </h2>
                    <p class='text-muted-foreground'>
                        Full-width section component for landing pages.
                    </p>
                    <Card>
                        <CardContent class='p-0 overflow-hidden rounded-(--radius)'>
                            <NewsletterSection
                                title='Subscribe to our newsletter'
                                description='Get weekly tips, tutorials, and resources delivered to your inbox.'
                            />
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`import { NewsletterSection } from '@lockness/ui/components'

<NewsletterSection
  title="Subscribe to our newsletter"
  description="Get weekly tips, tutorials, and resources delivered to your inbox."
/>`}
                    </CodeBlock>
                </section>

                {/* Newsletter Section - Muted */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        SECTION - MUTED BACKGROUND
                    </h2>
                    <Card>
                        <CardContent class='p-0 overflow-hidden rounded-(--radius)'>
                            <NewsletterSection
                                background='muted'
                                title='Stay in the loop'
                                description='No spam, unsubscribe at any time.'
                                socialProof='✨ Join 5,000+ subscribers'
                            />
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<NewsletterSection
  background="muted"
  title="Stay in the loop"
  description="No spam, unsubscribe at any time."
  socialProof="✨ Join 5,000+ subscribers"
/>`}
                    </CodeBlock>
                </section>

                {/* Newsletter Section - Primary */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        SECTION - PRIMARY BACKGROUND
                    </h2>
                    <Card>
                        <CardContent class='p-0 overflow-hidden rounded-(--radius)'>
                            <NewsletterSection
                                background='primary'
                                title='Get early access'
                                description='Be the first to know when we launch new features.'
                                buttonText='Notify Me'
                            />
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<NewsletterSection
  background="primary"
  title="Get early access"
  description="Be the first to know when we launch new features."
  buttonText="Notify Me"
/>`}
                    </CodeBlock>
                </section>

                {/* Newsletter Section - Gradient */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        SECTION - GRADIENT BACKGROUND
                    </h2>
                    <Card>
                        <CardContent class='p-0 overflow-hidden rounded-(--radius)'>
                            <NewsletterSection
                                background='gradient'
                                title='Join the community'
                                description='Weekly insights, exclusive content, and early access to new features.'
                                buttonText='Subscribe Free'
                                socialProof='🚀 Trusted by 10,000+ developers'
                            />
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<NewsletterSection
  background="gradient"
  title="Join the community"
  description="Weekly insights, exclusive content, and early access to new features."
  buttonText="Subscribe Free"
  socialProof="🚀 Trusted by 10,000+ developers"
/>`}
                    </CodeBlock>
                </section>

                {/* With Unpoly */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        WITH UNPOLY
                    </h2>
                    <p class='text-muted-foreground'>
                        Use Unpoly attributes for AJAX form submission.
                    </p>
                    <Card>
                        <CardContent class='p-6'>
                            <Newsletter
                                action='/api/subscribe'
                                up-target='#newsletter-result'
                                showIcon
                            />
                            <div
                                id='newsletter-result'
                                class='mt-2 text-sm text-muted-foreground'
                            />
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<Newsletter
  action="/api/subscribe"
  up-target="#newsletter-result"
  showIcon
/>
<div id="newsletter-result" />`}
                    </CodeBlock>
                </section>

                {/* Props Reference */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        PROPS REFERENCE
                    </h2>
                    <h3 class='font-medium text-foreground'>Newsletter</h3>
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
                                            <th class='text-left p-4 font-medium'>
                                                Description
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody class='divide-y divide-border'>
                                        <tr>
                                            <td class='p-4 font-mono text-xs'>
                                                variant
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                'inline' | 'stacked' | 'card' |
                                                'minimal'
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                'inline'
                                            </td>
                                            <td class='p-4 text-muted-foreground'>
                                                Layout variant
                                            </td>
                                        </tr>
                                        <tr>
                                            <td class='p-4 font-mono text-xs'>
                                                action
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                string
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                '#'
                                            </td>
                                            <td class='p-4 text-muted-foreground'>
                                                Form action URL
                                            </td>
                                        </tr>
                                        <tr>
                                            <td class='p-4 font-mono text-xs'>
                                                placeholder
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                string
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                'Enter your email'
                                            </td>
                                            <td class='p-4 text-muted-foreground'>
                                                Input placeholder text
                                            </td>
                                        </tr>
                                        <tr>
                                            <td class='p-4 font-mono text-xs'>
                                                buttonText
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                string
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                'Subscribe'
                                            </td>
                                            <td class='p-4 text-muted-foreground'>
                                                Submit button text
                                            </td>
                                        </tr>
                                        <tr>
                                            <td class='p-4 font-mono text-xs'>
                                                title
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                string
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                -
                                            </td>
                                            <td class='p-4 text-muted-foreground'>
                                                Title text (stacked/card)
                                            </td>
                                        </tr>
                                        <tr>
                                            <td class='p-4 font-mono text-xs'>
                                                description
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                string
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                -
                                            </td>
                                            <td class='p-4 text-muted-foreground'>
                                                Description text
                                            </td>
                                        </tr>
                                        <tr>
                                            <td class='p-4 font-mono text-xs'>
                                                showIcon
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                boolean
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                false
                                            </td>
                                            <td class='p-4 text-muted-foreground'>
                                                Show email icon
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>

                    <h3 class='font-medium text-foreground mt-6'>
                        NewsletterSection
                    </h3>
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
                                            <th class='text-left p-4 font-medium'>
                                                Description
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody class='divide-y divide-border'>
                                        <tr>
                                            <td class='p-4 font-mono text-xs'>
                                                background
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                'default' | 'muted' | 'primary'
                                                | 'gradient'
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                'default'
                                            </td>
                                            <td class='p-4 text-muted-foreground'>
                                                Background style
                                            </td>
                                        </tr>
                                        <tr>
                                            <td class='p-4 font-mono text-xs'>
                                                socialProof
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                string
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                -
                                            </td>
                                            <td class='p-4 text-muted-foreground'>
                                                Social proof text (e.g.,
                                                subscriber count)
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
