/**
 * @fileoverview Type definitions for the Markdown renderer.
 *
 * @module @lockness/markdown/types
 */

import type { FC } from 'hono/jsx'

/**
 * Parsed Markdown AST node types
 */
export type MarkdownNodeType =
    | 'heading'
    | 'paragraph'
    | 'text'
    | 'code'
    | 'codeblock'
    | 'list'
    | 'listitem'
    | 'blockquote'
    | 'table'
    | 'tablerow'
    | 'tablecell'
    | 'link'
    | 'image'
    | 'emphasis'
    | 'strong'
    | 'hr'
    | 'br'

/**
 * Base AST node interface
 */
export interface MarkdownNode {
    type: MarkdownNodeType
    children?: MarkdownNode[]
    value?: string
    [key: string]: unknown
}

/**
 * Heading node
 */
export interface HeadingNode extends MarkdownNode {
    type: 'heading'
    level: 1 | 2 | 3 | 4 | 5 | 6
}

/**
 * Code block node
 */
export interface CodeBlockNode extends MarkdownNode {
    type: 'codeblock'
    language?: string
    /** Raw code text (HTML entities decoded) */
    value: string
    /**
     * Pre-highlighted HTML from @libs/markdown, **sanitised at the parser**:
     * `sanitizeCodeHtml` (parser.ts) escapes every `<`/`>` and re-admits only
     * the highlighter's own `<span class="hljs-…">`/`</span>` structure, so this
     * field can carry no author element even if the upstream engine failed to
     * escape it (issue #159).
     */
    html?: string
}

/**
 * Inline code node
 */
export interface InlineCodeNode extends MarkdownNode {
    type: 'code'
    value: string
}

/**
 * Link node
 */
export interface LinkNode extends MarkdownNode {
    type: 'link'
    href: string
    title?: string
}

/**
 * Image node
 */
export interface ImageNode extends MarkdownNode {
    type: 'image'
    src: string
    alt?: string
    title?: string
}

/**
 * List node
 */
export interface ListNode extends MarkdownNode {
    type: 'list'
    ordered: boolean
    start?: number
}

/**
 * Table cell node
 */
export interface TableCellNode extends MarkdownNode {
    type: 'tablecell'
    header?: boolean
    align?: 'left' | 'center' | 'right'
}

/**
 * Component override map for custom rendering
 */
export interface ComponentOverrides {
    /**
     * Override heading rendering
     */
    Heading?: FC<{ level: number; children: unknown }>
    /**
     * Override paragraph rendering
     */
    Paragraph?: FC<{ children: unknown }>
    /**
     * Override code block rendering.
     *
     * **Trust invariant (enforced at the parser, #159)** — when `html` comes
     * from `parseHtmlToAst`, `sanitizeCodeHtml` has already reduced it to
     * allowlisted highlighter markup only (a `<span class="hljs-…">` tree
     * wrapping escaped code text); every other `<`/`>` is an entity, so no
     * author element can survive regardless of the upstream engine's escaping.
     * The only implementation that consumes `html` through a raw-HTML sink is
     * `@lockness/ui`'s `HighlightedCodeBlock`; the plain-HTML default in
     * `@lockness/markdown` ignores `html` and renders escaped `children` only.
     * The one residual (deliberately out of scope of #159): a caller that
     * hand-builds an AST or passes untrusted HTML **directly** to
     * `HighlightedCodeBlock html={…}` bypasses the parser and re-opens the sink —
     * see plan §6 (017-break-ui-markdown-cycle), issues #127 and #159.
     *
     * @param language - The code language (e.g., 'typescript')
     * @param children - Plain text code (for copy functionality)
     * @param html - Pre-highlighted, escaped HTML from the highlighter only
     */
    CodeBlock?: FC<{ language?: string; children: string; html?: string }>
    /**
     * Override inline code rendering
     */
    InlineCode?: FC<{ children: unknown }>
    /**
     * Override link rendering
     */
    Link?: FC<{ href: string; title?: string; children: unknown }>
    /**
     * Override blockquote rendering
     */
    Blockquote?: FC<{ children: unknown }>
    /**
     * Override table rendering (the outer container)
     */
    Table?: FC<{ children: unknown }>
    /**
     * Override the table header group (`<thead>`).
     *
     * One of the five structural table primitives. They are separate from
     * {@link ComponentOverrides.Table} because the renderer's engine keeps the
     * header/body **grouping** decision (which rows are headers) while
     * delegating the leaf wrappers to the map — this is what lets
     * `@lockness/markdown` render tables without importing `@lockness/ui`.
     */
    TableHeader?: FC<{ children: unknown }>
    /**
     * Override the table body group (`<tbody>`). See {@link ComponentOverrides.TableHeader}.
     */
    TableBody?: FC<{ children: unknown }>
    /**
     * Override a table row (`<tr>`). See {@link ComponentOverrides.TableHeader}.
     */
    TableRow?: FC<{ children: unknown }>
    /**
     * Override a header cell (`<th>`). `class` carries the alignment utility.
     * See {@link ComponentOverrides.TableHeader}.
     */
    TableHead?: FC<{ children: unknown; class?: string }>
    /**
     * Override a body cell (`<td>`). `class` carries the alignment utility.
     * See {@link ComponentOverrides.TableHeader}.
     */
    TableCell?: FC<{ children: unknown; class?: string }>
    /**
     * Override list rendering
     */
    List?: FC<{ ordered: boolean; children: unknown }>
    /**
     * Override list item rendering
     */
    ListItem?: FC<{ children: unknown }>
    /**
     * Override horizontal rule rendering
     */
    HorizontalRule?: FC
    /**
     * Override image rendering
     */
    Image?: FC<{ src: string; alt?: string; title?: string }>
}

/**
 * Markdown renderer options
 */
export interface MarkdownRendererOptions {
    /**
     * Custom component overrides
     */
    components?: ComponentOverrides
    /**
     * Whether to strip the first H1 heading
     * @default false
     */
    stripTitle?: boolean
    /**
     * Additional CSS class for the wrapper
     */
    class?: string
}
