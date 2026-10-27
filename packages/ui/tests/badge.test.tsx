import { assertStringIncludes } from '@std/assert'
import { Badge } from '../components/Badge/mod.tsx'

/**
 * Helper to render a component to string
 */
function renderToString(component: unknown): string {
    const result = component as unknown as { toString: () => string }
    return result.toString()
}

Deno.test('Badge component', async (t) => {
    await t.step('renders with default props', () => {
        const html = renderToString(<Badge>New</Badge>)
        assertStringIncludes(html, 'New')
        assertStringIncludes(html, 'bg-(--primary)')
    })

    await t.step('renders default variant', () => {
        const html = renderToString(<Badge variant='default'>Default</Badge>)
        assertStringIncludes(html, 'bg-(--primary)')
        assertStringIncludes(html, 'text-(--primary-foreground)')
    })

    await t.step('renders secondary variant', () => {
        const html = renderToString(
            <Badge variant='secondary'>Secondary</Badge>,
        )
        assertStringIncludes(html, 'bg-(--secondary)')
        assertStringIncludes(html, 'text-(--secondary-foreground)')
    })

    await t.step('renders destructive variant', () => {
        const html = renderToString(
            <Badge variant='destructive'>Error</Badge>,
        )
        assertStringIncludes(html, 'bg-(--destructive)')
        assertStringIncludes(html, 'text-(--destructive-foreground)')
    })

    await t.step('renders outline variant', () => {
        const html = renderToString(<Badge variant='outline'>Outline</Badge>)
        assertStringIncludes(html, 'border-(--border)')
        assertStringIncludes(html, 'text-(--foreground)')
    })

    await t.step('forwards custom class names', () => {
        const html = renderToString(<Badge class='custom-class'>Badge</Badge>)
        assertStringIncludes(html, 'custom-class')
    })

    await t.step('forwards HTML attributes', () => {
        const html = renderToString(
            <Badge id='test-badge' data-testid='badge'>
                Test
            </Badge>,
        )
        assertStringIncludes(html, 'id="test-badge"')
        assertStringIncludes(html, 'data-testid="badge"')
    })
})
