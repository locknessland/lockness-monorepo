/**
 * @fileoverview Live examples for Progress component
 */

import { Card, CardContent } from '../Card/mod.tsx'
import { CodeBlock } from '../CodeBlock/mod.tsx'
import { type PropDefinition, PropsTable } from '../PropsTable/mod.tsx'
import { Progress } from './mod.tsx'

const progressProps: PropDefinition[] = [
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
        type: 'sm | default | lg',
        default: 'default',
        description: 'Size of the progress bar',
    },
    {
        name: 'showLabel',
        type: 'boolean',
        default: 'false',
        description: 'Show percentage label above the bar (left-right layout)',
    },
    {
        name: 'floatingLabel',
        type: 'boolean',
        default: 'false',
        description: 'Show floating label that follows the progress',
    },
    {
        name: 'innerLabel',
        type: 'boolean',
        default: 'false',
        description: 'Show label inside the progress bar',
    },
    {
        name: 'endLabel',
        type: 'boolean',
        default: 'false',
        description: 'Show label at the end (right side) of the progress bar',
    },
    {
        name: 'vertical',
        type: 'boolean',
        default: 'false',
        description: 'Display progress bar vertically',
    },
    {
        name: 'striped',
        type: 'boolean',
        default: 'false',
        description: 'Display progress with diagonal stripes effect',
    },
    {
        name: 'animated',
        type: 'boolean',
        default: 'false',
        description: 'Animate the stripes (requires striped=true)',
    },
    {
        name: 'outlined',
        type: 'boolean',
        default: 'false',
        description: 'Display progress with a border wrapper around the bar',
    },
    {
        name: 'thickness',
        type: 'number',
        description:
            'Custom thickness in Tailwind spacing units (overrides size prop)',
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
                    <CardContent class='p-6 space-y-4'>
                        <Progress value={0} />
                        <Progress value={25} />
                        <Progress value={50} />
                        <Progress value={75} />
                        <Progress value={100} />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`import { Progress } from '@lockness/ui/components'

<Progress value={50} />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'With Label',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-6'>
                        <Progress value={33} showLabel />
                        <Progress value={66} showLabel />
                        <Progress value={100} showLabel />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<Progress value={66} showLabel />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Floating Label',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-6'>
                        <Progress value={25} floatingLabel />
                        <Progress value={50} floatingLabel />
                        <Progress value={75} floatingLabel />
                        <Progress value={100} floatingLabel />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<Progress value={50} floatingLabel />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Inner Label',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-6'>
                        <Progress value={25} innerLabel />
                        <Progress value={50} innerLabel />
                        <Progress value={75} innerLabel />
                        <Progress value={100} innerLabel />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<Progress value={50} innerLabel />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'End Label',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-4'>
                        <Progress value={25} endLabel />
                        <Progress value={50} endLabel />
                        <Progress value={75} endLabel />
                        <Progress value={100} endLabel />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<Progress value={50} endLabel />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Variants',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-4'>
                        <Progress value={60} endLabel />
                        <Progress value={80} endLabel variant='success' />
                        <Progress value={45} endLabel variant='warning' />
                        <Progress value={30} endLabel variant='destructive' />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<Progress value={80} endLabel variant="success" />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Vertical',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <div class='flex gap-x-8'>
                            <Progress value={25} vertical />
                            <Progress value={50} vertical />
                            <Progress value={75} vertical />
                            <Progress value={90} vertical />
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<div class="flex gap-x-8">
  <Progress value={25} vertical />
  <Progress value={50} vertical />
  <Progress value={75} vertical />
</div>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Striped Progress',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-6'>
                        <Progress value={30} striped />
                        <Progress value={50} striped />
                        <Progress value={70} striped />
                        <Progress value={100} striped />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<Progress value={50} striped />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Striped Animated Progress',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-6'>
                        <Progress value={30} striped animated />
                        <Progress value={50} striped animated />
                        <Progress value={70} striped animated />
                        <Progress value={100} striped animated />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<Progress value={50} striped animated />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Striped Progress Variants',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-6'>
                        <Progress value={60} striped animated />
                        <Progress
                            value={80}
                            striped
                            animated
                            variant='success'
                        />
                        <Progress
                            value={45}
                            striped
                            animated
                            variant='warning'
                        />
                        <Progress
                            value={30}
                            striped
                            animated
                            variant='destructive'
                        />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<Progress value={80} striped animated variant="success" />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Striped Progress Sizes',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-6'>
                        <Progress value={60} striped size='sm' />
                        <Progress value={60} striped />
                        <Progress value={60} striped size='lg' />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<Progress value={60} striped size="lg" />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Outlined Progress',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-6'>
                        <Progress value={30} outlined />
                        <Progress value={50} outlined />
                        <Progress value={70} outlined />
                        <Progress value={100} outlined />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<Progress value={50} outlined />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Outlined Progress Variants',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-6'>
                        <Progress value={60} outlined />
                        <Progress value={75} outlined variant='success' />
                        <Progress value={45} outlined variant='warning' />
                        <Progress value={90} outlined variant='destructive' />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<Progress value={75} outlined variant="success" />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Outlined Striped Animated Progress',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-6'>
                        <Progress value={60} outlined striped animated />
                        <Progress
                            value={75}
                            outlined
                            striped
                            animated
                            variant='success'
                        />
                        <Progress
                            value={45}
                            outlined
                            striped
                            animated
                            variant='warning'
                        />
                        <Progress
                            value={90}
                            outlined
                            striped
                            animated
                            variant='destructive'
                        />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<Progress value={75} outlined striped animated variant="success" />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Outlined Progress Sizes',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-6'>
                        <Progress value={60} outlined size='sm' />
                        <Progress value={60} outlined />
                        <Progress value={60} outlined size='lg' />
                        <Progress
                            value={75}
                            outlined
                            striped
                            animated
                            size='lg'
                            variant='success'
                        />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<Progress value={60} outlined size="lg" />
<Progress value={75} outlined striped animated size="lg" variant="success" />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Real-world Examples',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <div class='space-y-3'>
                            <div class='flex justify-between text-sm'>
                                <span class='font-medium'>
                                    Uploading document.pdf
                                </span>
                                <span class='text-muted-foreground'>
                                    2.4 MB / 3.2 MB
                                </span>
                            </div>
                            <Progress value={75} variant='default' />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent class='p-6'>
                        <div class='space-y-3'>
                            <div class='flex justify-between text-sm'>
                                <span class='font-medium'>
                                    Profile Completion
                                </span>
                                <span class='text-muted-foreground'>
                                    4 of 6 steps
                                </span>
                            </div>
                            <Progress
                                value={4}
                                max={6}
                                variant='success'
                                size='lg'
                            />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent class='p-6'>
                        <div class='space-y-3'>
                            <div class='flex justify-between text-sm'>
                                <span class='font-medium'>Storage Used</span>
                                <span class='text-muted-foreground'>
                                    8.5 GB / 10 GB
                                </span>
                            </div>
                            <Progress value={85} variant='warning' />
                            <p class='text-xs text-muted-foreground'>
                                You're running low on storage space.
                            </p>
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<div class="space-y-3">
    <div class="flex justify-between text-sm">
        <span class="font-medium">Storage Used</span>
        <span class="text-muted-foreground">8.5 GB / 10 GB</span>
    </div>
    <Progress value={85} variant="warning" />
</div>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Props',
        render: () => <PropsTable props={progressProps} />,
    },
]
