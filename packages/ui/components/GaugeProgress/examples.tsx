/**
 * @fileoverview Live examples for GaugeProgress component
 */

import { Card, CardContent } from '../Card/mod.tsx'
import { CodeBlock } from '../CodeBlock/mod.tsx'
import { type PropDefinition, PropsTable } from '../PropsTable/mod.tsx'
import { GaugeProgress } from './mod.tsx'

const gaugeProgressProps: PropDefinition[] = [
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
        name: 'type',
        type: 'gauge | half',
        default: 'gauge',
        description: 'Gauge type: 270° arc or 180° half circle',
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
        description: 'Size of the gauge',
    },
    {
        name: 'strokeWidth',
        type: 'number',
        default: '1.5',
        description: 'Stroke width of the progress arc',
    },
    {
        name: 'trackStrokeWidth',
        type: 'number',
        description: 'Stroke width of the background track',
    },
    {
        name: 'strokeLinecap',
        type: 'round | butt | square',
        default: 'round',
        description: 'Shape of the stroke ends',
    },
    {
        name: 'progressColor',
        type: 'string',
        description: 'Custom color class for the progress arc',
    },
    {
        name: 'trackColor',
        type: 'string',
        description: 'Custom color class for the background track',
    },
    {
        name: 'showLabel',
        type: 'boolean',
        default: 'true',
        description: 'Show the value label in the center',
    },
    {
        name: 'label',
        type: 'string',
        description: 'Custom label to display below the value',
    },
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
        title: 'Basic Usage',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <div class='flex flex-wrap gap-8 items-center justify-center'>
                            <GaugeProgress value={25} label='Score' />
                            <GaugeProgress value={50} label='Score' />
                            <GaugeProgress value={75} label='Score' />
                            <GaugeProgress value={100} label='Score' />
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`import { GaugeProgress } from '@lockness/ui/components'

<GaugeProgress value={50} label="Score" />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Half Circle Gauge (180°)',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <div class='flex flex-wrap gap-8 items-center justify-center'>
                            <GaugeProgress
                                value={25}
                                type='half'
                                label='Score'
                            />
                            <GaugeProgress
                                value={50}
                                type='half'
                                label='Score'
                            />
                            <GaugeProgress
                                value={75}
                                type='half'
                                label='Score'
                            />
                            <GaugeProgress
                                value={100}
                                type='half'
                                label='Score'
                            />
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<GaugeProgress value={75} type="half" label="Score" />`}
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
                        <div class='flex flex-wrap gap-8 items-center justify-center'>
                            <GaugeProgress value={60} label='Default' />
                            <GaugeProgress
                                value={90}
                                variant='success'
                                label='Health'
                            />
                            <GaugeProgress
                                value={45}
                                variant='warning'
                                label='Warning'
                            />
                            <GaugeProgress
                                value={25}
                                variant='destructive'
                                label='Risk'
                            />
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<GaugeProgress value={90} variant="success" label="Health" />
<GaugeProgress value={25} variant="destructive" label="Risk" />`}
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
                        <div class='flex flex-wrap gap-8 items-end justify-center'>
                            <GaugeProgress value={60} size='sm' label='SM' />
                            <GaugeProgress
                                value={60}
                                size='default'
                                label='Default'
                            />
                            <GaugeProgress value={60} size='lg' label='LG' />
                            <GaugeProgress value={60} size='xl' label='XL' />
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<GaugeProgress value={60} size="sm" />
<GaugeProgress value={60} size="lg" />
<GaugeProgress value={60} size="xl" />`}
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
                        <div class='flex flex-wrap gap-8 items-center justify-center'>
                            <GaugeProgress
                                value={70}
                                strokeWidth={1}
                                label='Thin'
                            />
                            <GaugeProgress
                                value={70}
                                strokeWidth={2}
                                label='Medium'
                            />
                            <GaugeProgress
                                value={70}
                                strokeWidth={3}
                                label='Thick'
                            />
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<GaugeProgress value={70} strokeWidth={3} />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Without Label',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <div class='flex flex-wrap gap-8 items-center justify-center'>
                            <GaugeProgress value={50} showLabel={false} />
                            <GaugeProgress
                                value={75}
                                type='half'
                                showLabel={false}
                            />
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<GaugeProgress value={50} showLabel={false} />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Half Circle Variants',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <div class='flex flex-wrap gap-8 items-center justify-center'>
                            <GaugeProgress
                                value={60}
                                type='half'
                                label='Default'
                            />
                            <GaugeProgress
                                value={90}
                                type='half'
                                variant='success'
                                label='Health'
                            />
                            <GaugeProgress
                                value={45}
                                type='half'
                                variant='warning'
                                label='Warning'
                            />
                            <GaugeProgress
                                value={25}
                                type='half'
                                variant='destructive'
                                label='Risk'
                            />
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<GaugeProgress value={90} type="half" variant="success" label="Health" />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Stroke Line Cap',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <div class='flex flex-wrap gap-8 items-center justify-center'>
                            <GaugeProgress
                                value={25}
                                strokeLinecap='butt'
                                strokeWidth={2}
                                label='Flat'
                            />
                            <GaugeProgress
                                value={25}
                                strokeLinecap='round'
                                strokeWidth={2}
                                label='Round'
                            />
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<GaugeProgress value={25} strokeLinecap="butt" />
<GaugeProgress value={25} strokeLinecap="round" />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Independent Track Stroke Width',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <div class='flex flex-wrap gap-8 items-center justify-center'>
                            <GaugeProgress
                                value={50}
                                type='half'
                                strokeWidth={1}
                                trackStrokeWidth={3}
                                label='Thick track'
                            />
                            <GaugeProgress
                                value={75}
                                strokeWidth={2}
                                trackStrokeWidth={1}
                                label='Thin track'
                            />
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<GaugeProgress value={50} strokeWidth={1} trackStrokeWidth={3} />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Custom Colors',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <div class='flex flex-wrap gap-8 items-center justify-center'>
                            <GaugeProgress
                                value={25}
                                strokeWidth={2}
                                trackStrokeWidth={1}
                                strokeLinecap='butt'
                                progressColor='text-purple-600 dark:text-purple-500'
                                trackColor='text-purple-200 dark:text-neutral-700'
                                label='mph'
                            />
                            <GaugeProgress
                                value={75}
                                strokeWidth={2}
                                trackStrokeWidth={1}
                                progressColor='text-green-500 dark:text-green-500'
                                trackColor='text-green-200 dark:text-neutral-700'
                                label='Score'
                            />
                            <GaugeProgress
                                value={50}
                                type='half'
                                strokeWidth={1}
                                trackStrokeWidth={3}
                                progressColor='text-orange-600 dark:text-orange-500'
                                trackColor='text-orange-100 dark:text-neutral-700'
                                label='Average'
                            />
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<GaugeProgress
  value={75}
  progressColor="text-purple-600 dark:text-purple-500"
  trackColor="text-purple-200 dark:text-neutral-700"
  label="Score"
/>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Props',
        render: () => <PropsTable props={gaugeProgressProps} />,
    },
]
