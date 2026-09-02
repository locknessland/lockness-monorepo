/**
 * @fileoverview URI-scheme allowlist for link `href` and image `src`
 * (issue #148, plan `022-markdown-uri-allowlist`).
 *
 * The parser is the single choke point: `sanitizeUrl` (parser.ts) neutralises any
 * scheme outside `http`/`https`/`mailto`/schemeless to an empty string, and every
 * link/image node is built through `buildLinkNode`/`buildImageNode` so no parse
 * path can skip it. These tests assert on BOTH the AST produced by
 * `parseHtmlToAst` (the trust boundary) and the final rendered DOM.
 *
 * @module @lockness/markdown/tests/uri_allowlist
 */

import { assertEquals, assertStringIncludes } from '@std/assert'
import { renderMarkdown } from '../mod.tsx'
import { parseHtmlToAst } from '../parser.ts'
import { MarkdownContent } from '../renderer.tsx'
import type { ImageNode, LinkNode, MarkdownNode } from '../types.ts'

/** Render Markdown source to an HTML string through the default (plain) map. */
async function render(md: string): Promise<string> {
    const tree = await renderMarkdown(md)
    return (tree as { toString(): string }).toString()
}

/** Render an already-parsed AST to an HTML string. */
function renderAst(nodes: MarkdownNode[]): string {
    const tree = MarkdownContent({ nodes }) as { toString(): string }
    return tree.toString()
}

/** Find the first link node anywhere in an AST and return its `href`. */
function firstHref(nodes: MarkdownNode[]): string | undefined {
    for (const n of nodes) {
        if (n.type === 'link') return (n as LinkNode).href
        const kids = n.children
        if (kids) {
            const found = firstHref(kids)
            if (found !== undefined) return found
        }
    }
    return undefined
}

/** Find the first image node anywhere in an AST and return its `src`. */
function firstSrc(nodes: MarkdownNode[]): string | undefined {
    for (const n of nodes) {
        if (n.type === 'image') return (n as ImageNode).src
        const kids = n.children
        if (kids) {
            const found = firstSrc(kids)
            if (found !== undefined) return found
        }
    }
    return undefined
}

Deno.test('URI-scheme allowlist — dangerous link (US1)', async (t) => {
    await t.step(
        'a javascript: link renders with an empty href, text preserved (end-to-end)',
        async () => {
            const html = await render('[click me](javascript:alert(1))')
            assertStringIncludes(html, '>click me</a>')
            // The dangerous scheme must not survive anywhere in the output.
            assertEquals(html.includes('javascript:'), false)
            assertStringIncludes(html, 'href=""')
        },
    )

    await t.step(
        'obfuscation variants are all neutralised at the parser (AST)',
        () => {
            // Crafted HTML exercises sanitizeUrl directly, independent of the
            // engine's own decoding — the defence-in-depth cases (plan SC-004).
            const vectors = [
                '<p><a href="javascript:alert(1)">x</a></p>', // plain, inline path
                '<a href="javascript:alert(1)">x</a>', // plain, block path
                '<p><a href="JavaScript:alert(1)">x</a></p>', // mixed case
                '<p><a href="java\tscript:alert(1)">x</a></p>', // embedded tab
                '<p><a href="javascript:alert(1)">x</a></p>', // C0 control
                '<p><a href="javascript&#58;alert(1)">x</a></p>', // entity colon (dec)
                '<p><a href="javascript&#x3a;alert(1)">x</a></p>', // entity colon (hex)
                '<p><a href="javascript&colon;alert(1)">x</a></p>', // entity colon (named)
                '<p><a href="java\nscript:alert(1)">x</a></p>', // embedded newline
                '<p><a href="java&#9;script:alert(1)">x</a></p>', // entity tab
                '<p><a href="&#106;avascript:alert(1)">x</a></p>', // entity letter
            ]
            for (const html of vectors) {
                assertEquals(
                    firstHref(parseHtmlToAst(html)),
                    '',
                    `expected neutralised href for: ${html}`,
                )
            }
        },
    )

    await t.step(
        'a neutralised link stays inert through to the rendered DOM (SC-004)',
        () => {
            // The AST is the trust boundary, but assert the full render too: an
            // empty href must reach the DOM as href="" with no scheme resurrected.
            for (
                const html of [
                    '<p><a href="javascript:alert(1)">x</a></p>',
                    '<p><a href="JavaScript:alert(1)">x</a></p>',
                    '<p><a href="javascript&#58;alert(1)">x</a></p>',
                ]
            ) {
                const dom = renderAst(parseHtmlToAst(html))
                assertStringIncludes(dom, 'href=""')
                assertEquals(dom.includes('javascript:'), false)
            }
        },
    )
})

Deno.test('URI-scheme allowlist — safe URLs untouched (US2)', async (t) => {
    await t.step('allowed schemes and relative URIs pass through (AST)', () => {
        const safe = [
            'https://example.com',
            'http://example.com',
            'mailto:a@b.com',
            '/path',
            './rel',
            '#frag',
            '?q=1',
            '//example.com',
        ]
        for (const url of safe) {
            const html = `<p><a href="${url}">x</a></p>`
            assertEquals(
                firstHref(parseHtmlToAst(html)),
                url,
                `expected untouched href for: ${url}`,
            )
        }
    })

    await t.step('a safe link renders unchanged end-to-end', async () => {
        const html = await render('[text](https://example.com "t")')
        assertStringIncludes(html, 'href="https://example.com"')
        assertStringIncludes(html, 'title="t"')
        assertStringIncludes(html, '>text</a>')
    })
})

Deno.test('URI-scheme allowlist — dangerous image (US3)', async (t) => {
    await t.step(
        'a data: image renders with an empty src, alt preserved (end-to-end)',
        async () => {
            const html = await render(
                '![logo](data:text/html,<script>x</script>)',
            )
            assertStringIncludes(html, 'alt="logo"')
            assertEquals(html.includes('data:text/html'), false)
            assertStringIncludes(html, 'src=""')
        },
    )

    await t.step(
        'dangerous image schemes are neutralised at the parser (AST)',
        () => {
            const vectors = [
                '<p><img src="data:text/html,x" alt="a"></p>',
                '<img src="vbscript:msgbox(1)" alt="b">',
                '<p><img src="file:///etc/passwd" alt="c"></p>',
            ]
            for (const html of vectors) {
                assertEquals(
                    firstSrc(parseHtmlToAst(html)),
                    '',
                    `expected neutralised src for: ${html}`,
                )
            }
        },
    )

    await t.step('a safe image is untouched (AST)', () => {
        const html = '<p><img src="https://example.com/i.png" alt="ok"></p>'
        assertEquals(
            firstSrc(parseHtmlToAst(html)),
            'https://example.com/i.png',
        )
    })

    await t.step('a neutralised image stays inert in the rendered DOM', () => {
        const dom = renderAst(
            parseHtmlToAst('<p><img src="data:text/html,x" alt="a"></p>'),
        )
        assertStringIncludes(dom, 'src=""')
        assertEquals(dom.includes('data:text/html'), false)
    })
})

Deno.test('URI-scheme allowlist — no scheme logic leaks into the renderer', () => {
    // The renderer must forward whatever the AST holds (FR-006). A hand-built
    // AST with an already-empty href renders href="" and does not resurrect it.
    const nodes: MarkdownNode[] = [{
        type: 'link',
        href: '',
        children: [{ type: 'text', value: 'x' }],
    } as LinkNode]
    assertStringIncludes(renderAst(nodes), 'href=""')
})
