/**
 * @fileoverview `@lockness/markdown` renders standalone with plain-HTML
 * defaults — no `@lockness/ui` dependency (issue #127, plan US1 / SC-001,
 * FR-003 / FR-003a / SC-005).
 *
 * @module @lockness/markdown/tests/plain_defaults
 */

import { assertEquals, assertStringIncludes } from '@std/assert'
import { renderMarkdown } from '../mod.tsx'

/**
 * Render Markdown to an HTML string through the default (plain-HTML) map.
 *
 * @param md - Raw Markdown source
 * @returns The rendered HTML string
 */
async function render(md: string): Promise<string> {
    const tree = await renderMarkdown(md)
    return (tree as { toString(): string }).toString()
}

Deno.test('plain-HTML default map', async (t) => {
    await t.step('heading renders as a bare <h1>, no UI classes', async () => {
        const html = await render('# Title')
        assertStringIncludes(html, '<h1>Title</h1>')
    })

    await t.step('paragraph renders as a bare <p>, no UI classes', async () => {
        const html = await render('hello world')
        // A bare `<p>hello world</p>` — the styled map would add a class attr.
        assertStringIncludes(html, '<p>hello world</p>')
    })

    await t.step('list renders as bare <ul>/<li>', async () => {
        const html = await render('- one\n- two')
        assertStringIncludes(html, '<ul>')
        assertStringIncludes(html, '<li>one</li>')
    })

    await t.step('table renders bare thead/tbody/th/td', async () => {
        const html = await render('| a | b |\n| --- | --- |\n| 1 | 2 |')
        assertStringIncludes(html, '<table>')
        assertStringIncludes(html, '<thead>')
        assertStringIncludes(html, '<tbody>')
        assertStringIncludes(html, '<th')
        assertStringIncludes(html, '<td')
    })

    await t.step(
        'code block renders escaped text and no raw highlighter HTML (FR-003a / SC-005)',
        async () => {
            const html = await render('```ts\nconst x = "y"\n```')
            assertStringIncludes(html, '<pre>')
            assertStringIncludes(html, '<code')
            // A single normalised language hook, never a doubled prefix.
            assertStringIncludes(html, 'language-ts')
            assertEquals(html.includes('language-language-'), false)
            // The code content is escaped (quotes → &quot;), never injected raw.
            assertStringIncludes(html, '&quot;')
            // The plain default must NOT emit highlighter span markup — that is
            // the styled map's job (`@lockness/ui`), which owns the sole
            // dangerouslySetInnerHTML sink.
            assertEquals(html.includes('class="hljs'), false)
        },
    )

    await t.step('inline code renders as a bare <code>', async () => {
        const html = await render('use `x` here')
        assertStringIncludes(html, '<code>x</code>')
    })

    await t.step(
        'link renders as a bare <a>, forwarding href and title',
        async () => {
            const html = await render('[text](https://example.com "t")')
            assertStringIncludes(html, '<a')
            assertStringIncludes(html, 'href="https://example.com"')
            assertStringIncludes(html, 'title="t"')
            assertStringIncludes(html, '>text</a>')
        },
    )

    await t.step('blockquote renders as a bare <blockquote>', async () => {
        const html = await render('> quoted')
        assertStringIncludes(html, '<blockquote>')
        assertStringIncludes(html, 'quoted')
    })

    await t.step('thematic break renders as a bare <hr>', async () => {
        const html = await render('before\n\n---\n\nafter')
        assertStringIncludes(html, '<hr')
    })

    await t.step(
        'image renders as a bare <img>, forwarding src/alt/title',
        async () => {
            const html = await render(
                '![alt text](https://example.com/i.png "cap")',
            )
            assertStringIncludes(html, '<img')
            assertStringIncludes(html, 'src="https://example.com/i.png"')
            assertStringIncludes(html, 'alt="alt text"')
            assertStringIncludes(html, 'title="cap"')
        },
    )
})
