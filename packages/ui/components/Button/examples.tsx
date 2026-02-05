/**
 * @fileoverview Live examples for Button component
 */

import { Card, CardContent } from '../Card/mod.tsx'
import { CodeBlock } from '../CodeBlock/mod.tsx'
import { type PropDefinition, PropsTable } from '../PropsTable/mod.tsx'
import { Button } from './mod.tsx'

const buttonProps: PropDefinition[] = [
    {
        name: 'as',
        type: 'button | a',
        default: 'button',
        description: "Render as a different element (e.g., 'a' for links)",
    },
    {
        name: 'variant',
        type: 'primary | secondary | outline | ghost | danger',
        default: 'primary',
        description: 'Visual style variant',
    },
    {
        name: 'size',
        type: 'sm | md | lg | xl',
        default: 'md',
        description: 'Button size',
    },
    {
        name: 'disabled',
        type: 'boolean',
        default: 'false',
        description: 'Disable button interactions',
    },
    { name: 'children', type: 'unknown', description: 'Button content' },
    {
        name: 'class',
        type: 'string',
        description: 'Additional CSS class names',
    },
    {
        name: 'type',
        type: 'button | submit | reset',
        description: 'Button type attribute (only for button element)',
    },
    {
        name: 'href',
        type: 'string',
        description: 'Link href (only for anchor element)',
    },
    { name: 'id', type: 'string', description: 'Button id attribute' },
    {
        name: 'preload',
        type: 'boolean',
        default: 'false',
        description: 'Enable Unpoly preload on hover (only for links)',
    },
    {
        name: 'transition',
        type: 'UnpolyTransition',
        description: 'Unpoly transition animation (only for links)',
    },
    {
        name: 'target',
        type: 'UnpolyTarget',
        description: 'Unpoly target selector (only for links)',
    },
    {
        name: 'duration',
        type: 'number',
        description: 'Transition duration in milliseconds (only for links)',
    },
    {
        name: 'easing',
        type: 'UnpolyEasing',
        description: 'Transition timing function (only for links)',
    },
    {
        name: 'failTransition',
        type: 'UnpolyTransition',
        description:
            'Transition to use when server responds with error (only for links)',
    },
]

export interface ExampleSection {
    title: string
    render: () => unknown
}

export const examples: ExampleSection[] = [
    {
        title: 'Variants',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 flex flex-wrap gap-4 items-center'>
                        <Button variant='primary'>Primary</Button>
                        <Button variant='secondary'>Secondary</Button>
                        <Button variant='outline'>Outline</Button>
                        <Button variant='ghost'>Ghost</Button>
                        <Button variant='danger'>Danger</Button>
                        <Button disabled>Disabled</Button>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`import { Button } from '@lockness/ui/components'

<Button variant='primary'>Primary</Button>
<Button variant='secondary'>Secondary</Button>
<Button variant='outline'>Outline</Button>
<Button variant='ghost'>Ghost</Button>
<Button variant='danger'>Danger</Button>
<Button disabled>Disabled</Button>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Sizes',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 flex flex-wrap gap-4 items-center'>
                        <Button size='xl' variant='primary'>Extra Large</Button>
                        <Button size='lg' variant='primary'>Large</Button>
                        <Button size='md' variant='primary'>Medium</Button>
                        <Button size='sm' variant='primary'>Small</Button>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<Button size='xl'>Extra Large</Button>
<Button size='lg'>Large</Button>
<Button size='md'>Medium</Button>
<Button size='sm'>Small</Button>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Props',
        render: () => <PropsTable props={buttonProps} />,
    },
]
