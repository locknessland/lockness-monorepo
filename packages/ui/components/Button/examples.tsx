/**
 * @fileoverview Live examples for Button component
 */

import { Card, CardContent } from '../Card/mod.tsx'
import { CodeBlock } from '../CodeBlock/mod.tsx'
import { createDocsSection } from '../../docs_renderer.tsx'
import { Button } from './mod.tsx'

export interface ExampleSection {
    title: string
    render: () => unknown
}

export const examples: ExampleSection[] = [
    // Documentation section - renders DOCS.md content
    createDocsSection('Button'),
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
]
