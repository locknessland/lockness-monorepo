import { test } from 'node:test'
import { assertStringIncludes } from '@std/assert'
import { Table, TableEmpty, TableHead } from '../components/Table/mod.tsx'

/** Render a Hono JSX node to its HTML string. */
function renderToString(component: unknown): string {
    return (component as { toString: () => string }).toString()
}

test('Table', async (t) => {
    await t.test('reflects striped/bordered state as data attributes', () => {
        const html = renderToString(<Table striped bordered>rows</Table>)
        assertStringIncludes(html, '<table')
        assertStringIncludes(html, 'data-striped="true"')
        assertStringIncludes(html, 'data-bordered="true"')
    })

    await t.test('TableEmpty spans the given column count', () => {
        const html = renderToString(<TableEmpty colSpan={3} />)
        assertStringIncludes(html, 'colspan="3"')
        assertStringIncludes(html, 'No results.')
    })

    await t.test('a sortable TableHead renders an Unpoly sort link', () => {
        const html = renderToString(
            <TableHead sortable sortHref='/s?sort=name'>Name</TableHead>,
        )
        assertStringIncludes(html, 'up-follow')
        assertStringIncludes(html, 'href="/s?sort=name"')
        assertStringIncludes(html, 'Name')
    })
})
