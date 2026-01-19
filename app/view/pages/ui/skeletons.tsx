import {
    Card,
    CardContent,
    CodeBlock,
    Skeleton,
    SkeletonAvatar,
    SkeletonCard,
    SkeletonText,
} from '@lockness/ui/components'
import { PageUiLayout } from '@view/layouts/ui_layout.tsx'

export const SkeletonsPage = () => {
    return (
        <PageUiLayout title='Skeletons - Lockness UI'>
            <div class='space-y-12 max-w-full'>
                <header>
                    <h1 class='font-pixel text-2xl text-foreground mb-2'>
                        SKELETONS
                    </h1>
                    <p class='text-lg text-muted-foreground'>
                        Loading placeholder components with animated pulse
                        effect. Multiple variants for different content types.
                    </p>
                </header>

                {/* Default Skeleton */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        DEFAULT SKELETON
                    </h2>
                    <Card>
                        <CardContent class='p-6'>
                            <Skeleton class='h-12 w-48' />
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`import { Skeleton } from '@lockness/ui/components'

<Skeleton class="h-12 w-48" />`}
                    </CodeBlock>
                </section>

                {/* Text Skeleton */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        TEXT SKELETON
                    </h2>
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
                </section>

                {/* Heading Skeleton */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        HEADING SKELETON
                    </h2>
                    <Card>
                        <CardContent class='p-6'>
                            <Skeleton variant='heading' />
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<Skeleton variant="heading" />`}
                    </CodeBlock>
                </section>

                {/* Avatar Skeleton */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        AVATAR SKELETON
                    </h2>
                    <Card>
                        <CardContent class='p-6'>
                            <div class='flex items-center space-x-4'>
                                <SkeletonAvatar />
                                <div class='space-y-2 flex-1'>
                                    <Skeleton variant='text' />
                                    <Skeleton
                                        variant='text'
                                        class='w-4/5'
                                    />
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
                </section>

                {/* Button Skeleton */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        BUTTON SKELETON
                    </h2>
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
                </section>

                {/* Image Skeleton */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        IMAGE SKELETON
                    </h2>
                    <Card>
                        <CardContent class='p-6'>
                            <Skeleton variant='image' class='max-w-md' />
                        </CardContent>
                    </Card>
                    <CodeBlock lang='tsx'>
                        {`<Skeleton variant="image" />`}
                    </CodeBlock>
                </section>

                {/* Card Skeleton */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        CARD SKELETON
                    </h2>
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
                </section>

                {/* Without Animation */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        WITHOUT ANIMATION
                    </h2>
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
                </section>

                {/* CSS Variables */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        CSS VARIABLES
                    </h2>
                    <CodeBlock lang='css'>
                        {`@theme {
    /* Skeleton customization */
    --skeleton-border-radius: var(--radius);
    --skeleton-background: var(--muted);
    --skeleton-animation-duration: 2s;
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
                                        'default' | 'text' | 'heading' |
                                        'avatar' | 'button' | 'image' | 'card'
                                    </td>
                                    <td class='py-3 px-4'>'default'</td>
                                    <td class='py-3 px-4'>
                                        Predefined skeleton shape
                                    </td>
                                </tr>
                                <tr class='border-b border-border'>
                                    <td class='py-3 px-4 font-mono text-foreground'>
                                        lines
                                    </td>
                                    <td class='py-3 px-4 font-mono'>number</td>
                                    <td class='py-3 px-4'>1</td>
                                    <td class='py-3 px-4'>
                                        Number of lines (for text variant)
                                    </td>
                                </tr>
                                <tr class='border-b border-border'>
                                    <td class='py-3 px-4 font-mono text-foreground'>
                                        animate
                                    </td>
                                    <td class='py-3 px-4 font-mono'>boolean</td>
                                    <td class='py-3 px-4'>true</td>
                                    <td class='py-3 px-4'>
                                        Whether to animate the skeleton
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

                {/* Convenience Components */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        CONVENIENCE COMPONENTS
                    </h2>
                    <div class='overflow-x-auto'>
                        <table class='w-full text-sm'>
                            <thead>
                                <tr class='border-b border-border'>
                                    <th class='text-left py-3 px-4 font-medium'>
                                        Component
                                    </th>
                                    <th class='text-left py-3 px-4 font-medium'>
                                        Description
                                    </th>
                                </tr>
                            </thead>
                            <tbody class='text-muted-foreground'>
                                <tr class='border-b border-border'>
                                    <td class='py-3 px-4 font-mono text-foreground'>
                                        SkeletonText
                                    </td>
                                    <td class='py-3 px-4'>
                                        Shorthand for text variant
                                    </td>
                                </tr>
                                <tr class='border-b border-border'>
                                    <td class='py-3 px-4 font-mono text-foreground'>
                                        SkeletonAvatar
                                    </td>
                                    <td class='py-3 px-4'>
                                        Shorthand for avatar variant
                                    </td>
                                </tr>
                                <tr class='border-b border-border'>
                                    <td class='py-3 px-4 font-mono text-foreground'>
                                        SkeletonCard
                                    </td>
                                    <td class='py-3 px-4'>
                                        Shorthand for card variant
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
                        {`deno run -A jsr:@lockness/ui add skeleton`}
                    </CodeBlock>
                </section>
            </div>
        </PageUiLayout>
    )
}
