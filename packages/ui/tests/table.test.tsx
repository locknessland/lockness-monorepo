import { assertStringIncludes } from '@std/assert'
import { Table, TableEmpty, TableHead } from '../components/Table/mod.tsx'

/** Render a Hono JSX node to its HTML string. */
function renderToString(component: unknown): string {
    return (component as { toString: () => string }).toString()
}

Deno.test('Table', async (t) => {
    await t.step('reflects striped/bordered state as data attributes', () => {
        const html = renderToString(<Table striped bordered>rows</Table>)
        assertStringIncludes(html, '<table')
        assertStringIncludes(html, 'data-striped="true"')
        assertStringIncludes(html, 'data-bordered="true"')
    })

    await t.step('TableEmpty spans the given column count', () => {
        const html = renderToString(<TableEmpty colSpan={3} />)
        assertStringIncludes(html, 'colspan="3"')
        assertStringIncludes(html, 'No results.')
    })

    await t.step('a sortable TableHead renders an Unpoly sort link', () => {
        const html = renderToString(
            <TableHead sortable sortHref='/s?sort=name'>Name</TableHead>,
        )
        assertStringIncludes(html, 'up-follow')
        assertStringIncludes(html, 'href="/s?sort=name"')
        assertStringIncludes(html, 'Name')
    })
})
