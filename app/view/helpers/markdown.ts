/**
 * @fileoverview Markdown parser for documentation pages.
 *
 * Converts Markdown content into structured blocks that can be rendered
 * as JSX components. Supports headings, paragraphs, code blocks, lists,
 * blockquotes, and tables.
 *
 * @module @view/helpers/markdown
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Supported block types in parsed Markdown */
export type MarkdownBlockType =
    | 'heading'
    | 'paragraph'
    | 'code'
    | 'list'
    | 'blockquote'
    | 'table'

/** Heading levels (1-6) */
export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6

/** Supported code block languages */
export type CodeLanguage =
    | 'typescript'
    | 'javascript'
    | 'bash'
    | 'terminal'
    | 'json'
    | 'html'
    | 'css'
    | 'tsx'
    | 'jsx'
    | string

/**
 * Base interface for all Markdown blocks.
 */
interface BaseBlock {
    /** The type of Markdown block */
    readonly type: MarkdownBlockType
    /** Raw text content of the block */
    readonly content: string
}

/**
 * Heading block (h1-h6).
 */
export interface HeadingBlock extends BaseBlock {
    readonly type: 'heading'
    /** Heading level (1 = h1, 2 = h2, etc.) */
    readonly level: HeadingLevel
}

/**
 * Paragraph block.
 */
export interface ParagraphBlock extends BaseBlock {
    readonly type: 'paragraph'
}

/**
 * Code block with syntax highlighting.
 */
export interface CodeBlock extends BaseBlock {
    readonly type: 'code'
    /** Programming language for syntax highlighting */
    readonly language: CodeLanguage
}

/**
 * Unordered list block.
 */
export interface ListBlock extends BaseBlock {
    readonly type: 'list'
    /** List items (without bullet points) */
    readonly items: readonly string[]
}

/**
 * Blockquote block.
 */
export interface BlockquoteBlock extends BaseBlock {
    readonly type: 'blockquote'
}

/**
 * Table block with headers and rows.
 */
export interface TableBlock extends BaseBlock {
    readonly type: 'table'
    /** Column headers */
    readonly headers: readonly string[]
    /** Data rows (array of cells for each row) */
    readonly rows: readonly (readonly string[])[]
}

/**
 * Union type representing any Markdown block.
 *
 * Use type narrowing with `block.type` to access type-specific properties:
 *
 * @example
 * ```typescript
 * if (block.type === 'heading') {
 *     console.log(block.level) // TypeScript knows this is HeadingBlock
 * }
 * ```
 */
export type MarkdownBlock =
    | HeadingBlock
    | ParagraphBlock
    | CodeBlock
    | ListBlock
    | BlockquoteBlock
    | TableBlock

/**
 * Parses Markdown content into an array of structured blocks.
 *
 * Supported Markdown syntax:
 * - Headings: `# H1`, `## H2`, etc.
 * - Code blocks: ` ```language ... ``` `
 * - Blockquotes: `> quote`
 * - Unordered lists: `- item` or `* item`
 * - Tables: `| Header | ... |`
 * - Paragraphs: Plain text
 *
 * @param content - Raw Markdown string to parse
 * @returns Array of parsed Markdown blocks
 *
 * @example
 * ```typescript
 * const blocks = parseMarkdown('# Title\n\nSome paragraph.')
 * // Returns: [
 * //   { type: 'heading', level: 1, content: 'Title' },
 * //   { type: 'paragraph', content: 'Some paragraph.' }
 * // ]
 * ```
 */
