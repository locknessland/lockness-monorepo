/**
 * @fileoverview Live examples for Alert component
 */

import { CodeBlock } from '../CodeBlock/mod.tsx'
import { type PropDefinition, PropsTable } from '../PropsTable/mod.tsx'
import { Alert, AlertDescription, AlertTitle } from './mod.tsx'

const alertProps: PropDefinition[] = [
    {
        name: 'variant',
        type: 'default | success | warning | destructive',
        default: 'default',
        description: 'Visual style variant',
    },
    {
        name: 'showIcon',
        type: 'boolean',
        default: 'false',
        description: 'Show variant icon automatically',
    },
    {
        name: 'icon',
        type: 'unknown',
        description: 'Custom icon element (overrides default)',
    },
    { name: 'children', type: 'unknown', description: 'Alert content' },
    {
        name: 'class',
        type: 'string',
        description: 'Additional CSS class names',
    },
    { name: 'id', type: 'string', description: 'Element id attribute' },
    {
        name: 'role',
        type: 'string',
        default: 'alert',
        description: 'ARIA role',
    },
]

const alertTitleProps: PropDefinition[] = [
    { name: 'children', type: 'unknown', description: 'Title content' },
    {
        name: 'class',
        type: 'string',
        description: 'Additional CSS class names',
    },
]

const alertDescriptionProps: PropDefinition[] = [
    { name: 'children', type: 'unknown', description: 'Description content' },
    {
        name: 'class',
        type: 'string',
        description: 'Additional CSS class names',
    },
]

export interface ExampleSection {
    title: string
    render: () => unknown
}

export const examples: ExampleSection[] = [
    {
        title: 'Default Alert',
        render: () => (
            <div class='space-y-4'>
                <Alert showIcon>
                    <AlertTitle>Heads up!</AlertTitle>
                    <AlertDescription>
                        You can add components to your app using the CLI.
                    </AlertDescription>
                </Alert>
                <CodeBlock lang='tsx'>
                    {`import { Alert, AlertTitle, AlertDescription } from '@lockness/ui/components'

<Alert showIcon>
    <AlertTitle>Heads up!</AlertTitle>
    <AlertDescription>
        You can add components to your app using the CLI.
    </AlertDescription>
</Alert>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Destructive Alert',
        render: () => (
            <div class='space-y-4'>
                <Alert variant='destructive' showIcon>
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>
                        Your session has expired. Please log in again.
                    </AlertDescription>
                </Alert>
                <CodeBlock lang='tsx'>
                    {`<Alert variant="destructive" showIcon>
    <AlertTitle>Error</AlertTitle>
    <AlertDescription>
        Your session has expired. Please log in again.
    </AlertDescription>
</Alert>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'All Variants',
        render: () => (
            <div class='space-y-4'>
                <div class='space-y-4'>
                    <Alert showIcon>
                        <AlertTitle>Default</AlertTitle>
                        <AlertDescription>
                            A neutral informational message.
                        </AlertDescription>
                    </Alert>
                    <Alert variant='success' showIcon>
                        <AlertTitle>Success</AlertTitle>
                        <AlertDescription>
                            Your changes have been saved successfully.
                        </AlertDescription>
                    </Alert>
                    <Alert variant='warning' showIcon>
                        <AlertTitle>Warning</AlertTitle>
                        <AlertDescription>
                            Please review before proceeding.
                        </AlertDescription>
                    </Alert>
                    <Alert variant='destructive' showIcon>
                        <AlertTitle>Error</AlertTitle>
                        <AlertDescription>
                            Something went wrong. Please try again.
                        </AlertDescription>
                    </Alert>
                </div>
                <CodeBlock lang='tsx'>
                    {`<Alert showIcon>
    <AlertTitle>Default</AlertTitle>
    <AlertDescription>A neutral informational message.</AlertDescription>
</Alert>

<Alert variant="success" showIcon>
    <AlertTitle>Success</AlertTitle>
    <AlertDescription>Your changes have been saved.</AlertDescription>
</Alert>

<Alert variant="warning" showIcon>
    <AlertTitle>Warning</AlertTitle>
    <AlertDescription>Please review before proceeding.</AlertDescription>
</Alert>

<Alert variant="destructive" showIcon>
    <AlertTitle>Error</AlertTitle>
    <AlertDescription>Something went wrong.</AlertDescription>
</Alert>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Props',
        render: () => (
            <div class='space-y-6'>
                <PropsTable props={alertProps} title='Alert' />
                <PropsTable props={alertTitleProps} title='AlertTitle' />
                <PropsTable
                    props={alertDescriptionProps}
                    title='AlertDescription'
                />
            </div>
        ),
    },
]
