/**
 * @fileoverview HTML to AST parser for Markdown rendering.
 *
 * Parses HTML output from @libs/markdown into an AST that can be
 * rendered using Lockness UI components.
 *
 * @module @lockness/markdown/parser
 */

import type {
    CodeBlockNode,
    HeadingNode,
    ImageNode,
    InlineCodeNode,
    LinkNode,
    ListNode,
    MarkdownNode,
    TableCellNode,
} from './types.ts'

/**
 * The only URI schemes an author-supplied link `href` or image `src` may carry.
 * A schemeless value (relative path, fragment, query, protocol-relative) is also
 * allowed. Everything else — notably `javascript:`, `data:`, `vbscript:`,
 * `file:` — is neutralised. This is the single home of the allowlist decision
 * (issue #148, plan §5 row 1); it lives nowhere else, and the renderer never
 * re-decides it.
 */
const ALLOWED_SCHEMES = new Set(['http', 'https', 'mailto'])

/**
 * The one anchor-tag shape the parser recognises, capturing `href`, optional
 * `title`, and inner content. Shared by the inline and block extraction paths so
 * the pattern has a single spelling (both paths build their node through
 * {@link buildLinkNode}). No `g` flag — safe to reuse across `.match` calls.
 */
const LINK_RE =
    /^<a\s+href="([^"]*)"(?:\s+title="([^"]*)")?[^>]*>([\s\S]*?)<\/a>/i

/**
 * The one image-tag shape the parser recognises, capturing `src`, optional `alt`
 * and `title`. Shared by the inline and block extraction paths — see
 * {@link LINK_RE} and {@link buildImageNode}.
 */
const IMAGE_RE =
    /^<img\s+src="([^"]*)"(?:\s+alt="([^"]*)")?(?:\s+title="([^"]*)")?[^>]*\/?>/i

/**
 * Control characters and Unicode whitespace a browser strips from a URL before
 * it parses the scheme — so `java\tscript:` and `\x01javascript:` become
 * `javascript:` at dispatch time. The set is **explicit** on purpose: JS `\s`
 * does not match the C0 range `\u0001-\u0008` / `\u000e-\u001f`, so a `\s`-based
 * strip would let those obfuscations through (plan FR-004, security S3).
 */
// deno-lint-ignore no-control-regex -- C0 control chars are exactly what a URL sanitiser must strip
const URL_STRIP = /[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g

/**
 * Decode the HTML character references that could hide a scheme or its colon —
 * numeric (`&#106;`), hex (`&#x6a;`) and the named colon/tab/newline. This is a
 * decoder **dedicated to URL sanitisation**, deliberately separate from
 * {@link decodeHtmlEntities} (which decodes a different, narrower set for text
 * nodes and must not over-decode). It exists as defence-in-depth: `@libs/markdown`
 * already resolves these before the parser sees them, but a sanitiser must not
 * depend on the engine's current behaviour.
 *
 * @param value - The raw attribute value captured from the HTML.
 * @returns The value with URL-relevant character references resolved.
 */
function decodeUrlEntities(value: string): string {
    const fromRef = (cp: number): string => {
        if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return ''
        try {
            return String.fromCodePoint(cp)
        } catch {
            // Not a silent swallow: an out-of-range or lone-surrogate code point
            // is not a valid character reference, so it decodes to nothing. The
            // guard above rejects most; this catches the residual surrogate range
            // `String.fromCodePoint` still throws on. Dropping it is the correct,
            // fail-safe result for a URL sanitiser — never a scheme character.
            return ''
        }
    }
    return value
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => fromRef(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec) => fromRef(parseInt(dec, 10)))
        .replace(/&colon;/gi, ':')
        .replace(/&Tab;/g, '\t')
        .replace(/&NewLine;/g, '\n')
}

/**
 * Neutralise an author-supplied URL whose scheme is not allowlisted.
 *
 * The value is normalised for the test only — HTML references decoded, then
 * control/whitespace stripped, then the scheme compared case-insensitively — but
 * an **allowed** URL is returned **byte-for-byte unchanged** so safe links and
 * images are untouched. A disallowed scheme yields an empty string, which renders
 * as an inert `href=""` / `src=""` while preserving the link text and image
 * `alt`. A schemeless value (relative, fragment, query, `//host`) is always
 * allowed. See plan §5 (decision table) and FR-001/003/004.
 *
 * @param raw - The URL exactly as captured from the parsed HTML attribute.
 * @returns The original URL when schemeless or allowlisted; `''` otherwise.
 * @example
 * ```ts
 * sanitizeUrl('https://example.com') // 'https://example.com'
 * sanitizeUrl('/path')               // '/path'
 * sanitizeUrl('javascript:alert(1)') // ''
 * sanitizeUrl('JavaScript:alert(1)') // '' (case-insensitive)
 * ```
 */