export function parseMarkdown(content: string): MarkdownBlock[] {
    const lines = content.split('\n')
    const blocks: MarkdownBlock[] = []
    let i = 0

    while (i < lines.length) {
        const line = lines[i]

        // Skip empty lines
        if (!line.trim()) {
            i++
            continue
        }

        // Headings
        if (line.startsWith('#')) {
            const level = (line.match(/^#+/)?.[0].length || 1) as HeadingLevel
            const headingContent = line.replace(/^#+\s*/, '')
            blocks.push({ type: 'heading', level, content: headingContent })
            i++
            continue
        }

        // Code blocks
        if (line.startsWith('```')) {
            const language = line.slice(3).trim() || 'typescript'
            const codeLines: string[] = []
            i++
            while (i < lines.length && !lines[i].startsWith('```')) {
                codeLines.push(lines[i])
                i++
            }
            blocks.push({
                type: 'code',
                language: language as CodeLanguage,
                content: codeLines.join('\n'),
            })
            i++ // skip closing ```
            continue
        }

        // Blockquotes
        if (line.startsWith('>')) {
            const content = line.replace(/^>\s*/, '')
            blocks.push({ type: 'blockquote', content })
            i++
            continue
        }

        // Lists
        if (line.match(/^[\-\*]\s/) && !line.match(/^\|/)) {
            const listItems: string[] = []
            while (i < lines.length && lines[i].match(/^[\-\*]\s/)) {
                listItems.push(lines[i].replace(/^[\-\*]\s/, ''))
                i++
            }
            blocks.push({ type: 'list', content: '', items: listItems })
            continue
        }

        // Tables (lines starting with |)
        if (line.startsWith('|')) {
            const tableLines: string[] = []
            while (i < lines.length && lines[i].trim().startsWith('|')) {
                tableLines.push(lines[i])
                i++
            }

            if (tableLines.length >= 2) {
                // Parse header row
                const headerLine = tableLines[0]
                const headers = headerLine
                    .split('|')
                    .map((cell) => cell.trim())
                    .filter((cell) => cell.length > 0)

                // Skip separator row (index 1) and parse data rows
                const rows: string[][] = []
                for (let j = 2; j < tableLines.length; j++) {
                    const cells = tableLines[j]
                        .split('|')
                        .map((cell) => cell.trim())
                        .filter((cell) => cell.length > 0)
                    if (cells.length > 0) {
                        rows.push(cells)
                    }
                }

                blocks.push({
                    type: 'table',
                    content: '',
                    headers: headers as readonly string[],
                    rows: rows as readonly (readonly string[])[],
                })
            }
            continue
        }

        // Paragraphs
        const paragraphLines: string[] = []
        while (
            i < lines.length &&
            lines[i].trim() &&
            !lines[i].startsWith('#') &&
            !lines[i].startsWith('```') &&
            !lines[i].startsWith('>') &&
            !lines[i].startsWith('|') &&
            !lines[i].match(/^[\-\*]\s/)
        ) {
            paragraphLines.push(lines[i])
            i++
        }
        if (paragraphLines.length > 0) {
            blocks.push({
                type: 'paragraph',
                content: paragraphLines.join(' '),
            })
        }
    }

    return blocks
}

/**
 * Loads and parses a Markdown file from the docs content directory.
 *
 * Automatically handles path resolution for both development and production
 * environments (when running from `dist/` directory).
 *
 * @param filename - Filename without extension (e.g., 'routing', 'installation')
 * @returns Array of parsed Markdown blocks
 * @throws {Error} If the file cannot be read
 *
 * @example
 * ```typescript
 * const blocks = loadMarkdownContent('routing')
 * // Loads from: app/view/pages/docs/content/routing.md
 * ```
 */
export function loadMarkdownContent(filename: string): MarkdownBlock[] {
    // In production, the server runs from dist/ directory
    // Check if we're in the dist folder by looking at the current working directory
    const cwd = Deno.cwd()
    const isInDist = cwd.endsWith('/dist') || cwd.endsWith('\\dist')

    const contentPath = isInDist
        ? join(
            cwd,
            '..',
            'app',
            'view',
            'pages',
            'docs',
            'content',
            `${filename}.md`,
        )
        : join(
            cwd,
            'app',
            'view',
            'pages',
            'docs',
            'content',
            `${filename}.md`,
        )

    const content = readFileSync(contentPath, 'utf-8')
    return parseMarkdown(content)
}

/**
 * Processes inline Markdown syntax and converts it to HTML.
 *
 * Supported syntax:
/**
 * HTTP method badge color mapping.
 * Returns Tailwind classes for colored outline badges.
 */
const HTTP_METHOD_COLORS: Record<string, string> = {
    GET: 'text-emerald-500 border-emerald-500/50 bg-emerald-500/10',
    POST: 'text-blue-500 border-blue-500/50 bg-blue-500/10',
    PUT: 'text-amber-500 border-amber-500/50 bg-amber-500/10',
    PATCH: 'text-orange-500 border-orange-500/50 bg-orange-500/10',
    DELETE: 'text-red-500 border-red-500/50 bg-red-500/10',
    HEAD: 'text-purple-500 border-purple-500/50 bg-purple-500/10',
    OPTIONS: 'text-gray-500 border-gray-500/50 bg-gray-500/10',
}

/**
 * Processes inline Markdown syntax and converts to HTML.
 *
 * Handles the following inline elements:
 * - Links: `[text](url)` → `<a href="url">text</a>`
 * - Inline code: `` `code` `` → `<code>code</code>`
 * - Bold: `**text**` → `<strong>text</strong>`
 * - Italic: `*text*` → `<em>text</em>`
 * - HTTP methods: `GET`, `POST`, etc. → colored badge
 *
 * @param text - Raw text with inline Markdown syntax
 * @returns HTML string with Markdown converted to HTML tags
 *
 * @example
 * ```typescript
 * processInlineMarkdown('Use `@Get` decorator')
 * // Returns: 'Use <code class="...">@Get</code> decorator'
 *
 * processInlineMarkdown('See [docs](/docs) for **more** info')
 * // Returns: 'See <a href="/docs">docs</a> for <strong>more</strong> info'
 * ```
 */
export function processInlineMarkdown(text: string): string {
    return (
        text
            // Links [text](url)
            .replace(
                /\[([^\]]+)\]\(([^)]+)\)/g,
                '<a href="$2" class="text-primary hover:underline">$1</a>',
            )
            // Inline code
            .replace(
                /`([^`]+)`/g,
                '<code class="px-1.5 py-0.5 bg-muted text-foreground font-mono text-sm rounded">$1</code>',
            )
            // Bold
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            // Italic
            .replace(/\*([^*]+)\*/g, '<em>$1</em>')
            // HTTP methods (standalone words only)
            .replace(
                /\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g,
                (method) => {
                    const colors = HTTP_METHOD_COLORS[method] || ''
                    return `<span class="inline-flex items-center px-2 py-0.5 text-xs font-mono font-semibold border rounded ${colors}">${method}</span>`
                },
            )
    )
}
