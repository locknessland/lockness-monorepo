/**
 * @fileoverview Live examples for CircularProgress component
 */

import { Card, CardContent } from '../Card/mod.tsx'
import { CodeBlock } from '../CodeBlock/mod.tsx'
import { type PropDefinition, PropsTable } from '../PropsTable/mod.tsx'
import { CircularProgress } from './mod.tsx'

const circularProgressProps: PropDefinition[] = [
    {
        name: 'value',
        type: 'number',
        default: '0',
        description: 'Current progress value (0-100)',
    },
    {
        name: 'max',
        type: 'number',
        default: '100',
        description: 'Maximum value',
    },
    {
        name: 'variant',
        type: 'default | success | warning | destructive',
        default: 'default',
        description: 'Visual style variant',
    },
    {
        name: 'size',
        type: 'sm | default | lg | xl',
        default: 'default',
        description: 'Size of the circular progress',
    },
    {
        name: 'strokeWidth',
        type: 'number',
        default: '2',
        description: 'Stroke width of the progress circle',
    },
    {
        name: 'showLabel',
        type: 'boolean',
        default: 'false',
        description: 'Show percentage label in the center',
    },
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
        title: 'Basic Usage',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <div class='flex gap-8 items-center'>
                            <CircularProgress value={25} />
                            <CircularProgress value={50} />
                            <CircularProgress value={75} />
                            <CircularProgress value={100} />
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`import { CircularProgress } from '@lockness/ui/components'

<CircularProgress value={50} />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'With Label',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <div class='flex gap-8 items-center'>
                            <CircularProgress value={25} showLabel />
                            <CircularProgress value={50} showLabel />
                            <CircularProgress value={75} showLabel />
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<CircularProgress value={75} showLabel />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Sizes',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <div class='flex gap-8 items-end'>
                            <CircularProgress value={60} size='sm' showLabel />
                            <CircularProgress value={60} showLabel />
                            <CircularProgress value={60} size='lg' showLabel />
                            <CircularProgress value={60} size='xl' showLabel />
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<CircularProgress value={60} size="sm" showLabel />
<CircularProgress value={60} showLabel />
<CircularProgress value={60} size="lg" showLabel />
<CircularProgress value={60} size="xl" showLabel />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Variants',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <div class='flex gap-8 items-center'>
                            <CircularProgress value={60} size='lg' showLabel />
                            <CircularProgress
                                value={80}
                                size='lg'
                                variant='success'
                                showLabel
                            />
                            <CircularProgress
                                value={45}
                                size='lg'
                                variant='warning'
                                showLabel
                            />
                            <CircularProgress
                                value={30}
                                size='lg'
                                variant='destructive'
                                showLabel
                            />
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<CircularProgress value={80} variant="success" showLabel />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Custom Stroke Width',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <div class='flex gap-8 items-center'>
                            <CircularProgress
                                value={60}
                                size='lg'
                                strokeWidth={1}
                                showLabel
                            />
                            <CircularProgress
                                value={60}
                                size='lg'
                                strokeWidth={2}
                                showLabel
                            />
                            <CircularProgress
                                value={60}
                                size='lg'
                                strokeWidth={4}
                                showLabel
                            />
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<CircularProgress value={60} strokeWidth={4} showLabel />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Props',
        render: () => <PropsTable props={circularProgressProps} />,
    },
]
