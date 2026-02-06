/**
 * @fileoverview Live examples for Spinner component
 */

import { Card, CardContent } from '../Card/mod.tsx'
import { CodeBlock } from '../CodeBlock/mod.tsx'
import { Spinner } from './mod.tsx'
import { createDocsSection } from '../../docs_renderer.tsx'

export interface ExampleSection {
    title: string
    render: () => unknown
}

export const examples: ExampleSection[] = [
    // Documentation section - renders DOCS.md content
    createDocsSection('Spinner'),
    {
        title: 'Basic Usage',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 flex items-center gap-4'>
                        <Spinner />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`import { Spinner } from '@lockness/ui/components'

<Spinner />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Color Variants',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 flex items-center gap-6 flex-wrap'>
                        <div class='flex flex-col items-center gap-2'>
                            <Spinner variant='primary' />
                            <span class='text-xs text-muted-foreground'>
                                primary
                            </span>
                        </div>
                        <div class='flex flex-col items-center gap-2'>
                            <Spinner variant='secondary' />
                            <span class='text-xs text-muted-foreground'>
                                secondary
                            </span>
                        </div>
                        <div class='flex flex-col items-center gap-2'>
                            <Spinner variant='muted' />
                            <span class='text-xs text-muted-foreground'>
                                muted
                            </span>
                        </div>
                        <div class='flex flex-col items-center gap-2'>
                            <Spinner variant='destructive' />
                            <span class='text-xs text-muted-foreground'>
                                destructive
                            </span>
                        </div>
                        <div class='flex flex-col items-center gap-2'>
                            <Spinner variant='success' />
                            <span class='text-xs text-muted-foreground'>
                                success
                            </span>
                        </div>
                        <div class='flex flex-col items-center gap-2'>
                            <Spinner variant='warning' />
                            <span class='text-xs text-muted-foreground'>
                                warning
                            </span>
                        </div>
                        <div class='flex flex-col items-center gap-2'>
                            <Spinner variant='info' />
                            <span class='text-xs text-muted-foreground'>
                                info
                            </span>
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<Spinner variant="primary" />
<Spinner variant="secondary" />
<Spinner variant="muted" />
<Spinner variant="destructive" />
<Spinner variant="success" />
<Spinner variant="warning" />
<Spinner variant="info" />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Sizes',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 flex items-center gap-8'>
                        <div class='flex flex-col items-center gap-2'>
                            <Spinner size='sm' />
                            <span class='text-xs text-muted-foreground'>
                                sm
                            </span>
                        </div>
                        <div class='flex flex-col items-center gap-2'>
                            <Spinner size='md' />
                            <span class='text-xs text-muted-foreground'>
                                md
                            </span>
                        </div>
                        <div class='flex flex-col items-center gap-2'>
                            <Spinner size='lg' />
                            <span class='text-xs text-muted-foreground'>
                                lg
                            </span>
                        </div>
                        <div class='flex flex-col items-center gap-2'>
                            <Spinner size='xl' />
                            <span class='text-xs text-muted-foreground'>
                                xl
                            </span>
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<Spinner size="sm" />  {/* 16px */}
<Spinner size="md" />  {/* 24px - default */}
<Spinner size="lg" />  {/* 32px */}
<Spinner size="xl" />  {/* 48px */}`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'With Text',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 flex flex-col items-center gap-6'>
                        <div class='flex items-center gap-3'>
                            <Spinner size='sm' variant='info' />
                            <span class='text-sm text-muted-foreground'>
                                Loading...
                            </span>
                        </div>
                        <div class='flex flex-col items-center gap-3'>
                            <Spinner size='lg' variant='primary' />
                            <span class='text-sm text-muted-foreground'>
                                Please wait while we load your data
                            </span>
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`{/* Inline with text */}
<div class="flex items-center gap-3">
  <Spinner size="sm" variant="info" />
  <span class="text-sm text-muted-foreground">Loading...</span>
</div>

{/* Stacked with text */}
<div class="flex flex-col items-center gap-3">
  <Spinner size="lg" variant="primary" />
  <span class="text-sm text-muted-foreground">
    Please wait while we load your data
  </span>
</div>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Button Loading State',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 flex items-center gap-4'>
                        <button
                            type='button'
                            class='inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md font-medium disabled:opacity-50'
                            disabled
                        >
                            <Spinner
                                size='sm'
                                class='text-primary-foreground'
                            />
                            Processing...
                        </button>
                        <button
                            type='button'
                            class='inline-flex items-center gap-2 px-4 py-2 border border-border bg-background text-foreground rounded-md font-medium disabled:opacity-50'
                            disabled
                        >
                            <Spinner size='sm' variant='muted' />
                            Saving...
                        </button>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<Button disabled>
  <Spinner size="sm" class="text-primary-foreground" />
  Processing...
</Button>

<Button variant="outline" disabled>
  <Spinner size="sm" variant="muted" />
  Saving...
</Button>`}
                </CodeBlock>
            </div>
        ),
    },
]
