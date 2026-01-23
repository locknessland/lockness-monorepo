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
    /** Pre-highlighted HTML from @libs/markdown */
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
     * Override code block rendering
     * @param language - The code language (e.g., 'typescript')
     * @param children - Plain text code (for copy functionality)
     * @param html - Pre-highlighted HTML from @libs/markdown
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
     * Override table rendering
     */
    Table?: FC<{ children: unknown }>
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
