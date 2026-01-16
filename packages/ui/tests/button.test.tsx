import { assertStringIncludes } from '@std/assert'
import { Button } from '../components/Button.tsx'

/**
 * Helper to render a component to string
 * Since Hono JSX uses precompile mode, we need to convert the result to string
 */
function renderToString(component: unknown): string {
    // Hono JSX returns a Promise or HtmlEscapedString
    const result = component as unknown as { toString: () => string }
    return result.toString()
}

Deno.test('Button component', async (t) => {
    await t.step('renders with default props', () => {
        const html = renderToString(<Button>Click me</Button>)
        assertStringIncludes(html, 'Click me')
        assertStringIncludes(html, 'bg-blue-600') // primary variant
        assertStringIncludes(html, 'px-4 py-2') // md size
    })

    await t.step('renders primary variant', () => {
        const html = renderToString(
            <Button variant='primary'>Primary</Button>,
        )
        assertStringIncludes(html, 'bg-blue-600')
        assertStringIncludes(html, 'Primary')
    })

    await t.step('renders secondary variant', () => {
        const html = renderToString(
            <Button variant='secondary'>Secondary</Button>,
        )
        assertStringIncludes(html, 'bg-gray-600')
        assertStringIncludes(html, 'Secondary')
    })

    await t.step('renders outline variant', () => {
        const html = renderToString(
            <Button variant='outline'>Outline</Button>,
        )
        assertStringIncludes(html, 'border-2')
        assertStringIncludes(html, 'Outline')
    })

    await t.step('renders ghost variant', () => {
        const html = renderToString(<Button variant='ghost'>Ghost</Button>)
        assertStringIncludes(html, 'Ghost')
    })

    await t.step('renders danger variant', () => {
        const html = renderToString(<Button variant='danger'>Delete</Button>)
        assertStringIncludes(html, 'bg-red-600')
        assertStringIncludes(html, 'Delete')
    })

    await t.step('renders small size', () => {
        const html = renderToString(<Button size='sm'>Small</Button>)
        assertStringIncludes(html, 'px-3')
        assertStringIncludes(html, 'py-1.5')
    })

    await t.step('renders medium size', () => {
        const html = renderToString(<Button size='md'>Medium</Button>)
        assertStringIncludes(html, 'px-4 py-2')
    })

    await t.step('renders large size', () => {
        const html = renderToString(<Button size='lg'>Large</Button>)
        assertStringIncludes(html, 'px-6')
        assertStringIncludes(html, 'py-3')
    })

    await t.step('handles disabled state', () => {
        const html = renderToString(<Button disabled>Disabled</Button>)
        assertStringIncludes(html, 'disabled')
    })

    await t.step('forwards custom class names', () => {
        const html = renderToString(
            <Button class='custom-class'>Custom</Button>,
        )
        assertStringIncludes(html, 'custom-class')
    })

    await t.step('forwards HTML attributes', () => {
        const html = renderToString(
            <Button type='submit' id='submit-btn'>
                Submit
            </Button>,
        )
        assertStringIncludes(html, 'type="submit"')
        assertStringIncludes(html, 'id="submit-btn"')
    })

    await t.step('supports Unpoly directives', () => {
        const html = renderToString(
            <Button up-target='.main' up-href='/users'>
                Load Users
            </Button>,
        )
        assertStringIncludes(html, 'up-target')
        assertStringIncludes(html, 'up-href')
    })
})
