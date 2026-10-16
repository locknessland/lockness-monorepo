import { test } from 'node:test'
import { assertStringIncludes } from '@std/assert'
import { Label } from '../components/Label/mod.tsx'

/**
 * Helper to render a component to string
 */
function renderToString(component: unknown): string {
    const result = component as unknown as { toString: () => string }
    return result.toString()
}

test('Label component', async (t) => {
    await t.test('renders with default props', () => {
        const html = renderToString(<Label>Email</Label>)
        assertStringIncludes(html, 'Email')
        assertStringIncludes(html, 'text-[length:--label-font-size]')
        assertStringIncludes(html, 'font-(--label-font-weight)')
    })

    await t.test('renders with for attribute', () => {
        const html = renderToString(<Label for='email'>Email</Label>)
        assertStringIncludes(html, 'for="email"')
        assertStringIncludes(html, 'Email')
    })

    await t.test('forwards custom class names', () => {
        const html = renderToString(
            <Label class='custom-class'>Custom</Label>,
        )
        assertStringIncludes(html, 'custom-class')
    })

    await t.test('uses CSS variables', () => {
        const html = renderToString(<Label>Test</Label>)
        assertStringIncludes(html, '(--foreground)')
    })

    await t.test('forwards HTML attributes', () => {
        const html = renderToString(
            <Label id='test-label' data-testid='label'>
                Test
            </Label>,
        )
        assertStringIncludes(html, 'id="test-label"')
        assertStringIncludes(html, 'data-testid="label"')
    })
})
