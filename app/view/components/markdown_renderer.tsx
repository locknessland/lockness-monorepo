/**
 * @fileoverview React/JSX component for rendering parsed Markdown blocks.
 *
 * Renders Markdown blocks as styled JSX components with support for
 * code highlighting, tables, and inline formatting.
 *
 * @module @view/components/markdown_renderer
 */

import type { FC } from '@lockness/core'
import {
    CodeBlock,
    CommandBlock,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@lockness/ui/components'
import type {
    BlockquoteBlock,
    CodeBlock as CodeBlockType,
    HeadingBlock,
    ListBlock,
    MarkdownBlock,
    ParagraphBlock,
    TableBlock,
} from '../helpers/markdown.ts'
import { processInlineMarkdown } from '../helpers/markdown.ts'

/**
 * Props for the MarkdownRenderer component.
 */
interface MarkdownRendererProps {
    /** Array of parsed Markdown blocks to render */
    readonly blocks: readonly MarkdownBlock[]
    /**
     * Skip the first H1 heading.
     * Useful when the title is already displayed in the page layout header.
     * @default true
     */
    readonly skipFirstHeading?: boolean
}

/**
 * Renders a heading block (h1, h2, or h3+).
 */
const renderHeading = (block: HeadingBlock, index: number) => {
    const html = processInlineMarkdown(block.content)

    if (block.level === 1) {
        return (
            <h1
                key={index}
                class='font-pixel text-xl text-primary mb-8 crt-glow'
                dangerouslySetInnerHTML={{ __html: html }}
            />
        )
    }

    if (block.level === 2) {
        return (
            <h2
                key={index}
                class='font-pixel text-base text-foreground mt-12 mb-6'
                dangerouslySetInnerHTML={{ __html: html }}
            />
        )
    }

    return (
        <h3
            key={index}
            class='text-lg font-semibold text-foreground mt-8 mb-4'
            dangerouslySetInnerHTML={{ __html: html }}
        />
    )
}

/**
 * Renders a paragraph block.
 */
const renderParagraph = (block: ParagraphBlock, index: number) => (
    <p
        key={index}
        class='text-lg leading-relaxed mb-4'
        dangerouslySetInnerHTML={{
            __html: processInlineMarkdown(block.content),
        }}
    />
)

/**
 * Renders a code block with syntax highlighting.
 * Uses CommandBlock for bash/terminal, CodeBlock for other languages.
 */
const renderCode = (block: CodeBlockType, index: number) => {
    if (block.language === 'bash' || block.language === 'terminal') {
        return (
            <CommandBlock key={index} lang={block.language}>
                {block.content}
            </CommandBlock>
        )
    }

    return (
        <CodeBlock key={index} lang={block.language}>
            {block.content}
        </CodeBlock>
    )
}

/**
 * Renders an unordered list block.
 */
const renderList = (block: ListBlock, index: number) => (
    <ul key={index} class='list-disc list-inside space-y-2 mb-6 text-lg'>
        {block.items.map((item, i) => (
            <li
                key={i}
                dangerouslySetInnerHTML={{
                    __html: processInlineMarkdown(item),
                }}
            />
        ))}
    </ul>
)

/**
 * Renders a blockquote block.
 */
const renderBlockquote = (block: BlockquoteBlock, index: number) => (
    <div key={index} class='pixel-card p-6 mt-8 bg-primary/10 border-primary'>
        <p
            class='mb-0'
            dangerouslySetInnerHTML={{
                __html: processInlineMarkdown(block.content),
            }}
        />
    </div>
)

/**
 * Renders a table block with headers and rows using @lockness/ui Table components.
 */
const renderTable = (block: TableBlock, index: number) => (
    <Table key={index} hoverable class='mb-6'>
        <TableHeader>
            <TableRow>
                {block.headers.map((header, hIndex) => (
                    <TableHead key={hIndex}>
                        <span
                            dangerouslySetInnerHTML={{
                                __html: processInlineMarkdown(header),
                            }}
                        />
                    </TableHead>
                ))}
            </TableRow>
        </TableHeader>
        <TableBody>
            {block.rows.map((row, rIndex) => (
                <TableRow key={rIndex}>
                    {row.map((cell, cIndex) => (
                        <TableCell key={cIndex}>
                            <span
                                dangerouslySetInnerHTML={{
                                    __html: processInlineMarkdown(cell),
                                }}
                            />
                        </TableCell>
                    ))}
                </TableRow>
            ))}
        </TableBody>
    </Table>
)

/**
 * Renders a single Markdown block based on its type.
 * Uses discriminated union for type-safe block rendering.
 */
const renderBlock = (block: MarkdownBlock, index: number) => {
    switch (block.type) {
        case 'heading':
            return renderHeading(block, index)
        case 'paragraph':
            return renderParagraph(block, index)
        case 'code':
            return renderCode(block, index)
        case 'list':
            return renderList(block, index)
        case 'blockquote':
            return renderBlockquote(block, index)
        case 'table':
            return renderTable(block, index)
        default: {
            // Exhaustive check - TypeScript will error if a case is missing
            const _exhaustive: never = block
            return null
        }
    }
}

/**
 * Component that renders parsed Markdown blocks as styled JSX.
 *
 * Supports headings, paragraphs, code blocks (with syntax highlighting),
 * lists, blockquotes, and tables. Inline Markdown syntax (bold, italic,
 * code, links) is also processed.
 *
 * @example
 * ```tsx
 * import { loadMarkdownContent } from '../helpers/markdown.ts'
 *
 * const blocks = loadMarkdownContent('routing')
 *
 * <MarkdownRenderer blocks={blocks} />
 * ```
 *
 * @example
 * ```tsx
 * // Keep the first H1 heading (don't skip it)
 * <MarkdownRenderer blocks={blocks} skipFirstHeading={false} />
 * ```
 */
export const MarkdownRenderer: FC<MarkdownRendererProps> = ({
    blocks,
    skipFirstHeading = true,
}) => {
    // Find the index of the first H1 to skip if needed
    const firstH1Index = skipFirstHeading
        ? blocks.findIndex((b) => b.type === 'heading' && b.level === 1)
        : -1

    return (
        <div class='prose prose-invert max-w-none'>
            {blocks.map((block, index) => {
                // Skip first H1 if skipFirstHeading is true
                if (index === firstH1Index) {
                    return null
                }

                return renderBlock(block, index)
            })}
        </div>
    )
}
