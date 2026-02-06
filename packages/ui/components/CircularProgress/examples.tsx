/**
 * @fileoverview Live examples for CircularProgress component
 */

import { Card, CardContent } from '../Card/mod.tsx'
import { CodeBlock } from '../CodeBlock/mod.tsx'
import { createDocsSection } from '../../docs_renderer.tsx'
import { CircularProgress } from './mod.tsx'

export interface ExampleSection {
    title: string
    render: () => unknown
}

export const examples: ExampleSection[] = [
    // Documentation section - renders DOCS.md content
    createDocsSection('CircularProgress'),
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
]
