/**
 * @fileoverview The styled Markdown entry point (`@lockness/ui/markdown`) still
 * renders `@lockness/ui` components — the design-system integration is
 * preserved after the #127 cycle break (plan US2 / SC-002).
 *
 * @module @lockness/ui/tests/markdown_components
 */

import { assertEquals, assertStringIncludes } from '@std/assert'
import {
    markdownComponents,
    renderMarkdown,
    renderMarkdownWithoutTitle,
} from '../markdown.tsx'

/**
 * Render Markdown to an HTML string through the styled (ui) map.
 *
 * @param md - Raw Markdown source
 * @returns The rendered HTML string
 */
async function render(md: string): Promise<string> {
    const tree = await renderMarkdown(md)
    return (tree as { toString(): string }).toString()
}

Deno.test('styled Markdown map (@lockness/ui/markdown)', async (t) => {
    await t.step(
        'heading renders with UI Title classes, not a bare <h1>',
        async () => {
            const html = await render('## Section')
            // The styled H2 carries the design-system border/spacing utilities.
            assertStringIncludes(html, 'border-b')
            assertStringIncludes(html, 'Section')
        },
    )

    await t.step('paragraph carries the UI typography class', async () => {
        const html = await render('body text')
        assertStringIncludes(html, 'leading-7')
        assertStringIncludes(html, 'body text')
    })

    await t.step('blockquote renders through the UI Alert', async () => {
        const html = await render('> note')
        // Alert variant='default' with the my-6 spacing from the styled map.
        assertStringIncludes(html, 'note')
        assertStringIncludes(html, 'my-6')
    })

    await t.step(
        'table renders through the UI Table (overflow wrapper)',
        async () => {
            const html = await render('| a | b |\n| --- | --- |\n| 1 | 2 |')
            assertStringIncludes(html, 'overflow-auto')
        },
    )

    await t.step(
        'fenced code renders through HighlightedCodeBlock (the sole raw-HTML sink)',
        async () => {
            const html = await render('```ts\nconst x = 1\n```')
            // The styled map forwards the highlighter `html` to
            // HighlightedCodeBlock; its highlighted markup must appear, proving
            // the sink is actually exercised (SC-002 parity for the most
            // security-relevant component, not just its presence in the map).
            assertStringIncludes(html, 'hljs')
        },
    )

    await t.step('link renders through the UI Link', async () => {
        const html = await render('[text](https://example.com)')
        assertStringIncludes(html, 'href="https://example.com"')
        // The styled Link carries the design-system underline utilities.
        assertStringIncludes(html, 'underline')
        assertStringIncludes(html, '>text</a>')
    })

    await t.step('the styled map exposes all overridable elements', () => {
        // Sanity: the relocated map covers the full ComponentOverrides surface,
        // including the five table primitives added for the cycle break.
        for (
            const key of [
                'Heading',
                'Paragraph',
                'CodeBlock',
                'InlineCode',
                'Link',
                'Blockquote',
                'Table',
                'TableHeader',
                'TableBody',
                'TableRow',
                'TableHead',
                'TableCell',
                'List',
                'ListItem',
                'HorizontalRule',
                'Image',
            ] as const
        ) {
            assertEquals(
                typeof markdownComponents[key],
                'function',
                `markdownComponents.${key} should be provided`,
            )
        }
    })

    await t.step('renderMarkdownWithoutTitle drops the first H1', async () => {
        const tree = await renderMarkdownWithoutTitle('# Gone\n\nkept')
        const html = (tree as { toString(): string }).toString()
        assertEquals(html.includes('>Gone<'), false)
        assertStringIncludes(html, 'kept')
    })
})
