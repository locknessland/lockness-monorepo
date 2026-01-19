import { assertStringIncludes } from '@std/assert'
import { Checkbox } from '../components/Checkbox.tsx'

/**
 * Helper to render a component to string
 */
function renderToString(component: unknown): string {
    const result = component as unknown as { toString: () => string }
    return result.toString()
}

Deno.test('Checkbox component', async (t) => {
    await t.step('renders with default props', () => {
        const html = renderToString(<Checkbox />)
        assertStringIncludes(html, 'type="checkbox"')
        assertStringIncludes(html, 'h-4 w-4')
    })

    await t.step('renders with checked state', () => {
        const html = renderToString(<Checkbox checked />)
        assertStringIncludes(html, 'checked')
    })

    await t.step('handles disabled state', () => {
        const html = renderToString(<Checkbox disabled />)
        assertStringIncludes(html, 'disabled')
    })

    await t.step('forwards custom class names', () => {
        const html = renderToString(<Checkbox class='custom-class' />)
        assertStringIncludes(html, 'custom-class')
    })

    await t.step('uses CSS variables', () => {
        const html = renderToString(<Checkbox />)
        assertStringIncludes(html, '(--primary)')
        assertStringIncludes(html, '(--ring)')
    })

    await t.step('forwards HTML attributes', () => {
        const html = renderToString(
            <Checkbox id='terms' name='terms' value='accepted' />,
        )
        assertStringIncludes(html, 'id="terms"')
        assertStringIncludes(html, 'name="terms"')
        assertStringIncludes(html, 'value="accepted"')
    })
})
