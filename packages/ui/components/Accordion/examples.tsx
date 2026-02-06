/**
 * @fileoverview Live examples for Accordion component
 */

import { CodeBlock } from '../CodeBlock/mod.tsx'
import { createDocsSection } from '../../docs_renderer.tsx'
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from './mod.tsx'

export interface ExampleSection {
    title: string
    render: () => unknown
}

export const examples: ExampleSection[] = [
    // Documentation section - renders DOCS.md content
    createDocsSection('Accordion'),
    {
        title: 'Basic Accordion',
        render: () => (
            <div class='space-y-4'>
                <Accordion>
                    <AccordionItem value='item-1'>
                        <AccordionTrigger>Is it accessible?</AccordionTrigger>
                        <AccordionContent>
                            Yes. It adheres to the WAI-ARIA design pattern and
                            uses native HTML details/summary elements.
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value='item-2'>
                        <AccordionTrigger>Is it styled?</AccordionTrigger>
                        <AccordionContent>
                            Yes. It comes with default styles that use CSS
                            variables for easy theming.
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value='item-3'>
                        <AccordionTrigger>Can it be animated?</AccordionTrigger>
                        <AccordionContent>
                            Yes. The component uses CSS transitions for smooth
                            expand/collapse animations.
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
                <CodeBlock lang='tsx'>
                    {`import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@lockness/ui/components'

<Accordion>
  <AccordionItem value='item-1'>
    <AccordionTrigger>Question?</AccordionTrigger>
    <AccordionContent>Answer.</AccordionContent>
  </AccordionItem>
</Accordion>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'FAQ Section',
        render: () => (
            <div class='space-y-4'>
                <Accordion>
                    <AccordionItem value='shipping'>
                        <AccordionTrigger>
                            What are the shipping options?
                        </AccordionTrigger>
                        <AccordionContent>
                            We offer standard shipping (5-7 business days) and
                            express shipping (2-3 business days). Free shipping
                            is available on orders over $50.
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value='returns'>
                        <AccordionTrigger>
                            What is your return policy?
                        </AccordionTrigger>
                        <AccordionContent>
                            Items can be returned within 30 days of purchase for
                            a full refund. Products must be in original
                            condition with tags attached.
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value='warranty'>
                        <AccordionTrigger>
                            Do your products come with a warranty?
                        </AccordionTrigger>
                        <AccordionContent>
                            Yes, all our products come with a 1-year
                            manufacturer warranty covering defects in materials
                            and workmanship.
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
                <CodeBlock lang='tsx'>
                    {`<Accordion>
  <AccordionItem value='shipping'>
    <AccordionTrigger>What are the shipping options?</AccordionTrigger>
    <AccordionContent>
      We offer standard shipping (5-7 business days)...
    </AccordionContent>
  </AccordionItem>
</Accordion>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Settings Panel',
        render: () => (
            <div class='space-y-4'>
                <Accordion>
                    <AccordionItem value='account'>
                        <AccordionTrigger>Account Settings</AccordionTrigger>
                        <AccordionContent>
                            <div class='space-y-2'>
                                <p>
                                    <strong>Email:</strong> user@example.com
                                </p>
                                <p>
                                    <strong>Account Type:</strong> Premium
                                </p>
                                <p>
                                    <strong>Member Since:</strong> January 2024
                                </p>
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value='notifications'>
                        <AccordionTrigger>
                            Notification Preferences
                        </AccordionTrigger>
                        <AccordionContent>
                            <div class='space-y-2'>
                                <label class='flex items-center gap-2'>
                                    <input type='checkbox' checked />{' '}
                                    Email notifications
                                </label>
                                <label class='flex items-center gap-2'>
                                    <input type='checkbox' /> SMS notifications
                                </label>
                                <label class='flex items-center gap-2'>
                                    <input type='checkbox' checked />{' '}
                                    Push notifications
                                </label>
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                    <AccordionItem value='privacy'>
                        <AccordionTrigger>Privacy Settings</AccordionTrigger>
                        <AccordionContent>
                            <div class='space-y-2'>
                                <label class='flex items-center gap-2'>
                                    <input type='checkbox' checked />{' '}
                                    Make profile public
                                </label>
                                <label class='flex items-center gap-2'>
                                    <input type='checkbox' />{' '}
                                    Show activity status
                                </label>
                            </div>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
                <CodeBlock lang='tsx'>
                    {`<Accordion>
  <AccordionItem value='account'>
    <AccordionTrigger>Account Settings</AccordionTrigger>
    <AccordionContent>
      {/* Settings content */}
    </AccordionContent>
  </AccordionItem>
</Accordion>`}
                </CodeBlock>
            </div>
        ),
    },
]
