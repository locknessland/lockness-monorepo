import {
    Alert,
    AlertDescription,
    AlertTitle,
    Card,
    CardContent,
    CheckCircleIcon,
    CodeBlock,
    XCircleIcon,
    ZapIcon,
} from '@lockness/ui/components'
import { PageUiLayout } from '@view/layouts/ui_layout.tsx'

export const AlertsPage = () => {
    return (
        <PageUiLayout title='Alerts - Lockness UI' currentPath='/ui/alerts'>
            <div class='space-y-12 max-w-full'>
                <header>
                    <h1 class='font-pixel text-2xl text-foreground mb-2'>
                        ALERTS
                    </h1>
                    <p class='text-lg text-muted-foreground'>
                        Alert components for notifications, messages, and status
                        indicators with icon support.
                    </p>
                </header>

                {/* Default Alert */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        DEFAULT ALERT
                    </h2>
                    <Alert>
                        <AlertTitle>Heads up!</AlertTitle>
                        <AlertDescription>
                            You can add components to your app using the CLI.
                        </AlertDescription>
                    </Alert>
                    <CodeBlock lang='tsx'>
                        {`import { Alert, AlertTitle, AlertDescription } from '@lockness/ui/components'

<Alert>
    <AlertTitle>Heads up!</AlertTitle>
    <AlertDescription>
        You can add components to your app using the CLI.
    </AlertDescription>
</Alert>`}
                    </CodeBlock>
                </section>

                {/* Destructive Alert */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        DESTRUCTIVE ALERT
                    </h2>
                    <Alert variant='destructive'>
                        <AlertTitle>Error</AlertTitle>
                        <AlertDescription>
                            Your session has expired. Please log in again.
                        </AlertDescription>
                    </Alert>
                    <CodeBlock lang='tsx'>
                        {`<Alert variant="destructive">
    <AlertTitle>Error</AlertTitle>
    <AlertDescription>
        Your session has expired. Please log in again.
    </AlertDescription>
</Alert>`}
                    </CodeBlock>
                </section>

                {/* With Icons */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        WITH ICONS
                    </h2>
                    <div class='space-y-4'>
                        <Alert>
                            <ZapIcon class='h-4 w-4' />
                            <AlertTitle>Information</AlertTitle>
                            <AlertDescription>
                                This is an informational message.
                            </AlertDescription>
                        </Alert>
                        <Alert>
                            <CheckCircleIcon class='h-4 w-4' />
                            <AlertTitle>Success</AlertTitle>
                            <AlertDescription>
                                Your changes have been saved successfully.
                            </AlertDescription>
                        </Alert>
                        <Alert variant='destructive'>
                            <XCircleIcon class='h-4 w-4' />
                            <AlertTitle>Error</AlertTitle>
                            <AlertDescription>
                                Something went wrong. Please try again.
                            </AlertDescription>
                        </Alert>
                    </div>
                    <CodeBlock lang='tsx'>
                        {`import { ZapIcon, CheckCircleIcon, XCircleIcon } from '@lockness/ui/components'

<Alert>
    <ZapIcon class="h-4 w-4" />
    <AlertTitle>Information</AlertTitle>
    <AlertDescription>
        This is an informational message.
    </AlertDescription>
</Alert>`}
                    </CodeBlock>
                </section>

                {/* CSS Variables */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        CSS VARIABLES
                    </h2>
                    <p class='text-muted-foreground'>
                        Customize alerts globally using CSS variables.
                    </p>
                    <CodeBlock lang='css'>
                        {`@theme {
    /* Alert customization */
    --alert-padding: 1rem;
    --alert-border-radius: var(--radius);
    --alert-border-width: 1px;
    --alert-icon-size: 1rem;
    --alert-title-font-size: 0.875rem;
    --alert-title-font-weight: 500;
    --alert-description-font-size: 0.875rem;
}`}
                    </CodeBlock>
                </section>

                {/* Props Reference */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        PROPS REFERENCE
                    </h2>
                    <Card>
                        <CardContent class='p-0 overflow-x-auto'>
                            <table class='w-full text-sm'>
                                <thead>
                                    <tr class='border-b border-border'>
                                        <th class='text-left py-3 px-4 font-medium'>
                                            Component
                                        </th>
                                        <th class='text-left py-3 px-4 font-medium'>
                                            Prop
                                        </th>
                                        <th class='text-left py-3 px-4 font-medium'>
                                            Type
                                        </th>
                                        <th class='text-left py-3 px-4 font-medium'>
                                            Description
                                        </th>
                                    </tr>
                                </thead>
                                <tbody class='text-muted-foreground'>
                                    <tr class='border-b border-border'>
                                        <td class='py-3 px-4 font-mono text-foreground'>
                                            Alert
                                        </td>
                                        <td class='py-3 px-4 font-mono'>
                                            variant
                                        </td>
                                        <td class='py-3 px-4 font-mono'>
                                            'default' | 'destructive'
                                        </td>
                                        <td class='py-3 px-4'>
                                            Visual style variant
                                        </td>
                                    </tr>
                                    <tr class='border-b border-border'>
                                        <td class='py-3 px-4 font-mono text-foreground'>
                                            Alert
                                        </td>
                                        <td class='py-3 px-4 font-mono'>
                                            role
                                        </td>
                                        <td class='py-3 px-4 font-mono'>
                                            string
                                        </td>
                                        <td class='py-3 px-4'>
                                            ARIA role (default: 'alert')
                                        </td>
                                    </tr>
                                    <tr class='border-b border-border'>
                                        <td class='py-3 px-4 font-mono text-foreground'>
                                            AlertTitle
                                        </td>
                                        <td class='py-3 px-4 font-mono'>
                                            children
                                        </td>
                                        <td class='py-3 px-4 font-mono'>
                                            ReactNode
                                        </td>
                                        <td class='py-3 px-4'>
                                            Title text content
                                        </td>
                                    </tr>
                                    <tr class='border-b border-border'>
                                        <td class='py-3 px-4 font-mono text-foreground'>
                                            AlertDescription
                                        </td>
                                        <td class='py-3 px-4 font-mono'>
                                            children
                                        </td>
                                        <td class='py-3 px-4 font-mono'>
                                            ReactNode
                                        </td>
                                        <td class='py-3 px-4'>
                                            Description content
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </CardContent>
                    </Card>
                </section>

                {/* Installation */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        INSTALLATION
                    </h2>
                    <CodeBlock lang='bash'>
                        {`deno run -A jsr:@lockness/ui add alert`}
                    </CodeBlock>
                </section>
            </div>
        </PageUiLayout>
    )
}
