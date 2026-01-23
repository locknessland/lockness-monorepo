/**
 * @fileoverview Live examples for Accordion component
 */

import { CodeBlock } from '../CodeBlock/mod.tsx'
import { type PropDefinition, PropsTable } from '../PropsTable/mod.tsx'
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from './mod.tsx'

const accordionProps: PropDefinition[] = [
    { name: 'children', type: 'unknown', description: 'Accordion items' },
    {
        name: 'class',
        type: 'string',
        description: 'Additional CSS class names',
    },
]

const accordionItemProps: PropDefinition[] = [
    {
        name: 'value',
        type: 'string',
        required: true,
        description: 'Unique value for this accordion item',
    },
    { name: 'children', type: 'unknown', description: 'Item content' },
    {
        name: 'class',
        type: 'string',
        description: 'Additional CSS class names',
    },
]

const accordionTriggerProps: PropDefinition[] = [
    { name: 'children', type: 'unknown', description: 'Trigger content' },
    {
        name: 'class',
        type: 'string',
        description: 'Additional CSS class names',
    },
]

const accordionContentProps: PropDefinition[] = [
    { name: 'children', type: 'unknown', description: 'Content' },
    {
        name: 'class',
        type: 'string',
        description: 'Additional CSS class names',
    },
]

export interface ExampleSection {
    title: string
    render: () => unknown
}

export const examples: ExampleSection[] = [
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
        title: 'Props',
        render: () => (
            <div class='space-y-6'>
                <PropsTable props={accordionProps} title='Accordion' />
                <PropsTable props={accordionItemProps} title='AccordionItem' />
                <PropsTable
                    props={accordionTriggerProps}
                    title='AccordionTrigger'
                />
                <PropsTable
                    props={accordionContentProps}
                    title='AccordionContent'
                />
            </div>
        ),
    },
]
