import {
    Card,
    CardContent,
    CodeBlock,
    Separator,
} from '@lockness/ui/components'
import { PageUiLayout } from '@view/layouts/ui_layout.tsx'

export const SeparatorsPage = () => {
    return (
        <PageUiLayout title='Separators - Lockness UI'>
            <div class='space-y-12 max-w-full'>
                <header>
                    <h1 class='font-pixel text-2xl text-foreground mb-2'>
                        SEPARATORS
                    </h1>
                    <p class='text-lg text-muted-foreground'>
                        Visual divider components for separating content
                        sections with horizontal or vertical orientation.
                    </p>
                </header>

                {/* Horizontal Separator */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        HORIZONTAL SEPARATOR
                    </h2>
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
                </section>

                {/* Vertical Separator */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        VERTICAL SEPARATOR
                    </h2>
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
                </section>

                {/* With Labels */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        WITH LABELS
                    </h2>
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
                </section>

                {/* Accessibility */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        ACCESSIBILITY
                    </h2>
                    <p class='text-muted-foreground'>
                        By default, separators are decorative and hidden from
                        screen readers. Set{' '}
                        <code>decorative=&#123;false&#125;</code>{' '}
                        for semantic separators.
                    </p>
                    <CodeBlock lang='tsx'>
                        {`// Decorative (default) - hidden from screen readers
<Separator />
<Separator decorative={true} />

// Semantic - announced by screen readers
<Separator decorative={false} />`}
                    </CodeBlock>
                </section>

                {/* CSS Variables */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        CSS VARIABLES
                    </h2>
                    <CodeBlock lang='css'>
                        {`@theme {
    /* Separator customization */
    --separator-thickness: 1px;
    --separator-color: var(--border);
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
                                        orientation
                                    </td>
                                    <td class='py-3 px-4 font-mono'>
                                        'horizontal' | 'vertical'
                                    </td>
                                    <td class='py-3 px-4'>'horizontal'</td>
                                    <td class='py-3 px-4'>
                                        Separator direction
                                    </td>
                                </tr>
                                <tr class='border-b border-border'>
                                    <td class='py-3 px-4 font-mono text-foreground'>
                                        decorative
                                    </td>
                                    <td class='py-3 px-4 font-mono'>boolean</td>
                                    <td class='py-3 px-4'>true</td>
                                    <td class='py-3 px-4'>
                                        If true, hidden from assistive
                                        technology
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
                        {`deno run -A jsr:@lockness/ui add separator`}
                    </CodeBlock>
                </section>
            </div>
        </PageUiLayout>
    )
}