function sanitizeUrl(raw: string): string {
    const normalized = decodeUrlEntities(raw).replace(URL_STRIP, '')
    const scheme = normalized.match(/^([a-z][a-z0-9+.-]*):/i)
    if (!scheme) return raw // schemeless: relative / fragment / query / //host
    return ALLOWED_SCHEMES.has(scheme[1].toLowerCase()) ? raw : ''
}

/**
 * Build a {@link LinkNode}, routing the raw `href` through {@link sanitizeUrl}.
 * This and {@link buildImageNode} are the **only** constructors of link/image
 * nodes, so no parse path can emit an unsanitised URL (plan FR-005).
 *
 * @param rawHref - The `href` exactly as captured from the HTML.
 * @param title - The optional link title.
 * @param children - The already-parsed inline children.
 * @returns A link node whose `href` is scheme-safe.
 */
function buildLinkNode(
    rawHref: string,
    title: string | undefined,
    children: MarkdownNode[],
): LinkNode {
    return { type: 'link', href: sanitizeUrl(rawHref), title, children }
}

/**
 * Build an {@link ImageNode}, routing the raw `src` through {@link sanitizeUrl}.
 * See {@link buildLinkNode} — these two are the sole node constructors (FR-005).
 *
 * @param rawSrc - The `src` exactly as captured from the HTML.
 * @param alt - The optional alternative text.
 * @param title - The optional image title.
 * @returns An image node whose `src` is scheme-safe.
 */
function buildImageNode(
    rawSrc: string,
    alt: string | undefined,
    title: string | undefined,
): ImageNode {
    return { type: 'image', src: sanitizeUrl(rawSrc), alt, title }
}

/**
 * Parse HTML string into a Markdown AST.
 *
 * Uses regex-based parsing to convert HTML elements into AST nodes.
 * Designed to work with the output of @libs/markdown.
 *
 * @param html - HTML string to parse
 * @returns Array of AST nodes
 */
export function parseHtmlToAst(html: string): MarkdownNode[] {
    const nodes: MarkdownNode[] = []
    let remaining = html.trim()

    while (remaining.length > 0) {
        const result = parseNextElement(remaining)
        if (result.node) {
            nodes.push(result.node)
        }
        if (result.consumed === 0) {
            // Prevent infinite loop - skip one character
            remaining = remaining.slice(1)
        } else {
            remaining = remaining.slice(result.consumed)
        }
    }

    return nodes
}

interface ParseResult {
    node: MarkdownNode | null
    consumed: number
}

function parseNextElement(html: string): ParseResult {
    // Handle leading whitespace as text
    const whitespaceMatch = html.match(/^\s+/)
    if (whitespaceMatch) {
        return {
            node: { type: 'text', value: whitespaceMatch[0] },
            consumed: whitespaceMatch[0].length,
        }
    }

    // Try to match different HTML elements
    let result: ParseResult | null = null

    result = tryParseHeading(html)
    if (result) return result

    result = tryParseCodeBlock(html)
    if (result) return result

    result = tryParseBlockquote(html)
    if (result) return result

    result = tryParseList(html)
    if (result) return result

    result = tryParseTable(html)
    if (result) return result

    result = tryParseHr(html)
    if (result) return result

    result = tryParseParagraph(html)
    if (result) return result

    result = tryParseLink(html)
    if (result) return result

    result = tryParseImage(html)
    if (result) return result

    result = tryParseInlineCode(html)
    if (result) return result

    result = tryParseStrong(html)
    if (result) return result

    result = tryParseEmphasis(html)
    if (result) return result

    result = tryParseBr(html)
    if (result) return result

    // Fallback: treat as text
    // Match until next tag start or end of string
    const textMatch = html.match(/^[^<]+/)
    if (textMatch) {
        return {
            node: { type: 'text', value: decodeHtmlEntities(textMatch[0]) },
            consumed: textMatch[0].length,
        }
    }

    // Skip unknown tags
    const tagMatch = html.match(/^<[^>]+>/)
    if (tagMatch) {
        return { node: null, consumed: tagMatch[0].length }
    }

    return { node: null, consumed: 1 }
}

function tryParseHeading(html: string): ParseResult | null {
    const match = html.match(/^<h([1-6])([^>]*)>([\s\S]*?)<\/h\1>/i)
    if (!match) return null

    const level = parseInt(match[1], 10) as 1 | 2 | 3 | 4 | 5 | 6
    const content = match[3]

    const node: HeadingNode = {
        type: 'heading',
        level,
        children: parseInlineContent(content),
    }

    return { node, consumed: match[0].length }
}

