/**
 * @fileoverview Live examples for Separator component
 */

import { Card, CardContent } from '../Card/mod.tsx'
import { CodeBlock } from '../CodeBlock/mod.tsx'
import { Separator } from './mod.tsx'
import { createDocsSection } from '../../docs_renderer.tsx'

export interface ExampleSection {
    title: string
    render: () => unknown
}

export const examples: ExampleSection[] = [
    // Documentation section - renders DOCS.md content
    createDocsSection('Separator'),
    {
        title: 'Horizontal Separator',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-4'>
                        <div>Content Above</div>
                        <Separator />
                        <div>Content Below</div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`import { Separator } from '@lockness/ui/components'

<div>Content Above</div>
<Separator />
<div>Content Below</div>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Vertical Separator',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <div class='flex items-center h-5 space-x-4 text-sm'>
                            <div>Item 1</div>
                            <Separator orientation='vertical' />
                            <div>Item 2</div>
                            <Separator orientation='vertical' />
                            <div>Item 3</div>
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<div class="flex items-center h-5 space-x-4 text-sm">
    <div>Item 1</div>
    <Separator orientation="vertical" />
    <div>Item 2</div>
    <Separator orientation="vertical" />
    <div>Item 3</div>
</div>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'With Labels',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <div class='flex items-center gap-4'>
                            <Separator class='flex-1' />
                            <span class='text-sm text-muted-foreground'>
                                OR
                            </span>
                            <Separator class='flex-1' />
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<div class="flex items-center gap-4">
    <Separator class="flex-1" />
    <span class="text-sm text-muted-foreground">OR</span>
    <Separator class="flex-1" />
</div>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Accessibility',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <p class='text-muted-foreground'>
                            By default, separators are decorative and hidden
                            from screen readers. Set{' '}
                            <code class='px-1 py-0.5 bg-muted rounded text-xs'>
                                decorative=&#123;false&#125;
                            </code>{' '}
                            for semantic separators.
                        </p>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`// Decorative (default) - hidden from screen readers
<Separator />
<Separator decorative={true} />

// Semantic - announced by screen readers
<Separator decorative={false} />`}
                </CodeBlock>
            </div>
        ),
    },
]
