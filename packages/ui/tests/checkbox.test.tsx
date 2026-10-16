import { test } from 'node:test'
import { assertStringIncludes } from '@std/assert'
import { Checkbox } from '../components/Checkbox/mod.tsx'

/**
 * Helper to render a component to string
 */
function renderToString(component: unknown): string {
    const result = component as unknown as { toString: () => string }
    return result.toString()
}

test('Checkbox component', async (t) => {
    await t.test('renders with default props', () => {
        const html = renderToString(<Checkbox />)
        assertStringIncludes(html, 'type="checkbox"')
        assertStringIncludes(html, 'h-(--checkbox-size)')
        assertStringIncludes(html, 'w-(--checkbox-size)')
    })

    await t.test('renders with checked state', () => {
        const html = renderToString(<Checkbox checked />)
        assertStringIncludes(html, 'checked')
    })

    await t.test('handles disabled state', () => {
        const html = renderToString(<Checkbox disabled />)
        assertStringIncludes(html, 'disabled')
    })

    await t.test('forwards custom class names', () => {
        const html = renderToString(<Checkbox class='custom-class' />)
        assertStringIncludes(html, 'custom-class')
    })

    await t.test('uses CSS variables', () => {
        const html = renderToString(<Checkbox />)
        assertStringIncludes(html, '(--checkbox-accent-color)')
        assertStringIncludes(html, '(--ring)')
    })

    await t.test('forwards HTML attributes', () => {
        const html = renderToString(
            <Checkbox id='terms' name='terms' value='accepted' />,
        )
        assertStringIncludes(html, 'id="terms"')
        assertStringIncludes(html, 'name="terms"')
        assertStringIncludes(html, 'value="accepted"')
    })
})