function tryParseCodeBlock(html: string): ParseResult | null {
    // Match <pre><code class="language-xxx">...</code></pre>
    const match = html.match(
        /^<pre[^>]*><code(?:\s+class="(?:language-|hljs\s+)([^"]*)")?[^>]*>([\s\S]*?)<\/code><\/pre>/i,
    )
    if (!match) return null

    const language = match[1]?.split(/\s+/)[0] || undefined
    const rawHtml = match[2]
    // Keep the raw HTML for pre-highlighted content
    // Also provide decoded text for copy functionality
    const code = stripHtmlTags(decodeHtmlEntities(rawHtml))

    const node: CodeBlockNode = {
        type: 'codeblock',
        language,
        value: code,
        html: rawHtml,
    }

    return { node, consumed: match[0].length }
}

function tryParseBlockquote(html: string): ParseResult | null {
    const match = html.match(/^<blockquote[^>]*>([\s\S]*?)<\/blockquote>/i)
    if (!match) return null

    const node: MarkdownNode = {
        type: 'blockquote',
        children: parseHtmlToAst(match[1]),
    }

    return { node, consumed: match[0].length }
}

function tryParseList(html: string): ParseResult | null {
    const match = html.match(/^<(ul|ol)([^>]*)>([\s\S]*?)<\/\1>/i)
    if (!match) return null

    const ordered = match[1].toLowerCase() === 'ol'
    const startMatch = match[2].match(/start="(\d+)"/)
    const start = startMatch ? parseInt(startMatch[1], 10) : undefined
    const content = match[3]

    // Parse list items
    const items: MarkdownNode[] = []
    const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi
    let liMatch
    while ((liMatch = liRegex.exec(content)) !== null) {
        items.push({
            type: 'listitem',
            children: parseHtmlToAst(liMatch[1]),
        })
    }

    const node: ListNode = {
        type: 'list',
        ordered,
        start,
        children: items,
    }

    return { node, consumed: match[0].length }
}

function tryParseTable(html: string): ParseResult | null {
    const match = html.match(/^<table[^>]*>([\s\S]*?)<\/table>/i)
    if (!match) return null

    const content = match[1]
    const rows: MarkdownNode[] = []

    // Parse thead
    const theadMatch = content.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i)
    if (theadMatch) {
        const headerRows = parseTableRows(theadMatch[1], true)
        rows.push(...headerRows)
    }

    // Parse tbody
    const tbodyMatch = content.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)
    if (tbodyMatch) {
        const bodyRows = parseTableRows(tbodyMatch[1], false)
        rows.push(...bodyRows)
    }

    // Parse rows without thead/tbody
    if (!theadMatch && !tbodyMatch) {
        const directRows = parseTableRows(content, false)
        rows.push(...directRows)
    }

    const node: MarkdownNode = {
        type: 'table',
        children: rows,
    }

    return { node, consumed: match[0].length }
}

function parseTableRows(html: string, isHeader: boolean): MarkdownNode[] {
    const rows: MarkdownNode[] = []
    const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
    let trMatch

    while ((trMatch = trRegex.exec(html)) !== null) {
        const cells: MarkdownNode[] = []
        const cellRegex = /<(th|td)([^>]*)>([\s\S]*?)<\/\1>/gi
        let cellMatch

        while ((cellMatch = cellRegex.exec(trMatch[1])) !== null) {
            const isHeaderCell = cellMatch[1].toLowerCase() === 'th' || isHeader
            const attrs = cellMatch[2]
            const alignMatch = attrs.match(/align="([^"]*)"/i)
            const align = alignMatch
                ? (alignMatch[1] as 'left' | 'center' | 'right')
                : undefined

            const cell: TableCellNode = {
                type: 'tablecell',
                header: isHeaderCell,
                align,
                children: parseInlineContent(cellMatch[3]),
            }
            cells.push(cell)
        }

        rows.push({
            type: 'tablerow',
            children: cells,
        })
    }

    return rows
}

function tryParseHr(html: string): ParseResult | null {
    const match = html.match(/^<hr\s*\/?>/i)
    if (!match) return null

    return { node: { type: 'hr' }, consumed: match[0].length }
}

function tryParseParagraph(html: string): ParseResult | null {
    const match = html.match(/^<p[^>]*>([\s\S]*?)<\/p>/i)
    if (!match) return null

    const node: MarkdownNode = {
        type: 'paragraph',
        children: parseInlineContent(match[1]),
    }

    return { node, consumed: match[0].length }
}

/**
 * Parse inline content (links, code, emphasis, etc.)
 */
