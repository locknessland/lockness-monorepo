import { test } from 'node:test'
import { assertStringIncludes } from '@std/assert'
import {
    Alert,
    AlertDescription,
    AlertTitle,
} from '../components/Alert/mod.tsx'

/**
 * Helper to render a component to string
 */
function renderToString(component: unknown): string {
    const result = component as unknown as { toString: () => string }
    return result.toString()
}

test('Alert component', async (t) => {
    await t.test('renders with default props', () => {
        const html = renderToString(
            <Alert>
                <AlertTitle>Alert Title</AlertTitle>
                <AlertDescription>Alert description text</AlertDescription>
            </Alert>,
        )
        assertStringIncludes(html, 'Alert Title')
        assertStringIncludes(html, 'Alert description text')
        assertStringIncludes(html, 'role="alert"')
    })

    await t.test('renders default variant', () => {
        const html = renderToString(
            <Alert variant='default'>
                <AlertTitle>Info</AlertTitle>
            </Alert>,
        )
        assertStringIncludes(html, 'bg-(--alert-default-bg)')
        assertStringIncludes(html, 'border-(--alert-default-border)')
    })

    await t.test('renders destructive variant', () => {
        const html = renderToString(
            <Alert variant='destructive'>
                <AlertTitle>Error</AlertTitle>
            </Alert>,
        )
        assertStringIncludes(html, 'text-(--alert-destructive-fg)')
        assertStringIncludes(html, 'border-(--alert-destructive-border)')
    })

    await t.test('renders success variant', () => {
        const html = renderToString(
            <Alert variant='success'>
                <AlertTitle>Success</AlertTitle>
            </Alert>,
        )
        assertStringIncludes(html, 'bg-(--alert-success-bg)')
        assertStringIncludes(html, 'border-(--alert-success-border)')
    })

    await t.test('renders warning variant', () => {
        const html = renderToString(
            <Alert variant='warning'>
                <AlertTitle>Warning</AlertTitle>
            </Alert>,
        )
        assertStringIncludes(html, 'bg-(--alert-warning-bg)')
        assertStringIncludes(html, 'border-(--alert-warning-border)')
    })

    await t.test('renders with icon when showIcon is true', () => {
        const html = renderToString(
            <Alert variant='success' showIcon>
                <AlertTitle>Success</AlertTitle>
            </Alert>,
        )
        assertStringIncludes(html, '<svg')
        assertStringIncludes(html, 'text-(--alert-icon-color)')
    })

    await t.test('forwards custom class names', () => {
        const html = renderToString(
            <Alert class='custom-class'>
                <AlertTitle>Test</AlertTitle>
            </Alert>,
        )
        assertStringIncludes(html, 'custom-class')
    })

    await t.test('forwards HTML attributes', () => {
        const html = renderToString(
            <Alert id='test-alert' data-testid='alert'>
                Test
            </Alert>,
        )
        assertStringIncludes(html, 'id="test-alert"')
        assertStringIncludes(html, 'data-testid="alert"')
    })
})

test('AlertTitle component', async (t) => {
    await t.test('renders with content', () => {
        const html = renderToString(<AlertTitle>Title</AlertTitle>)
        assertStringIncludes(html, 'Title')
        assertStringIncludes(html, '--alert-title-font-size')
    })
})

test('AlertDescription component', async (t) => {
    await t.test('renders with content', () => {
        const html = renderToString(
            <AlertDescription>Description</AlertDescription>,
        )
        assertStringIncludes(html, 'Description')
        assertStringIncludes(html, '--alert-description-font-size')
    })
})
