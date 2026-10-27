import { assertStringIncludes } from '@std/assert'
import { Input } from '../components/Input/mod.tsx'

/**
 * Helper to render a component to string
 */
function renderToString(component: unknown): string {
    const result = component as unknown as { toString: () => string }
    return result.toString()
}

Deno.test('Input component', async (t) => {
    await t.step('renders with default props', () => {
        const html = renderToString(<Input />)
        assertStringIncludes(html, 'type="text"')
        assertStringIncludes(html, 'h-(--input-height)')
        assertStringIncludes(html, 'rounded-(--input-border-radius)')
    })

    await t.step('renders with email type', () => {
        const html = renderToString(<Input type='email' />)
        assertStringIncludes(html, 'type="email"')
    })

    await t.step('renders with password type', () => {
        const html = renderToString(<Input type='password' />)
        assertStringIncludes(html, 'type="password"')
    })

    await t.step('renders with placeholder', () => {
        const html = renderToString(
            <Input placeholder='Enter your email' />,
        )
        assertStringIncludes(html, 'placeholder="Enter your email"')
    })

    await t.step('handles disabled state', () => {
        const html = renderToString(<Input disabled />)
        assertStringIncludes(html, 'disabled')
    })

    await t.step('forwards custom class names', () => {
        const html = renderToString(<Input class='custom-class' />)
        assertStringIncludes(html, 'custom-class')
    })

    await t.step('uses CSS variables', () => {
        const html = renderToString(<Input />)
        assertStringIncludes(html, '(--input-border-color)')
        assertStringIncludes(html, '(--background)')
        assertStringIncludes(html, '(--ring)')
    })

    await t.step('forwards HTML attributes', () => {
        const html = renderToString(
            <Input id='email' name='email' required />,
        )
        assertStringIncludes(html, 'id="email"')
        assertStringIncludes(html, 'name="email"')
        assertStringIncludes(html, 'required')
    })
})
