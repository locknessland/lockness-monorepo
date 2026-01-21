import {
    Card,
    CardContent,
    CircularProgress,
    CodeBlock,
    GaugeProgress,
    Progress,
    SteppedProgress,
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

                {/* Stepped Progress */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        STEPPED PROGRESS
                    </h2>
                    <p class='text-muted-foreground'>
                        A segmented progress bar showing discrete steps. Useful
                        for multi-step forms, onboarding flows, or displaying
                        progress in stages.
                    </p>
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

                    <p class='text-muted-foreground'>
                        Different number of steps:
                    </p>
                    <Card>
                        <CardContent class='p-6 space-y-4'>
                            <div class='space-y-2'>
                                <p class='text-sm text-muted-foreground'>
                                    3 steps
                                </p>
                                <SteppedProgress value={2} steps={3} />
                            </div>
                            <div class='space-y-2'>
                                <p class='text-sm text-muted-foreground'>
                                    5 steps
                                </p>
                                <SteppedProgress value={3} steps={5} />
                            </div>
                            <div class='space-y-2'>
                                <p class='text-sm text-muted-foreground'>
                                    7 steps
                                </p>
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

                    <p class='text-muted-foreground'>
                        With end label (percentage at the right):
                    </p>
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

                    <p class='text-muted-foreground'>
                        With inner label (step count inside the bar):
                    </p>
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

                    <p class='text-muted-foreground'>
                        Inner label with custom thickness:
                    </p>
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

                    <p class='text-muted-foreground'>
                        With checkmark when complete:
                    </p>
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

                    <p class='text-muted-foreground'>
                        Different variants:
                    </p>
                    <Card>
                        <CardContent class='p-6 space-y-4'>
                            <SteppedProgress
                                value={2}
                                steps={4}
                                endLabel
                            />
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

                    <p class='text-muted-foreground'>
                        Custom thickness:
                    </p>
                    <Card>
                        <CardContent class='p-6 space-y-4'>
                            <SteppedProgress
                                value={2}
                                steps={4}
                                thickness={1}
                            />
                            <SteppedProgress
                                value={2}
                                steps={4}
                                thickness={2.5}
                            />
                            <SteppedProgress
                                value={2}
                                steps={4}
                                thickness={4}
                            />
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<SteppedProgress value={2} steps={4} thickness={4} />`}
                    </CodeBlock>
                </section>

                {/* Gauge Progress */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        GAUGE PROGRESS
                    </h2>
                    <p class='text-muted-foreground'>
                        A gauge/dial progress component for displaying metrics
                        like scores, performance indicators, or completion
                        status.
                    </p>
                    <Card>
                        <CardContent class='p-6'>
                            <div class='flex flex-wrap gap-8 items-center justify-center'>
                                <GaugeProgress value={25} label='Score' />
                                <GaugeProgress value={50} label='Score' />
                                <GaugeProgress value={75} label='Score' />
                                <GaugeProgress value={100} label='Score' />
                            </div>
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`import { GaugeProgress } from '@lockness/ui/components'

<GaugeProgress value={50} label="Score" />`}
                    </CodeBlock>

                    <p class='text-muted-foreground'>
                        Half circle gauge (180°):
                    </p>
                    <Card>
                        <CardContent class='p-6'>
                            <div class='flex flex-wrap gap-8 items-center justify-center'>
                                <GaugeProgress
                                    value={25}
                                    type='half'
                                    label='Score'
                                />
                                <GaugeProgress
                                    value={50}
                                    type='half'
                                    label='Score'
                                />
                                <GaugeProgress
                                    value={75}
                                    type='half'
                                    label='Score'
                                />
                                <GaugeProgress
                                    value={100}
                                    type='half'
                                    label='Score'
                                />
                            </div>
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<GaugeProgress value={75} type="half" label="Score" />`}
                    </CodeBlock>

                    <p class='text-muted-foreground'>
                        Different variants:
                    </p>
                    <Card>
                        <CardContent class='p-6'>
                            <div class='flex flex-wrap gap-8 items-center justify-center'>
                                <GaugeProgress
                                    value={60}
                                    label='Default'
                                />
                                <GaugeProgress
                                    value={90}
                                    variant='success'
                                    label='Health'
                                />
                                <GaugeProgress
                                    value={45}
                                    variant='warning'
                                    label='Warning'
                                />
                                <GaugeProgress
                                    value={25}
                                    variant='destructive'
                                    label='Risk'
                                />
                            </div>
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<GaugeProgress value={90} variant="success" label="Health" />
<GaugeProgress value={25} variant="destructive" label="Risk" />`}
                    </CodeBlock>

                    <p class='text-muted-foreground'>
                        Different sizes:
                    </p>
                    <Card>
                        <CardContent class='p-6'>
                            <div class='flex flex-wrap gap-8 items-end justify-center'>
                                <div class='text-center'>
                                    <GaugeProgress
                                        value={60}
                                        size='sm'
                                        label='SM'
                                    />
                                </div>
                                <div class='text-center'>
                                    <GaugeProgress
                                        value={60}
                                        size='default'
                                        label='Default'
                                    />
                                </div>
                                <div class='text-center'>
                                    <GaugeProgress
                                        value={60}
                                        size='lg'
                                        label='LG'
                                    />
                                </div>
                                <div class='text-center'>
                                    <GaugeProgress
                                        value={60}
                                        size='xl'
                                        label='XL'
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<GaugeProgress value={60} size="sm" />
<GaugeProgress value={60} size="lg" />
<GaugeProgress value={60} size="xl" />`}
                    </CodeBlock>

                    <p class='text-muted-foreground'>
                        Custom stroke width:
                    </p>
                    <Card>
                        <CardContent class='p-6'>
                            <div class='flex flex-wrap gap-8 items-center justify-center'>
                                <GaugeProgress
                                    value={70}
                                    strokeWidth={1}
                                    label='Thin'
                                />
                                <GaugeProgress
                                    value={70}
                                    strokeWidth={2}
                                    label='Medium'
                                />
                                <GaugeProgress
                                    value={70}
                                    strokeWidth={3}
                                    label='Thick'
                                />
                            </div>
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<GaugeProgress value={70} strokeWidth={3} />`}
                    </CodeBlock>

                    <p class='text-muted-foreground'>
                        Without label:
                    </p>
                    <Card>
                        <CardContent class='p-6'>
                            <div class='flex flex-wrap gap-8 items-center justify-center'>
                                <GaugeProgress value={50} showLabel={false} />
                                <GaugeProgress
                                    value={75}
                                    type='half'
                                    showLabel={false}
                                />
                            </div>
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<GaugeProgress value={50} showLabel={false} />`}
                    </CodeBlock>

                    <p class='text-muted-foreground'>
                        Half circle variants:
                    </p>
                    <Card>
                        <CardContent class='p-6'>
                            <div class='flex flex-wrap gap-8 items-center justify-center'>
                                <GaugeProgress
                                    value={60}
                                    type='half'
                                    label='Default'
                                />
                                <GaugeProgress
                                    value={90}
                                    type='half'
                                    variant='success'
                                    label='Health'
                                />
                                <GaugeProgress
                                    value={45}
                                    type='half'
                                    variant='warning'
                                    label='Warning'
                                />
                                <GaugeProgress
                                    value={25}
                                    type='half'
                                    variant='destructive'
                                    label='Risk'
                                />
                            </div>
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<GaugeProgress value={90} type="half" variant="success" label="Health" />`}
                    </CodeBlock>

                    <p class='text-muted-foreground'>
                        Stroke line cap (rounded vs flat ends):
                    </p>
                    <Card>
                        <CardContent class='p-6'>
                            <div class='flex flex-wrap gap-8 items-center justify-center'>
                                <GaugeProgress
                                    value={25}
                                    strokeLinecap='butt'
                                    strokeWidth={2}
                                    label='Flat'
                                />
                                <GaugeProgress
                                    value={25}
                                    strokeLinecap='round'
                                    strokeWidth={2}
                                    label='Round'
                                />
                            </div>
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<GaugeProgress value={25} strokeLinecap="butt" />
<GaugeProgress value={25} strokeLinecap="round" />`}
                    </CodeBlock>

                    <p class='text-muted-foreground'>
                        Independent track stroke width:
                    </p>
                    <Card>
                        <CardContent class='p-6'>
                            <div class='flex flex-wrap gap-8 items-center justify-center'>
                                <GaugeProgress
                                    value={50}
                                    type='half'
                                    strokeWidth={1}
                                    trackStrokeWidth={3}
                                    label='Thick track'
                                />
                                <GaugeProgress
                                    value={75}
                                    strokeWidth={2}
                                    trackStrokeWidth={1}
                                    label='Thin track'
                                />
                            </div>
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<GaugeProgress value={50} strokeWidth={1} trackStrokeWidth={3} />`}
                    </CodeBlock>

                    <p class='text-muted-foreground'>
                        Custom colors (override variant):
                    </p>
                    <Card>
                        <CardContent class='p-6'>
                            <div class='flex flex-wrap gap-8 items-center justify-center'>
                                <GaugeProgress
                                    value={25}
                                    strokeWidth={2}
                                    trackStrokeWidth={1}
                                    strokeLinecap='butt'
                                    progressColor='text-purple-600 dark:text-purple-500'
                                    trackColor='text-purple-200 dark:text-neutral-700'
                                    label='mph'
                                />
                                <GaugeProgress
                                    value={75}
                                    strokeWidth={2}
                                    trackStrokeWidth={1}
                                    progressColor='text-green-500 dark:text-green-500'
                                    trackColor='text-green-200 dark:text-neutral-700'
                                    label='Score'
                                />
                                <GaugeProgress
                                    value={50}
                                    type='half'
                                    strokeWidth={1}
                                    trackStrokeWidth={3}
                                    progressColor='text-orange-600 dark:text-orange-500'
                                    trackColor='text-orange-100 dark:text-neutral-700'
                                    label='Average'
                                />
                            </div>
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<GaugeProgress
  value={75}
  progressColor="text-purple-600 dark:text-purple-500"
  trackColor="text-purple-200 dark:text-neutral-700"
  label="Score"
/>`}
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
                        Use the{' '}
                        <code class='bg-muted px-1.5 py-0.5 rounded text-sm'>
                            thickness
                        </code>{' '}
                        prop with a numeric value representing Tailwind spacing
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

                    <h3 class='font-pixel text-xs text-foreground mt-6'>
                        SteppedProgress Props
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
                                        Current step (1-based index)
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        steps
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        number
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        4
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Total number of steps
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
                                        thickness
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        number
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        2.5
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Custom thickness (1 = 0.25rem)
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
                                        Show percentage label at the end (right
                                        side)
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
                                        Show step count inside the bar (e.g. "2
                                        of 4")
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
                                        Deprecated, use endLabel instead
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        showCheck
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        boolean
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        false
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Show checkmark when complete
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <h3 class='font-pixel text-xs text-foreground mt-6'>
                        GaugeProgress Props
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
                                        Current progress value (0-100)
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
                                        type
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        'gauge' | 'half'
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        'gauge'
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Gauge type: 270° or 180° arc
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
                                        Size of the gauge
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
                                        1.5
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Stroke width of the progress arc
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        trackStrokeWidth
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        number
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        strokeWidth
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Stroke width of the background track
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        strokeLinecap
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        'round' | 'butt' | 'square'
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        'round'
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Shape of stroke ends
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        progressColor
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        string
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        -
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Custom color class for progress arc
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        trackColor
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        string
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        -
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Custom color class for background track
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
                                        true
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Show the value in the center
                                    </td>
                                </tr>
                                <tr>
                                    <td class='py-3 px-4 font-mono text-xs'>
                                        label
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        string
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        -
                                    </td>
                                    <td class='py-3 px-4 text-muted-foreground'>
                                        Custom label below the value (e.g.
                                        "Score")
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
