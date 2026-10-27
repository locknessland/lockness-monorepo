/**
 * @fileoverview Allowlist sanitisation of `CodeBlockNode.html`
 * (issue #159, plan `023-sanitize-codeblock-html`).
 *
 * `tryParseCodeBlock` captures the highlighter's inner HTML verbatim; the styled
 * `@lockness/ui/markdown` map pipes that field into `dangerouslySetInnerHTML`.
 * The parser is the single choke point: `sanitizeCodeHtml` (parser.ts) escapes
 * every `<`/`>` and re-admits ONLY the highlighter's own `<span class="hljs-…">`
 * / `</span>` structure, so no author markup can survive — independent of what
 * the upstream engine did or did not escape (defense-in-depth).
 *
 * These tests assert on BOTH the AST produced by `parseHtmlToAst` (the trust
 * boundary) and a rendered DOM through a component map that replicates the
 * styled map's raw-HTML sink — without importing `@lockness/ui`, preserving the
 * one-way `ui → markdown` dependency edge (#127).
 *
 * @module @lockness/markdown/tests/codeblock_html_allowlist
 */

import { assertEquals, assertStringIncludes } from '@std/assert'
import { Renderer } from '@libs/markdown'
import gfm from '@libs/markdown/plugins/gfm'
import highlighting from '@libs/markdown/plugins/highlighting'
import { parseHtmlToAst } from '../parser.ts'
import { MarkdownContent } from '../renderer.tsx'
import type { CodeBlockNode, MarkdownNode } from '../types.ts'

/** Walk an AST and return the first `CodeBlockNode.html`. */
function firstCodeBlockHtml(nodes: MarkdownNode[]): string | undefined {
    for (const n of nodes) {
        if (n.type === 'codeblock') return (n as CodeBlockNode).html
        const kids = n.children
        if (kids) {
            const found = firstCodeBlockHtml(kids)
            if (found !== undefined) return found
        }
    }
    return undefined
}

/**
 * Render an AST through a component map that forwards `CodeBlockNode.html` into a
 * raw-HTML sink — exactly what `@lockness/ui`'s `HighlightedCodeBlock` does at
 * `CodeBlock/mod.tsx:512`. Proves the field is safe by the time a sink sees it.
 */
function renderThroughSink(nodes: MarkdownNode[]): string {
    const tree = MarkdownContent({
        nodes,
        components: {
            CodeBlock: ({ html, children }) =>
                html
                    ? (
                        <pre>
                            <code dangerouslySetInnerHTML={{ __html: html }} />
                        </pre>
                    )
                    : (
                        <pre>
                            <code>{children}</code>
                        </pre>
                    ),
        },
    }) as { toString(): string }
    return tree.toString()
}

/** Wrap an inner code-body string in the `<pre><code>` shape the parser matches. */
function codeBlock(inner: string, lang = 'js'): string {
    return `<pre><code class="hljs language-${lang}">${inner}</code></pre>`
}

Deno.test('CodeBlock html allowlist — dangerous markup neutralised at AST (US1)', () => {
    const vectors: Array<[string, string]> = [
        ['raw script tag', '<script>alert(1)</script>'],
        ['img onerror', '<img src=x onerror=alert(1)>'],
        ['anchor javascript', '<a href="javascript:alert(1)">x</a>'],
        ['case-variant span', '<SPAN class="hljs-x">a</SPAN>'],
        [
            'over-attributed span',
            '<span class="hljs-x" onclick=alert(1)>a</span>',
        ],
        ['slash-separated attr', '<span/onload=alert(1)>a</span>'],
        ['unterminated span', '<span class="hljs-x'],
        ['lone lt', 'a < b'],
    ]
    for (const [label, inner] of vectors) {
        const html = firstCodeBlockHtml(parseHtmlToAst(codeBlock(inner)))
        // No live opening tag may survive: every `<` must be an entity.
        assertEquals(
            /<(?!\/?span\b)/i.test(html ?? ''),
            false,
            `a non-span '<' survived for: ${label} -> ${html}`,
        )
        // The neutralised markup is present as escaped text (nothing dropped).
        assertStringIncludes(
            html ?? '',
            '&lt;',
            `expected escaped '<' for: ${label}`,
        )
    }
})

Deno.test('CodeBlock html allowlist — no element reaches the sink DOM (US1, SC-001)', () => {
    for (
        const inner of [
            '<script>alert(1)</script>',
            '<img src=x onerror=alert(1)>',
            '<a href="javascript:alert(1)">x</a>',
        ]
    ) {
        const dom = renderThroughSink(parseHtmlToAst(codeBlock(inner)))
        // No element other than the sink's own <pre>/<code> wrapper (and hljs
        // <span>s, none here) may exist in the DOM: every author `<` is escaped.
        assertEquals(
            /<(?!\/?(?:div|span|pre|code)\b)/i.test(dom),
            false,
            `a live element reached the DOM for: ${inner} -> ${dom}`,
        )
        // The dangerous markup is present, but only as inert escaped text.
        assertStringIncludes(dom, '&lt;')
    }
})

