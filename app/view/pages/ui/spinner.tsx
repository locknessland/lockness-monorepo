import {
    Alert,
    AlertDescription,
    AlertTitle,
    Card,
    CardContent,
    CodeBlock,
    Spinner,
} from '@lockness/ui/components'
import { PageUiLayout } from '@view/layouts/ui_layout.tsx'

export const SpinnerPage = () => {
    return (
        <PageUiLayout title='Spinner - Lockness UI' currentPath='/ui/spinner'>
            <div class='space-y-8 max-w-full'>
                <header>
                    <h1 class='font-pixel text-2xl text-foreground mb-2'>
                        SPINNER
                    </h1>
                    <p class='text-lg text-muted-foreground'>
                        A loading spinner component that indicates a loading
                        state using a rotating circle animation. Use it for
                        loading pages, cards, components, forms, and more.
                    </p>
                </header>

                {/* Basic Usage */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        BASIC USAGE
                    </h2>
                    <Card>
                        <CardContent class='p-6 flex items-center gap-4'>
                            <Spinner />
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`import { Spinner } from '@lockness/ui/components'

<Spinner />`}
                    </CodeBlock>
                </section>

                {/* Color Variants */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        COLOR VARIANTS
                    </h2>
                    <p class='text-muted-foreground'>
                        Predefined spinner color styles using the theme's color
                        system.
                    </p>
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
                </section>

                {/* Custom Colors */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        CUSTOM COLORS
                    </h2>
                    <p class='text-muted-foreground'>
                        Use inline styles for any custom color.
                    </p>
                    <Card>
                        <CardContent class='p-6 flex items-center gap-6 flex-wrap'>
                            <div
                                class='inline-block size-6 border-3 border-solid border-t-transparent rounded-full'
                                style={{
                                    borderColor: '#dc2626',
                                    borderTopColor: 'transparent',
                                    animation: 'spin 1s linear infinite',
                                }}
                                role='status'
                                aria-label='loading'
                            >
                                <span class='sr-only'>Loading...</span>
                            </div>
                            <div
                                class='inline-block size-6 border-3 border-solid border-t-transparent rounded-full'
                                style={{
                                    borderColor: '#ea580c',
                                    borderTopColor: 'transparent',
                                    animation: 'spin 1s linear infinite',
                                }}
                                role='status'
                                aria-label='loading'
                            >
                                <span class='sr-only'>Loading...</span>
                            </div>
                            <div
                                class='inline-block size-6 border-3 border-solid border-t-transparent rounded-full'
                                style={{
                                    borderColor: '#ca8a04',
                                    borderTopColor: 'transparent',
                                    animation: 'spin 1s linear infinite',
                                }}
                                role='status'
                                aria-label='loading'
                            >
                                <span class='sr-only'>Loading...</span>
                            </div>
                            <div
                                class='inline-block size-6 border-3 border-solid border-t-transparent rounded-full'
                                style={{
                                    borderColor: '#16a34a',
                                    borderTopColor: 'transparent',
                                    animation: 'spin 1s linear infinite',
                                }}
                                role='status'
                                aria-label='loading'
                            >
                                <span class='sr-only'>Loading...</span>
                            </div>
                            <div
                                class='inline-block size-6 border-3 border-solid border-t-transparent rounded-full'
                                style={{
                                    borderColor: '#2563eb',
                                    borderTopColor: 'transparent',
                                    animation: 'spin 1s linear infinite',
                                }}
                                role='status'
                                aria-label='loading'
                            >
                                <span class='sr-only'>Loading...</span>
                            </div>
                            <div
                                class='inline-block size-6 border-3 border-solid border-t-transparent rounded-full'
                                style={{
                                    borderColor: '#4f46e5',
                                    borderTopColor: 'transparent',
                                    animation: 'spin 1s linear infinite',
                                }}
                                role='status'
                                aria-label='loading'
                            >
                                <span class='sr-only'>Loading...</span>
                            </div>
                            <div
                                class='inline-block size-6 border-3 border-solid border-t-transparent rounded-full'
                                style={{
                                    borderColor: '#9333ea',
                                    borderTopColor: 'transparent',
                                    animation: 'spin 1s linear infinite',
                                }}
                                role='status'
                                aria-label='loading'
                            >
                                <span class='sr-only'>Loading...</span>
                            </div>
                            <div
                                class='inline-block size-6 border-3 border-solid border-t-transparent rounded-full'
                                style={{
                                    borderColor: '#db2777',
                                    borderTopColor: 'transparent',
                                    animation: 'spin 1s linear infinite',
                                }}
                                role='status'
                                aria-label='loading'
                            >
                                <span class='sr-only'>Loading...</span>
                            </div>
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`{/* Use inline styles for custom colors */}
<div
  class="inline-block size-6 border-3 border-solid border-t-transparent rounded-full"
  style={{
    borderColor: '#dc2626',
    borderTopColor: 'transparent',
    animation: 'spin 1s linear infinite'
  }}
  role="status"
  aria-label="loading"
>
  <span class="sr-only">Loading...</span>
</div>`}
                    </CodeBlock>
                </section>

                {/* Sizes */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>SIZES</h2>
                    <p class='text-muted-foreground'>
                        A small size is good for loading text, default for
                        card-level blocks, and large for page loading.
                    </p>
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
                </section>

                {/* In a Card */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        INSIDE A CARD
                    </h2>
                    <p class='text-muted-foreground'>
                        Spinner centered inside a card for content loading
                        states.
                    </p>
                    <Card>
                        <CardContent class='p-0'>
                            <div class='min-h-60 flex flex-col bg-card border border-border shadow-sm rounded-xl'>
                                <div class='flex flex-auto flex-col justify-center items-center p-4 md:p-5'>
                                    <div class='flex justify-center'>
                                        <Spinner variant='info' />
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<Card>
  <CardContent class="min-h-60 flex flex-auto flex-col justify-center items-center">
    <Spinner variant="info" />
  </CardContent>
</Card>`}
                    </CodeBlock>
                </section>

                {/* Loading Overlay */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        LOADING OVERLAY
                    </h2>
                    <p class='text-muted-foreground'>
                        Use an overlay with a spinner to indicate content is
                        being updated.
                    </p>
                    <Card>
                        <CardContent class='p-6'>
                            <div class='relative'>
                                <Alert>
                                    <svg
                                        class='shrink-0 size-4'
                                        xmlns='http://www.w3.org/2000/svg'
                                        width='24'
                                        height='24'
                                        viewBox='0 0 24 24'
                                        fill='none'
                                        stroke='currentColor'
                                        stroke-width='2'
                                        stroke-linecap='round'
                                        stroke-linejoin='round'
                                    >
                                        <path d='m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z' />
                                        <path d='M12 9v4' />
                                        <path d='M12 17h.01' />
                                    </svg>
                                    <AlertTitle>Attention needed</AlertTitle>
                                    <AlertDescription>
                                        <span class='font-semibold'>
                                            Holy guacamole!
                                        </span>{' '}
                                        You should check in on some of those
                                        fields below.
                                    </AlertDescription>
                                </Alert>

                                {/* Overlay */}
                                <div class='absolute top-0 start-0 size-full bg-background/50 rounded-lg' />

                                {/* Centered Spinner */}
                                <div class='absolute top-1/2 start-1/2 transform -translate-x-1/2 -translate-y-1/2'>
                                    <Spinner variant='info' />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<div class="relative">
  {/* Your content */}
  <Alert variant="info">
    <AlertTitle>Attention needed</AlertTitle>
    <AlertDescription>
      Content being loaded...
    </AlertDescription>
  </Alert>

  {/* Overlay */}
  <div class="absolute top-0 start-0 size-full bg-background/50 rounded-lg" />

  {/* Centered Spinner */}
  <div class="absolute top-1/2 start-1/2 transform -translate-x-1/2 -translate-y-1/2">
    <Spinner variant="info" />
  </div>
</div>`}
                    </CodeBlock>
                </section>

                {/* With Text */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        WITH TEXT
                    </h2>
                    <p class='text-muted-foreground'>
                        Combine spinner with loading text for more context.
                    </p>
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
                </section>

                {/* Button Loading State */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        BUTTON LOADING STATE
                    </h2>
                    <p class='text-muted-foreground'>
                        Use spinner inside buttons to indicate processing.
                    </p>
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
                </section>

                {/* Full Page Loading */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        FULL PAGE LOADING
                    </h2>
                    <p class='text-muted-foreground'>
                        Center a spinner for full page loading states.
                    </p>
                    <Card>
                        <CardContent class='p-0'>
                            <div class='min-h-80 flex items-center justify-center bg-background border border-border rounded-lg'>
                                <div class='flex flex-col items-center gap-4'>
                                    <Spinner size='xl' variant='primary' />
                                    <p class='text-muted-foreground'>
                                        Loading your dashboard...
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`{/* Full page centered spinner */}
<div class="min-h-screen flex items-center justify-center">
  <div class="flex flex-col items-center gap-4">
    <Spinner size="xl" variant="primary" />
    <p class="text-muted-foreground">Loading your dashboard...</p>
  </div>
</div>`}
                    </CodeBlock>
                </section>

                {/* Accessibility */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        ACCESSIBILITY
                    </h2>
                    <p class='text-muted-foreground'>
                        The spinner includes proper ARIA attributes for screen
                        readers. Customize the label for context-specific
                        messages.
                    </p>
                    <Card>
                        <CardContent class='p-6 flex items-center gap-6'>
                            <Spinner label='Loading items' />
                            <Spinner label='Submitting form' variant='info' />
                            <Spinner
                                label='Processing payment'
                                variant='success'
                            />
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`{/* Custom aria-label for screen readers */}
<Spinner label="Loading items" />
<Spinner label="Submitting form" />
<Spinner label="Processing payment" />`}
                    </CodeBlock>
                </section>

                {/* Props Reference */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        PROPS REFERENCE
                    </h2>
                    <Card>
                        <CardContent class='p-0'>
                            <div class='overflow-x-auto'>
                                <table class='w-full text-sm'>
                                    <thead>
                                        <tr class='border-b border-border'>
                                            <th class='text-left p-4 font-medium'>
                                                Prop
                                            </th>
                                            <th class='text-left p-4 font-medium'>
                                                Type
                                            </th>
                                            <th class='text-left p-4 font-medium'>
                                                Default
                                            </th>
                                            <th class='text-left p-4 font-medium'>
                                                Description
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody class='divide-y divide-border'>
                                        <tr>
                                            <td class='p-4 font-mono text-xs'>
                                                size
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                'sm' | 'md' | 'lg' | 'xl'
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                'md'
                                            </td>
                                            <td class='p-4 text-muted-foreground'>
                                                Size of the spinner
                                            </td>
                                        </tr>
                                        <tr>
                                            <td class='p-4 font-mono text-xs'>
                                                variant
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                'primary' | 'secondary' |
                                                'muted' | 'destructive' |
                                                'success' | 'warning' | 'info'
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                'primary'
                                            </td>
                                            <td class='p-4 text-muted-foreground'>
                                                Color variant
                                            </td>
                                        </tr>
                                        <tr>
                                            <td class='p-4 font-mono text-xs'>
                                                label
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                string
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                'Loading'
                                            </td>
                                            <td class='p-4 text-muted-foreground'>
                                                Screen reader label
                                            </td>
                                        </tr>
                                        <tr>
                                            <td class='p-4 font-mono text-xs'>
                                                class
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                string
                                            </td>
                                            <td class='p-4 font-mono text-xs'>
                                                -
                                            </td>
                                            <td class='p-4 text-muted-foreground'>
                                                Additional CSS classes
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                </section>
            </div>
        </PageUiLayout>
    )
}