function parseInlineContent(html: string): MarkdownNode[] {
    const nodes: MarkdownNode[] = []
    let remaining = html

    while (remaining.length > 0) {
        // Try inline code first
        const codeMatch = remaining.match(/^<code[^>]*>([\s\S]*?)<\/code>/i)
        if (codeMatch) {
            const node: InlineCodeNode = {
                type: 'code',
                value: decodeHtmlEntities(codeMatch[1]),
            }
            nodes.push(node)
            remaining = remaining.slice(codeMatch[0].length)
            continue
        }

        // Try link
        const linkMatch = remaining.match(LINK_RE)
        if (linkMatch) {
            const node = buildLinkNode(
                linkMatch[1],
                linkMatch[2] || undefined,
                parseInlineContent(linkMatch[3]),
            )
            nodes.push(node)
            remaining = remaining.slice(linkMatch[0].length)
            continue
        }

        // Try image
        const imgMatch = remaining.match(IMAGE_RE)
        if (imgMatch) {
            const node = buildImageNode(
                imgMatch[1],
                imgMatch[2] || undefined,
                imgMatch[3] || undefined,
            )
            nodes.push(node)
            remaining = remaining.slice(imgMatch[0].length)
            continue
        }

        // Try strong
        const strongMatch = remaining.match(
            /^<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/i,
        )
        if (strongMatch) {
            nodes.push({
                type: 'strong',
                children: parseInlineContent(strongMatch[1]),
            })
            remaining = remaining.slice(strongMatch[0].length)
            continue
        }

        // Try emphasis
        const emMatch = remaining.match(
            /^<(?:em|i)[^>]*>([\s\S]*?)<\/(?:em|i)>/i,
        )
        if (emMatch) {
            nodes.push({
                type: 'emphasis',
                children: parseInlineContent(emMatch[1]),
            })
            remaining = remaining.slice(emMatch[0].length)
            continue
        }

        // Try br
        const brMatch = remaining.match(/^<br\s*\/?>/i)
        if (brMatch) {
            nodes.push({ type: 'br' })
            remaining = remaining.slice(brMatch[0].length)
            continue
        }

        // Try to skip other tags
        const tagMatch = remaining.match(/^<\/?[a-z][^>]*>/i)
        if (tagMatch) {
            remaining = remaining.slice(tagMatch[0].length)
            continue
        }

        // Collect text until next tag
        const textMatch = remaining.match(/^[^<]+/)
        if (textMatch) {
            nodes.push({
                type: 'text',
                value: decodeHtmlEntities(textMatch[0]),
            })
            remaining = remaining.slice(textMatch[0].length)
            continue
        }

        // Skip single character
        remaining = remaining.slice(1)
    }

    return nodes
}

/**
 * Decode HTML entities
 */
function decodeHtmlEntities(text: string): string {
    return text
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&#38;/g, '&')
        .replace(/&#x26;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'")
        .replace(/&#x3C;/g, '<')
        .replace(/&#x3E;/g, '>')
        .replace(/&nbsp;/g, ' ')
}

/**
 * Strip HTML tags from text (for extracting plain code for copy)
 */
function stripHtmlTags(text: string): string {
    return text.replace(/<[^>]*>/g, '')
}

function tryParseLink(html: string): ParseResult | null {
    const match = html.match(LINK_RE)
    if (!match) return null

    const node = buildLinkNode(
        match[1],
        match[2] || undefined,
        parseInlineContent(match[3]),
    )

    return { node, consumed: match[0].length }
}

function tryParseImage(html: string): ParseResult | null {
    const match = html.match(IMAGE_RE)
    if (!match) return null

    const node = buildImageNode(
        match[1],
        match[2] || undefined,
        match[3] || undefined,
    )

    return { node, consumed: match[0].length }
}

function tryParseInlineCode(html: string): ParseResult | null {
    const match = html.match(/^<code[^>]*>([\s\S]*?)<\/code>/i)
    if (!match) return null

    const node: InlineCodeNode = {
        type: 'code',
        value: decodeHtmlEntities(match[1]),
    }

    return { node, consumed: match[0].length }
}

function tryParseStrong(html: string): ParseResult | null {
    const match = html.match(
        /^<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/i,
    )
    if (!match) return null

    const node: MarkdownNode = {
        type: 'strong',
        children: parseInlineContent(match[1]),
    }

    return { node, consumed: match[0].length }
}

function tryParseEmphasis(html: string): ParseResult | null {
    const match = html.match(
        /^<(?:em|i)[^>]*>([\s\S]*?)<\/(?:em|i)>/i,
    )
    if (!match) return null

    const node: MarkdownNode = {
        type: 'emphasis',
        children: parseInlineContent(match[1]),
    }

    return { node, consumed: match[0].length }
}

function tryParseBr(html: string): ParseResult | null {
    const match = html.match(/^<br\s*\/?>/i)
    if (!match) return null

    return { node: { type: 'br' }, consumed: match[0].length }
}
