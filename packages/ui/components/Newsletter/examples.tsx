/**
 * @fileoverview Live examples for Newsletter component
 */

import { Card, CardContent } from '../Card/mod.tsx'
import { CodeBlock } from '../CodeBlock/mod.tsx'
import { Newsletter, NewsletterSection } from './mod.tsx'
import { createDocsSection } from '../../docs_renderer.tsx'

export interface ExampleSection {
    title: string
    description?: string
    render: () => unknown
}

export const examples: ExampleSection[] = [
    // Documentation section - renders DOCS.md content
    createDocsSection('Newsletter'),
    {
        title: 'Inline (Default)',
        description:
            'Horizontal layout with input and button side by side. Ideal for headers or compact spaces.',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <Newsletter action='/subscribe' />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`import { Newsletter } from '@lockness/ui/components'

<Newsletter action="/subscribe" />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'With Icon',
        description: 'Add an email icon inside the input for visual context.',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <Newsletter action='/subscribe' showIcon />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<Newsletter action="/subscribe" showIcon />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Stacked Variant',
        description:
            'Vertical layout with title and description. Great for sidebars or footer sections.',
        render: () => (
            <div class='space-y-4'>
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
            </div>
        ),
    },
    {
        title: 'Card Variant',
        description: 'Self-contained card with icon, title, and form.',
        render: () => (
            <div class='space-y-4'>
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
            </div>
        ),
    },
    {
        title: 'Minimal Variant',
        description:
            'Clean, borderless design with just an underline. Perfect for modern, minimalist layouts.',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <div class='max-w-sm'>
                            <Newsletter variant='minimal' action='/subscribe' />
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<Newsletter variant="minimal" action="/subscribe" />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Custom Text',
        description: 'Customize placeholder and button text.',
        render: () => (
            <div class='space-y-4'>
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
            </div>
        ),
    },
    {
        title: 'Section - Default',
        description: 'Full-width section component for landing pages.',
        render: () => (
            <div class='space-y-4'>
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
            </div>
        ),
    },
    {
        title: 'Section - Muted Background',
        render: () => (
            <div class='space-y-4'>
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
            </div>
        ),
    },
    {
        title: 'Section - Primary Background',
        render: () => (
            <div class='space-y-4'>
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
            </div>
        ),
    },
    {
        title: 'Section - Gradient Background',
        render: () => (
            <div class='space-y-4'>
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
            </div>
        ),
    },
    {
        title: 'With Unpoly',
        description: 'Use Unpoly attributes for AJAX form submission.',
        render: () => (
            <div class='space-y-4'>
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
            </div>
        ),
    },
]
