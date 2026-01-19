import {
    Alert,
    AlertDescription,
    AlertTitle,
    Badge,
    Card,
    CardContent,
    Kbd,
    Separator,
    Skeleton,
} from '@lockness/ui/components'
import { PageUiLayout } from '@view/layouts/ui_layout.tsx'
import { CodeBlock } from '@lockness/ui/components'

export const DisplayPage = () => {
    return (
        <PageUiLayout title='Display Components - Lockness UI'>
            <div class='space-y-8 max-w-full'>
                <header>
                    <h1 class='font-pixel text-2xl text-foreground mb-2'>
                        DISPLAY COMPONENTS
                    </h1>
                    <p class='text-lg text-muted-foreground'>
                        Badges, alerts, skeletons, and visual elements
                    </p>
                </header>

                {/* Badge */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>BADGE</h2>
                    <div class='flex flex-wrap gap-3 items-center p-6 bg-card rounded-lg'>
                        <Badge>Default</Badge>
                        <Badge variant='secondary'>Secondary</Badge>
                        <Badge variant='destructive'>Destructive</Badge>
                        <Badge variant='outline'>Outline</Badge>
                    </div>
                </section>

                {/* Alert */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>ALERT</h2>
                    <div class='space-y-4'>
                        <Alert>
                            <AlertTitle>Heads up!</AlertTitle>
                            <AlertDescription>
                                You can add components to your app using the
                                CLI.
                            </AlertDescription>
                        </Alert>
                        <Alert variant='destructive'>
                            <AlertTitle>Error</AlertTitle>
                            <AlertDescription>
                                Your session has expired. Please log in again.
                            </AlertDescription>
                        </Alert>
                    </div>
                </section>

                {/* Separator */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        SEPARATOR
                    </h2>
                    <Card>
                        <CardContent class='p-6 space-y-4'>
                            <div>Content Above</div>
                            <Separator />
                            <div>Content Below</div>
                            <div class='flex items-center h-5 space-x-4 text-sm'>
                                <div>Item 1</div>
                                <Separator orientation='vertical' />
                                <div>Item 2</div>
                                <Separator orientation='vertical' />
                                <div>Item 3</div>
                            </div>
                        </CardContent>
                    </Card>
                </section>

                {/* Skeleton */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>SKELETON</h2>
                    <Card>
                        <CardContent class='p-6 space-y-4'>
                            <div class='flex items-center space-x-4'>
                                <Skeleton class='h-12 w-12 rounded-full' />
                                <div class='space-y-2 flex-1'>
                                    <Skeleton class='h-4 w-full' />
                                    <Skeleton class='h-4 w-4/5' />
                                </div>
                            </div>
                            <Skeleton class='h-31.25 w-full rounded-xl' />
                        </CardContent>
                    </Card>
                </section>

                {/* Kbd */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        KEYBOARD SHORTCUT (KBD)
                    </h2>
                    <Card>
                        <CardContent class='p-6 space-y-3'>
                            <div class='flex items-center gap-2'>
                                <span class='text-muted-foreground'>Copy:</span>
                                <Kbd>Ctrl</Kbd>
                                <span>+</span>
                                <Kbd>C</Kbd>
                            </div>
                            <div class='flex items-center gap-2'>
                                <span class='text-muted-foreground'>
                                    Paste:
                                </span>
                                <Kbd>Ctrl</Kbd>
                                <span>+</span>
                                <Kbd>V</Kbd>
                            </div>
                            <div class='flex items-center gap-2'>
                                <span class='text-muted-foreground'>Save:</span>
                                <Kbd>Ctrl</Kbd>
                                <span>+</span>
                                <Kbd>S</Kbd>
                            </div>
                        </CardContent>
                    </Card>
                </section>

                {/* Usage */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>USAGE</h2>
                    <CodeBlock lang='tsx'>
                        {`import { Badge, Alert, Separator, Skeleton, Kbd } from '@lockness/ui/components'

<Badge>New</Badge>
<Alert>
  <AlertTitle>Title</AlertTitle>
  <AlertDescription>Description</AlertDescription>
</Alert>`}
                    </CodeBlock>
                </section>
            </div>
        </PageUiLayout>
    )
}
