import { assert, assertStringIncludes } from '@std/assert'
import { Pagination } from '../components/Pagination/mod.tsx'

/** Render a Hono JSX node to its HTML string. */
function renderToString(component: unknown): string {
    return (component as { toString: () => string }).toString()
}

Deno.test('Pagination', async (t) => {
    await t.step(
        'renders a navigation with page links and marks the active page',
        () => {
            const html = renderToString(
                <Pagination currentPage={2} totalPages={5} baseUrl='/p' />,
            )
            assertStringIncludes(html, 'role="navigation"')
            assertStringIncludes(html, 'aria-label="Pagination"')
            assertStringIncludes(html, '/p?page=1') // a link to another page
            assertStringIncludes(html, '/p?page=3')
            assertStringIncludes(html, 'aria-current="page"') // the active page
        },
    )

    await t.step('disables Previous on the first page', () => {
        const html = renderToString(
            <Pagination currentPage={1} totalPages={5} baseUrl='/p' />,
        )
        assertStringIncludes(html, 'aria-disabled="true"')
    })

    await t.step('renders nothing when there is a single page', () => {
        const html = renderToString(
            <Pagination currentPage={1} totalPages={1} baseUrl='/p' />,
        )
        assert(
            !html.includes('aria-label="Pagination"'),
            'a single-page pagination emits no navigation',
        )
    })
})
