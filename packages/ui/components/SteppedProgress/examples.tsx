/**
 * @fileoverview Live examples for SteppedProgress component
 */

import { Card, CardContent } from '../Card/mod.tsx'
import { CodeBlock } from '../CodeBlock/mod.tsx'
import { SteppedProgress } from './mod.tsx'
import { createDocsSection } from '../../docs_renderer.tsx'

export interface ExampleSection {
    title: string
    render: () => unknown
}

export const examples: ExampleSection[] = [
    // Documentation section - renders DOCS.md content
    createDocsSection('SteppedProgress'),
    {
        title: 'Basic Usage',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-4'>
                        <SteppedProgress value={2} steps={4} />
                        <SteppedProgress value={3} steps={4} />
                        <SteppedProgress value={4} steps={4} />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`import { SteppedProgress } from '@lockness/ui/components'

<SteppedProgress value={2} steps={4} />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Different Number of Steps',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-4'>
                        <div class='space-y-2'>
                            <p class='text-sm text-muted-foreground'>3 steps</p>
                            <SteppedProgress value={2} steps={3} />
                        </div>
                        <div class='space-y-2'>
                            <p class='text-sm text-muted-foreground'>5 steps</p>
                            <SteppedProgress value={3} steps={5} />
                        </div>
                        <div class='space-y-2'>
                            <p class='text-sm text-muted-foreground'>7 steps</p>
                            <SteppedProgress value={5} steps={7} />
                        </div>
                        <div class='space-y-2'>
                            <p class='text-sm text-muted-foreground'>
                                10 steps
                            </p>
                            <SteppedProgress value={7} steps={10} />
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<SteppedProgress value={2} steps={3} />
<SteppedProgress value={3} steps={5} />
<SteppedProgress value={5} steps={7} />
<SteppedProgress value={7} steps={10} />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'With End Label',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-4'>
                        <SteppedProgress value={1} steps={4} endLabel />
                        <SteppedProgress value={2} steps={4} endLabel />
                        <SteppedProgress value={3} steps={4} endLabel />
                        <SteppedProgress value={4} steps={4} endLabel />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<SteppedProgress value={2} steps={4} endLabel />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'With Inner Label',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-4'>
                        <SteppedProgress value={1} steps={4} innerLabel />
                        <SteppedProgress value={2} steps={4} innerLabel />
                        <SteppedProgress value={3} steps={4} innerLabel />
                        <SteppedProgress value={4} steps={4} innerLabel />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<SteppedProgress value={2} steps={4} innerLabel />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Inner Label with Custom Thickness',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-4'>
                        <SteppedProgress
                            value={3}
                            steps={5}
                            innerLabel
                            thickness={8}
                        />
                        <SteppedProgress
                            value={7}
                            steps={10}
                            innerLabel
                            thickness={8}
                            variant='success'
                        />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<SteppedProgress value={3} steps={5} innerLabel thickness={8} />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'With Checkmark When Complete',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-4'>
                        <SteppedProgress
                            value={10}
                            steps={10}
                            variant='success'
                            showCheck
                        />
                        <SteppedProgress
                            value={4}
                            steps={4}
                            variant='success'
                            showCheck
                        />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<SteppedProgress value={10} steps={10} variant="success" showCheck />`}
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
                        <SteppedProgress value={2} steps={4} endLabel />
                        <SteppedProgress
                            value={1}
                            steps={4}
                            variant='destructive'
                            endLabel
                        />
                        <SteppedProgress
                            value={3}
                            steps={4}
                            variant='warning'
                            endLabel
                        />
                        <SteppedProgress
                            value={4}
                            steps={4}
                            variant='success'
                            showCheck
                        />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<SteppedProgress value={1} steps={4} variant="destructive" endLabel />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Custom Thickness',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-4'>
                        <SteppedProgress value={2} steps={4} thickness={1} />
                        <SteppedProgress value={2} steps={4} thickness={2.5} />
                        <SteppedProgress value={2} steps={4} thickness={4} />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<SteppedProgress value={2} steps={4} thickness={4} />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Striped Progress',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-4'>
                        <SteppedProgress value={2} steps={4} striped />
                        <SteppedProgress value={3} steps={5} striped />
                        <SteppedProgress value={5} steps={7} striped />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<SteppedProgress value={3} steps={5} striped />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Striped Animated Progress',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-4'>
                        <SteppedProgress value={2} steps={4} striped animated />
                        <SteppedProgress
                            value={3}
                            steps={5}
                            striped
                            animated
                            variant='success'
                        />
                        <SteppedProgress
                            value={5}
                            steps={7}
                            striped
                            animated
                            variant='warning'
                        />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<SteppedProgress value={3} steps={5} striped animated variant="success" />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Outlined Progress',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-4'>
                        <SteppedProgress value={2} steps={4} outlined />
                        <SteppedProgress value={3} steps={5} outlined />
                        <SteppedProgress value={5} steps={7} outlined />
                        <SteppedProgress value={8} steps={10} outlined />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<SteppedProgress value={3} steps={5} outlined />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Outlined Progress Variants',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-4'>
                        <SteppedProgress value={3} steps={5} outlined />
                        <SteppedProgress
                            value={4}
                            steps={5}
                            outlined
                            variant='success'
                        />
                        <SteppedProgress
                            value={2}
                            steps={5}
                            outlined
                            variant='warning'
                        />
                        <SteppedProgress
                            value={1}
                            steps={5}
                            outlined
                            variant='destructive'
                        />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<SteppedProgress value={4} steps={5} outlined variant="success" />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Outlined Many Steps (Success)',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-4'>
                        <SteppedProgress
                            value={8}
                            steps={12}
                            outlined
                            variant='success'
                            thickness={4}
                        />
                        <SteppedProgress
                            value={15}
                            steps={20}
                            outlined
                            striped
                            animated
                            variant='success'
                            thickness={4}
                        />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<SteppedProgress value={15} steps={20} outlined striped animated variant="success" thickness={4} />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Outlined Striped Animated (Large)',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-4'>
                        <SteppedProgress
                            value={3}
                            steps={5}
                            outlined
                            striped
                            animated
                            thickness={4}
                        />
                        <SteppedProgress
                            value={5}
                            steps={7}
                            outlined
                            striped
                            animated
                            thickness={4}
                            variant='success'
                        />
                        <SteppedProgress
                            value={8}
                            steps={10}
                            outlined
                            striped
                            animated
                            thickness={4}
                            variant='warning'
                        />
                        <SteppedProgress
                            value={12}
                            steps={15}
                            outlined
                            striped
                            animated
                            thickness={4}
                            variant='destructive'
                        />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<SteppedProgress
  value={8}
  steps={10}
  outlined
  striped
  animated
  thickness={4}
  variant="success"
/>`}
                </CodeBlock>
            </div>
        ),
    },
]
