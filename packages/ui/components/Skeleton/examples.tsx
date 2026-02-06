/**
 * @fileoverview Live examples for Skeleton component
 */

import { Card, CardContent } from '../Card/mod.tsx'
import { CodeBlock } from '../CodeBlock/mod.tsx'
import { Skeleton, SkeletonAvatar, SkeletonCard, SkeletonText } from './mod.tsx'
import { createDocsSection } from '../../docs_renderer.tsx'

export interface ExampleSection {
    title: string
    render: () => unknown
}

export const examples: ExampleSection[] = [
    // Documentation section - renders DOCS.md content
    createDocsSection('Skeleton'),
    {
        title: 'Default Skeleton',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <Skeleton class='h-12 w-48' />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`import { Skeleton } from '@lockness/ui/components'

<Skeleton class="h-12 w-48" />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Text Skeleton',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-4'>
                        <div>
                            <p class='text-sm text-muted-foreground mb-2'>
                                Single line:
                            </p>
                            <Skeleton variant='text' />
                        </div>
                        <div>
                            <p class='text-sm text-muted-foreground mb-2'>
                                Multiple lines:
                            </p>
                            <SkeletonText lines={3} />
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`import { Skeleton, SkeletonText } from '@lockness/ui/components'

// Single line
<Skeleton variant="text" />

// Multiple lines
<SkeletonText lines={3} />

// Or use the variant prop
<Skeleton variant="text" lines={3} />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Heading Skeleton',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <Skeleton variant='heading' />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<Skeleton variant="heading" />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Avatar Skeleton',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <div class='flex items-center space-x-4'>
                            <SkeletonAvatar />
                            <div class='space-y-2 flex-1'>
                                <Skeleton variant='text' />
                                <Skeleton variant='text' class='w-4/5' />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`import { SkeletonAvatar } from '@lockness/ui/components'

<div class="flex items-center space-x-4">
    <SkeletonAvatar />
    <div class="space-y-2 flex-1">
        <Skeleton variant="text" />
        <Skeleton variant="text" class="w-4/5" />
    </div>
</div>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Button Skeleton',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 flex gap-4'>
                        <Skeleton variant='button' />
                        <Skeleton variant='button' class='w-32' />
                        <Skeleton variant='button' class='w-full' />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<Skeleton variant="button" />
<Skeleton variant="button" class="w-32" />
<Skeleton variant="button" class="w-full" />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Image Skeleton',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <Skeleton variant='image' class='max-w-md' />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<Skeleton variant="image" />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Card Skeleton',
        render: () => (
            <div class='space-y-4'>
                <div class='grid md:grid-cols-2 lg:grid-cols-3 gap-4'>
                    <SkeletonCard />
                    <SkeletonCard />
                    <SkeletonCard />
                </div>
                <CodeBlock lang='tsx'>
                    {`import { SkeletonCard } from '@lockness/ui/components'

<div class="grid md:grid-cols-3 gap-4">
    <SkeletonCard />
    <SkeletonCard />
    <SkeletonCard />
</div>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Without Animation',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 flex gap-4'>
                        <Skeleton variant='avatar' animate={false} />
                        <div class='space-y-2 flex-1'>
                            <Skeleton variant='text' animate={false} />
                            <Skeleton
                                variant='text'
                                animate={false}
                                class='w-3/4'
                            />
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<Skeleton variant="avatar" animate={false} />
<Skeleton variant="text" animate={false} />`}
                </CodeBlock>
            </div>
        ),
    },
]
