import { Card, CardContent, CodeBlock, Progress } from '@lockness/ui/components'
import { PageUiLayout } from '@view/layouts/ui_layout.tsx'

export const ProgressPage = () => {
    return (
        <PageUiLayout title='Progress - Lockness UI'>
            <div class='space-y-8 max-w-full'>
                <header>
                    <h1 class='font-pixel text-2xl text-foreground mb-2'>
                        PROGRESS
                    </h1>
                    <p class='text-lg text-muted-foreground'>
                        A progress bar component for displaying completion
                        status. Pure CSS implementation with smooth animations.
                    </p>
                </header>

                {/* Basic Usage */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        BASIC USAGE
                    </h2>
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
                </section>

                {/* With Label */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        WITH LABEL
                    </h2>
                    <p class='text-muted-foreground'>
                        Display a percentage label above the progress bar.
                    </p>
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
                </section>

                {/* Variants */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>VARIANTS</h2>
                    <p class='text-muted-foreground'>
                        Different color variants for various states.
                    </p>
                    <Card>
                        <CardContent class='p-6 space-y-6'>
                            <div class='space-y-2'>
                                <p class='text-sm text-muted-foreground'>
                                    Default
                                </p>
                                <Progress value={60} />
                            </div>
                            <div class='space-y-2'>
                                <p class='text-sm text-muted-foreground'>
                                    Success
                                </p>
                                <Progress value={100} variant='success' />
                            </div>
                            <div class='space-y-2'>
                                <p class='text-sm text-muted-foreground'>
                                    Warning
                                </p>
                                <Progress value={45} variant='warning' />
                            </div>
                            <div class='space-y-2'>
                                <p class='text-sm text-muted-foreground'>
                                    Destructive
                                </p>
                                <Progress value={80} variant='destructive' />
                            </div>
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<Progress value={100} variant="success" />
<Progress value={45} variant="warning" />
<Progress value={80} variant="destructive" />`}
                    </CodeBlock>
                </section>

                {/* Sizes */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>SIZES</h2>
                    <p class='text-muted-foreground'>
                        Three size options: sm, default, and lg.
                    </p>
                    <Card>
                        <CardContent class='p-6 space-y-6'>
                            <div class='space-y-2'>
                                <p class='text-sm text-muted-foreground'>
                                    Small (sm)
                                </p>
                                <Progress value={50} size='sm' />
                            </div>
                            <div class='space-y-2'>
                                <p class='text-sm text-muted-foreground'>
                                    Default
                                </p>
                                <Progress value={50} size='default' />
                            </div>
                            <div class='space-y-2'>
                                <p class='text-sm text-muted-foreground'>
                                    Large (lg)
                                </p>
                                <Progress value={50} size='lg' />
                            </div>
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<Progress value={50} size="sm" />
<Progress value={50} size="default" />
<Progress value={50} size="lg" />`}
                    </CodeBlock>
                </section>

                {/* Custom Max Value */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        CUSTOM MAX VALUE
                    </h2>
                    <p class='text-muted-foreground'>
                        Use a custom max value for different scales (e.g., 10
                        steps, file count).
                    </p>
                    <Card>
                        <CardContent class='p-6 space-y-6'>
                            <div class='space-y-2'>
                                <p class='text-sm text-muted-foreground'>
                                    Step 3 of 5
                                </p>
                                <Progress value={3} max={5} showLabel />
                            </div>
                            <div class='space-y-2'>
                                <p class='text-sm text-muted-foreground'>
                                    7 of 10 files uploaded
                                </p>
                                <Progress
                                    value={7}
                                    max={10}
                                    variant='success'
                                    showLabel
                                />
                            </div>
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<Progress value={3} max={5} showLabel />
<Progress value={7} max={10} variant="success" showLabel />`}
                    </CodeBlock>
                </section>

                {/* Real-world Examples */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        REAL-WORLD EXAMPLES
                    </h2>

                    {/* File Upload */}
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

                    {/* Profile Completion */}
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

                    {/* Storage Usage */}
                    <Card>
                        <CardContent class='p-6'>
                            <div class='space-y-3'>
                                <div class='flex justify-between text-sm'>
                                    <span class='font-medium'>
                                        Storage Used
                                    </span>
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
                </section>

                {/* Props Reference */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        PROPS REFERENCE
                    </h2>
                    <div class='overflow-x-auto'>
                        <table class='w-full text-sm'>
                            <thead>
                                <tr class='border-b'>
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
                            <tbody class='divide-y'>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        value
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        number
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        0
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Current progress value
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        max
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        number
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        100
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Maximum value
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        variant
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        'default' | 'success' | 'warning' |
                                        'destructive'
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        'default'
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Color variant
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        size
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        'sm' | 'default' | 'lg'
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        'default'
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Height of the progress bar
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        showLabel
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        boolean
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        false
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Show percentage label
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* Accessibility */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        ACCESSIBILITY
                    </h2>
                    <Card>
                        <CardContent class='p-6 space-y-4 text-muted-foreground'>
                            <p>
                                The Progress component includes proper ARIA
                                attributes for screen readers:
                            </p>
                            <ul class='list-disc list-inside space-y-2'>
                                <li>
                                    <code class='bg-muted px-1.5 py-0.5 rounded text-sm'>
                                        role="progressbar"
                                    </code>{' '}
                                    - Identifies the element as a progress bar
                                </li>
                                <li>
                                    <code class='bg-muted px-1.5 py-0.5 rounded text-sm'>
                                        aria-valuenow
                                    </code>{' '}
                                    - Current value
                                </li>
                                <li>
                                    <code class='bg-muted px-1.5 py-0.5 rounded text-sm'>
                                        aria-valuemin
                                    </code>{' '}
                                    - Minimum value (always 0)
                                </li>
                                <li>
                                    <code class='bg-muted px-1.5 py-0.5 rounded text-sm'>
                                        aria-valuemax
                                    </code>{' '}
                                    - Maximum value
                                </li>
                            </ul>
                        </CardContent>
                    </Card>
                </section>
            </div>
        </PageUiLayout>
    )
}
