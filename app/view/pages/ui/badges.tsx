import { Badge, Card, CardContent, CodeBlock } from '@lockness/ui/components'
import { PageUiLayout } from '@view/layouts/ui_layout.tsx'

export const BadgesPage = () => {
    return (
        <PageUiLayout title='Badges - Lockness UI' currentPath='/ui/badges'>
            <div class='space-y-12 max-w-full'>
                <header>
                    <h1 class='font-pixel text-2xl text-foreground mb-2'>
                        BADGES
                    </h1>
                    <p class='text-lg text-muted-foreground'>
                        Inline badge components for labels, tags, and status
                        indicators with customizable variants.
                    </p>
                </header>

                {/* Variants */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>VARIANTS</h2>
                    <p class='text-muted-foreground'>
                        Choose from 4 built-in variants to match your design
                        context.
                    </p>
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
                </section>

                {/* Use Cases */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        USE CASES
                    </h2>
                    <Card>
                        <CardContent class='p-6 space-y-4'>
                            <div class='flex items-center gap-2'>
                                <span class='text-foreground'>
                                    New Feature
                                </span>
                                <Badge>New</Badge>
                            </div>
                            <div class='flex items-center gap-2'>
                                <span class='text-foreground'>
                                    Beta Version
                                </span>
                                <Badge variant='secondary'>Beta</Badge>
                            </div>
                            <div class='flex items-center gap-2'>
                                <span class='text-foreground'>
                                    Critical Error
                                </span>
                                <Badge variant='destructive'>Error</Badge>
                            </div>
                            <div class='flex items-center gap-2'>
                                <span class='text-foreground'>
                                    Draft Status
                                </span>
                                <Badge variant='outline'>Draft</Badge>
                            </div>
                        </CardContent>
                    </Card>
                </section>

                {/* CSS Variables */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        CSS VARIABLES
                    </h2>
                    <p class='text-muted-foreground'>
                        Customize badges globally using CSS variables in your
                        app.css.
                    </p>
                    <CodeBlock lang='css'>
                        {`@theme {
    /* Badge customization */
    --badge-padding-x: 0.625rem;
    --badge-padding-y: 0.125rem;
    --badge-font-size: 0.75rem;
    --badge-font-weight: 600;
    --badge-border-radius: calc(var(--radius) * 2);
    --badge-border-width: 1px;
}`}
                    </CodeBlock>
                </section>

                {/* Props Reference */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        PROPS REFERENCE
                    </h2>
                    <div class='overflow-x-auto'>
                        <table class='w-full text-sm'>
                            <thead>
                                <tr class='border-b border-border'>
                                    <th class='text-left py-3 px-4 font-medium'>
                                        Prop
                                    </th>
                                    <th class='text-left py-3 px-4 font-medium'>
                                        Type
                                    </th>
                                    <th class='text-left py-3 px-4 font-medium'>
                                        Default
                                    </th>
                                    <th class='text-left py-3 px-4 font-medium'>
                                        Description
                                    </th>
                                </tr>
                            </thead>
                            <tbody class='text-muted-foreground'>
                                <tr class='border-b border-border'>
                                    <td class='py-3 px-4 font-mono text-foreground'>
                                        variant
                                    </td>
                                    <td class='py-3 px-4 font-mono'>
                                        'default' | 'secondary' | 'destructive'
                                        | 'outline'
                                    </td>
                                    <td class='py-3 px-4'>'default'</td>
                                    <td class='py-3 px-4'>
                                        Visual style variant
                                    </td>
                                </tr>
                                <tr class='border-b border-border'>
                                    <td class='py-3 px-4 font-mono text-foreground'>
                                        class
                                    </td>
                                    <td class='py-3 px-4 font-mono'>string</td>
                                    <td class='py-3 px-4'>-</td>
                                    <td class='py-3 px-4'>
                                        Additional CSS classes
                                    </td>
                                </tr>
                                <tr class='border-b border-border'>
                                    <td class='py-3 px-4 font-mono text-foreground'>
                                        children
                                    </td>
                                    <td class='py-3 px-4 font-mono'>
                                        ReactNode
                                    </td>
                                    <td class='py-3 px-4'>-</td>
                                    <td class='py-3 px-4'>Badge content</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* Installation */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        INSTALLATION
                    </h2>
                    <CodeBlock lang='bash'>
                        {`deno run -A jsr:@lockness/ui add badge`}
                    </CodeBlock>
                </section>
            </div>
        </PageUiLayout>
    )
}