Deno.test('CodeBlock html allowlist — highlighter structure preserved (US2, SC-002)', () => {
    // Pure hljs output with no literal angle brackets in text → byte-identical.
    const pure = '<span class="hljs-title function_">alert</span>(' +
        '<span class="hljs-number">1</span>)'
    assertEquals(
        firstCodeBlockHtml(parseHtmlToAst(codeBlock(pure))),
        pure,
        'hljs span structure must survive byte-for-byte',
    )

    // Nested spans (measured hljs `html`-lang shape) survive intact.
    const nested = '<span class="hljs-tag">&#x3C;<span class="hljs-name">' +
        'div</span></span>'
    const out = firstCodeBlockHtml(parseHtmlToAst(codeBlock(nested)))
    assertStringIncludes(out ?? '', '<span class="hljs-tag">')
    assertStringIncludes(out ?? '', '<span class="hljs-name">')
    assertStringIncludes(out ?? '', '</span>')

    // A literal `>` in a TEXT position is escaped (visually identical), while the
    // surrounding spans stay intact — this is the escape-both behaviour.
    const withGt = '<span class="hljs-x">a</span>>b'
    assertEquals(
        firstCodeBlockHtml(parseHtmlToAst(codeBlock(withGt))),
        '<span class="hljs-x">a</span>&gt;b',
    )
})

Deno.test('CodeBlock html allowlist — guarantee holds at the public parse entry (US3, SC-003)', () => {
    // A hand-crafted string fed straight to the public parseHtmlToAst, bypassing
    // @libs/markdown entirely: raw, unescaped disallowed markup must still be
    // neutralised (defense-in-depth, independent of the engine).
    const negatives = [
        '<script>alert(1)</script>',
        '<img src=x onerror=alert(1)>',
        '<a href="javascript:alert(1)">x</a>',
        '<SPAN>x</SPAN>',
        '<span class="hljs-x" onclick=alert(1)>x</span>',
        '<span/onload=alert(1)>x</span>',
        '<span class="hljs-x',
        '<',
    ]
    for (const inner of negatives) {
        const html = firstCodeBlockHtml(parseHtmlToAst(codeBlock(inner))) ?? ''
        assertEquals(
            /<(?!\/?span\b)/i.test(html),
            false,
            `a non-span '<' survived at the public entry for: ${inner} -> ${html}`,
        )
    }
})

Deno.test('CodeBlock html allowlist — existing entities are never double-escaped (FR-003)', () => {
    // The sanitiser touches only literal `<`/`>`; it must leave `&…;` alone, so
    // engine-escaped content round-trips unchanged. A regression that escaped
    // `&` would corrupt every highlighted block — this is the witness for it.
    const entities = '&amp; &#x3C; &lt; &gt; &#106;'
    assertEquals(
        firstCodeBlockHtml(parseHtmlToAst(codeBlock(entities))),
        entities,
    )
})

Deno.test('CodeBlock html allowlist — obfuscation near-misses neutralised (US1, exact output)', () => {
    // Whitespace/quote variants that a loose matcher might re-admit. Each opening
    // `<` is escaped; a WELL-FORMED trailing `</span>` is still allowlisted.
    // Assertions are exact strings (not just a lookahead) to pin the behaviour.
    assertEquals(
        firstCodeBlockHtml(parseHtmlToAst(codeBlock('a</span >b'))),
        'a&lt;/span &gt;b', // space before `>` → not the allowlisted close tag
    )
    assertEquals(
        firstCodeBlockHtml(
            parseHtmlToAst(codeBlock('<span  class="hljs-x">a</span>')),
        ),
        '&lt;span  class="hljs-x"&gt;a</span>', // double space → open escaped
    )
    assertEquals(
        firstCodeBlockHtml(
            parseHtmlToAst(codeBlock('<span\tclass="hljs-x">a</span>')),
        ),
        '&lt;span\tclass="hljs-x"&gt;a</span>', // tab separator → open escaped
    )
    assertEquals(
        firstCodeBlockHtml(
            parseHtmlToAst(
                codeBlock('<span class="hljs-x&quot;onload=y">a</span>'),
            ),
        ),
        '&lt;span class="hljs-x&quot;onload=y"&gt;a</span>', // quote smuggle → open escaped
    )
})

Deno.test('CodeBlock html allowlist — empty and whitespace-only blocks pass through (edge cases)', () => {
    assertEquals(firstCodeBlockHtml(parseHtmlToAst(codeBlock(''))), '')
    assertEquals(firstCodeBlockHtml(parseHtmlToAst(codeBlock('   '))), '   ')
})

Deno.test('CodeBlock html allowlist — real multiline highlighter output preserved (US2, SC-002)', async () => {
    // The most faithful fidelity check: run the ACTUAL @libs/markdown engine over
    // a multiline block, then assert the highlighter spans survive the parser's
    // sanitiser intact and no non-span `<` reaches the field.
    const md = await Renderer.with({ plugins: [gfm, highlighting] })
    const html = await md.render(
        '```js\nconst a = 1\nfunction f(x) { return x > 0 }\n```',
    )
    const out = firstCodeBlockHtml(parseHtmlToAst(html)) ?? ''
    assertStringIncludes(out, '<span class="hljs-keyword">')
    assertEquals(
        /<(?!\/?span\b)/i.test(out),
        false,
        `a non-span '<' survived real highlighter output -> ${out}`,
    )
    // Multiline is preserved and the `>` in `x > 0` is an escaped entity, not a tag.
    assertStringIncludes(out, '\n')
    assertStringIncludes(out, '&gt;')
})
