import {
    Card,
    CardContent,
    CircularProgress,
    CodeBlock,
    Progress,
} from '@lockness/ui/components'
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

                {/* Floating Label */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        FLOATING LABEL
                    </h2>
                    <p class='text-muted-foreground'>
                        A label that floats above the progress bar, following
                        the current progress position.
                    </p>
                    <Card>
                        <CardContent class='p-6 space-y-6'>
                            <Progress value={25} floatingLabel />
                            <Progress value={50} floatingLabel />
                            <Progress value={75} floatingLabel />
                            <Progress value={100} floatingLabel />
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<Progress value={50} floatingLabel />`}
                    </CodeBlock>

                    <p class='text-muted-foreground'>
                        Floating labels also support variants:
                    </p>
                    <Card>
                        <CardContent class='p-6 space-y-6'>
                            <Progress value={60} floatingLabel />
                            <Progress
                                value={80}
                                floatingLabel
                                variant='success'
                            />
                            <Progress
                                value={45}
                                floatingLabel
                                variant='warning'
                            />
                            <Progress
                                value={30}
                                floatingLabel
                                variant='destructive'
                            />
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<Progress value={80} floatingLabel variant="success" />`}
                    </CodeBlock>
                </section>

                {/* Inner Label */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        INNER LABEL
                    </h2>
                    <p class='text-muted-foreground'>
                        Display the percentage inside the progress bar itself.
                        Works best with larger sizes.
                    </p>
                    <Card>
                        <CardContent class='p-6 space-y-6'>
                            <Progress value={25} innerLabel />
                            <Progress value={50} innerLabel />
                            <Progress value={75} innerLabel />
                            <Progress value={100} innerLabel />
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<Progress value={50} innerLabel />`}
                    </CodeBlock>

                    <p class='text-muted-foreground'>
                        Inner labels with different variants:
                    </p>
                    <Card>
                        <CardContent class='p-6 space-y-6'>
                            <Progress value={60} innerLabel />
                            <Progress value={80} innerLabel variant='success' />
                            <Progress value={45} innerLabel variant='warning' />
                            <Progress
                                value={30}
                                innerLabel
                                variant='destructive'
                            />
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<Progress value={80} innerLabel variant="success" />`}
                    </CodeBlock>
                </section>

                {/* End Label */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        END LABEL
                    </h2>
                    <p class='text-muted-foreground'>
                        Place the percentage label at the end (right side) of
                        the progress bar.
                    </p>
                    <Card>
                        <CardContent class='p-6 space-y-4'>
                            <Progress value={25} endLabel />
                            <Progress value={50} endLabel />
                            <Progress value={75} endLabel />
                            <Progress value={100} endLabel />
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<Progress value={50} endLabel />`}
                    </CodeBlock>

                    <p class='text-muted-foreground'>
                        End labels with different variants:
                    </p>
                    <Card>
                        <CardContent class='p-6 space-y-4'>
                            <Progress value={60} endLabel />
                            <Progress value={80} endLabel variant='success' />
                            <Progress value={45} endLabel variant='warning' />
                            <Progress
                                value={30}
                                endLabel
                                variant='destructive'
                            />
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<Progress value={80} endLabel variant="success" />`}
                    </CodeBlock>
                </section>

                {/* Vertical */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        VERTICAL
                    </h2>
                    <p class='text-muted-foreground'>
                        Display progress bars vertically.
                    </p>
                    <Card>
                        <CardContent class='p-6'>
                            <div class='flex gap-x-8'>
                                <Progress value={25} vertical />
                                <Progress value={50} vertical />
                                <Progress value={75} vertical />
                                <Progress value={90} vertical />
                                <Progress value={17} vertical />
                            </div>
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<div class="flex gap-x-8">
  <Progress value={25} vertical />
  <Progress value={50} vertical />
  <Progress value={75} vertical />
</div>`}
                    </CodeBlock>

                    <p class='text-muted-foreground'>
                        Vertical progress bars with different variants:
                    </p>
                    <Card>
                        <CardContent class='p-6'>
                            <div class='flex gap-x-8'>
                                <Progress value={60} vertical />
                                <Progress
                                    value={80}
                                    vertical
                                    variant='success'
                                />
                                <Progress
                                    value={45}
                                    vertical
                                    variant='warning'
                                />
                                <Progress
                                    value={30}
                                    vertical
                                    variant='destructive'
                                />
                            </div>
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<Progress value={80} vertical variant="success" />`}
                    </CodeBlock>

                    <p class='text-muted-foreground'>
                        Different sizes for vertical progress:
                    </p>
                    <Card>
                        <CardContent class='p-6'>
                            <div class='flex gap-x-8 items-end'>
                                <Progress value={60} vertical size='sm' />
                                <Progress value={60} vertical />
                                <Progress value={60} vertical size='lg' />
                            </div>
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<Progress value={60} vertical size="lg" />`}
                    </CodeBlock>
                </section>

                {/* Circular Progress */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        CIRCULAR PROGRESS
                    </h2>
                    <p class='text-muted-foreground'>
                        A circular progress indicator using SVG. Great for
                        dashboards and compact displays.
                    </p>
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

                    <p class='text-muted-foreground'>
                        With percentage label in the center:
                    </p>
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

                    <p class='text-muted-foreground'>
                        Different sizes (sm, default, lg, xl):
                    </p>
                    <Card>
                        <CardContent class='p-6'>
                            <div class='flex gap-8 items-end'>
                                <CircularProgress
                                    value={60}
                                    size='sm'
                                    showLabel
                                />
                                <CircularProgress value={60} showLabel />
                                <CircularProgress
                                    value={60}
                                    size='lg'
                                    showLabel
                                />
                                <CircularProgress
                                    value={60}
                                    size='xl'
                                    showLabel
                                />
                            </div>
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<CircularProgress value={60} size="xl" showLabel />`}
                    </CodeBlock>

                    <p class='text-muted-foreground'>
                        Variants with labels:
                    </p>
                    <Card>
                        <CardContent class='p-6'>
                            <div class='flex gap-8 items-center'>
                                <CircularProgress
                                    value={60}
                                    size='lg'
                                    showLabel
                                />
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

                    <p class='text-muted-foreground'>
                        Custom stroke width:
                    </p>
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

                {/* Custom Thickness */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        CUSTOM THICKNESS
                    </h2>
                    <p class='text-muted-foreground'>
                        Use the <code class='bg-muted px-1.5 py-0.5 rounded text-sm'>thickness</code> prop
                        with a numeric value representing Tailwind spacing
                        units (1 = 0.25rem).
                    </p>
                    <Card>
                        <CardContent class='p-6 space-y-4'>
                            <div class='space-y-2'>
                                <p class='text-sm text-muted-foreground'>
                                    thickness={1.5} (0.375rem)
                                </p>
                                <Progress value={25} thickness={1.5} />
                            </div>
                            <div class='space-y-2'>
                                <p class='text-sm text-muted-foreground'>
                                    thickness={4} (1rem)
                                </p>
                                <Progress value={50} thickness={4} />
                            </div>
                            <div class='space-y-2'>
                                <p class='text-sm text-muted-foreground'>
                                    thickness={6} (1.5rem)
                                </p>
                                <Progress value={75} thickness={6} />
                            </div>
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<Progress value={25} thickness={1.5} />
<Progress value={50} thickness={4} />
<Progress value={75} thickness={6} />`}
                    </CodeBlock>

                    <p class='text-muted-foreground'>
                        Same numeric values work for vertical progress bars:
                    </p>
                    <Card>
                        <CardContent class='p-6'>
                            <div class='flex gap-x-8 items-end'>
                                <div class='text-center'>
                                    <Progress
                                        value={60}
                                        vertical
                                        thickness={1}
                                    />
                                    <p class='text-xs text-muted-foreground mt-2'>
                                        1
                                    </p>
                                </div>
                                <div class='text-center'>
                                    <Progress
                                        value={60}
                                        vertical
                                        thickness={3}
                                    />
                                    <p class='text-xs text-muted-foreground mt-2'>
                                        3
                                    </p>
                                </div>
                                <div class='text-center'>
                                    <Progress
                                        value={60}
                                        vertical
                                        thickness={6}
                                    />
                                    <p class='text-xs text-muted-foreground mt-2'>
                                        6
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<Progress value={60} vertical thickness={3} />`}
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
                                        thickness
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        number
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        -
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Custom thickness in spacing units (1 =
                                        0.25rem)
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
                                        Show percentage label (left-right
                                        layout)
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        floatingLabel
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        boolean
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        false
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Show floating label that follows
                                        progress
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        innerLabel
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        boolean
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        false
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Show label inside the progress bar
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        endLabel
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        boolean
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        false
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Show label at the end (right side)
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        vertical
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        boolean
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        false
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Display progress bar vertically
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <h3 class='font-pixel text-xs text-foreground mt-6'>
                        CircularProgress Props
                    </h3>
                    <div class='overflow-x-auto'>
                        <table class='w-full text-sm'>
                            <thead>
                                <tr class='border-b'>
                                    <th class='py-3 px-4 text-left font-medium'>
                                        Prop
                                    </th>
                                    <th class='py-3 px-4 text-left font-medium'>
                                        Type
                                    </th>
                                    <th class='py-3 px-4 text-left font-medium'>
                                        Default
                                    </th>
                                    <th class='py-3 px-4 text-left font-medium'>
                                        Description
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
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
                                        'sm' | 'default' | 'lg' | 'xl'
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        'default'
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Size of the circular progress
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        strokeWidth
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        number
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        2
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Thickness of the progress circle
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
                                        Show percentage in the center
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
