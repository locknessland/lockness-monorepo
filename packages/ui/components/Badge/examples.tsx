/**
 * @fileoverview Live examples for Badge component
 */

import { Card, CardContent } from '../Card/mod.tsx'
import { CodeBlock } from '../CodeBlock/mod.tsx'
import { type PropDefinition, PropsTable } from '../PropsTable/mod.tsx'
import { Badge } from './mod.tsx'

const badgeProps: PropDefinition[] = [
    {
        name: 'variant',
        type: 'default | secondary | destructive | outline',
        default: 'default',
        description: 'Visual style variant',
    },
    { name: 'children', type: 'unknown', description: 'Badge content' },
    {
        name: 'class',
        type: 'string',
        description: 'Additional CSS class names',
    },
    { name: 'id', type: 'string', description: 'Element id attribute' },
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
                    <CardContent class='p-6'>
                        <div class='flex flex-wrap gap-3 items-center'>
                            <Badge>Default</Badge>
                            <Badge variant='secondary'>Secondary</Badge>
                            <Badge variant='destructive'>Destructive</Badge>
                            <Badge variant='outline'>Outline</Badge>
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`import { Badge } from '@lockness/ui/components'

<Badge>Default</Badge>
<Badge variant="secondary">Secondary</Badge>
<Badge variant="destructive">Destructive</Badge>
<Badge variant="outline">Outline</Badge>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Use Cases',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-4'>
                        <div class='flex items-center gap-2'>
                            <span class='text-foreground'>New Feature</span>
                            <Badge>New</Badge>
                        </div>
                        <div class='flex items-center gap-2'>
                            <span class='text-foreground'>Beta Version</span>
                            <Badge variant='secondary'>Beta</Badge>
                        </div>
                        <div class='flex items-center gap-2'>
                            <span class='text-foreground'>Critical Error</span>
                            <Badge variant='destructive'>Error</Badge>
                        </div>
                        <div class='flex items-center gap-2'>
                            <span class='text-foreground'>Draft Status</span>
                            <Badge variant='outline'>Draft</Badge>
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<div class='flex items-center gap-2'>
    <span>New Feature</span>
    <Badge>New</Badge>
</div>

<div class='flex items-center gap-2'>
    <span>Beta Version</span>
    <Badge variant='secondary'>Beta</Badge>
</div>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Props',
        render: () => <PropsTable props={badgeProps} />,
    },
]
