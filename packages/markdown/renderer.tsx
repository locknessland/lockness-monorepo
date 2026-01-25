/**
 * @fileoverview JSX renderer using Lockness UI components.
 *
 * Transforms Markdown AST nodes into JSX elements using
 * the Lockness UI component library.
 *
 * @module @lockness/markdown/renderer
 */

import type { FC } from 'hono/jsx'
import {
    Alert,
    AlertDescription,
    HighlightedCodeBlock,
    InlineCode as UIInlineCode,
    type Language,
    Link as UILink,
    Separator,
    Table as UITable,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
    Title,
} from '@lockness/ui/components'
import type {
    CodeBlockNode,
    ComponentOverrides,
    HeadingNode,
    ImageNode,
    LinkNode,
    ListNode,
    MarkdownNode,
    MarkdownRendererOptions,
    TableCellNode,
} from './types.ts'

/**
 * Default components used for rendering Markdown elements.
 */
const defaultComponents: Required<ComponentOverrides> = {
    Heading: ({ level, children }) => (
        <Title
            level={level as 1 | 2 | 3 | 4 | 5 | 6}
            class={level === 2
                ? 'border-b border-border pb-2 mt-8 mb-4'
                : level === 3
                ? 'mt-6 mb-3'
                : 'mt-4 mb-2'}
        >
            {children}
        </Title>
    ),
    Paragraph: ({ children }) => (
        <p class='leading-7 not-first:mt-6'>{children}</p>
    ),
    CodeBlock: ({ language, children, html }) => (
        <HighlightedCodeBlock lang={language as Language} html={html}>
            {children}
        </HighlightedCodeBlock>
    ),
    InlineCode: ({ children }) => <UIInlineCode>{children}</UIInlineCode>,
    Link: ({ href, children }) => (
        <UILink
            href={href}
            variant='default'
            class='font-medium underline underline-offset-4'
        >
            {children}
        </UILink>
    ),
    Blockquote: ({ children }) => (
        <Alert variant='default' class='my-6'>
            <AlertDescription>{children}</AlertDescription>
        </Alert>
    ),
    Table: ({ children }) => (
        <div class='my-6 w-full overflow-auto'>
            <UITable striped hoverable bordered>
                {children}
            </UITable>
        </div>
    ),
    List: ({ ordered, children }) =>
        ordered
            ? (
                <ol class='my-6 ml-6 list-decimal [&>li]:mt-2'>
                    {children}
                </ol>
            )
            : (
                <ul class='my-6 ml-6 list-disc [&>li]:mt-2'>
                    {children}
                </ul>
            ),
    ListItem: ({ children }) => <li>{children}</li>,
    HorizontalRule: () => <Separator class='my-8' />,
    Image: ({ src, alt, title }) => (
        <img
            src={src}
            alt={alt}
            title={title}
            class='rounded-lg border my-4'
        />
    ),
}

/**
 * Render a single AST node to JSX.
 */
function renderNode(
    node: MarkdownNode,
    components: Required<ComponentOverrides>,
    key: number,
): unknown {
    switch (node.type) {
        case 'heading': {
            const headingNode = node as HeadingNode
            return (
                <components.Heading key={key} level={headingNode.level}>
                    {renderChildren(node.children || [], components)}
                </components.Heading>
            )
        }

        case 'paragraph':
            return (
                <components.Paragraph key={key}>
                    {renderChildren(node.children || [], components)}
                </components.Paragraph>
            )

        case 'codeblock': {
            const codeNode = node as CodeBlockNode
            return (
                <components.CodeBlock
                    key={key}
                    language={codeNode.language}
                    html={codeNode.html}
                >
                    {codeNode.value}
                </components.CodeBlock>
            )
        }

        case 'code': {
            const inlineCodeNode = node as CodeBlockNode
            return (
                <components.InlineCode key={key}>
                    {inlineCodeNode.value}
                </components.InlineCode>
            )
        }

        case 'link': {
            const linkNode = node as LinkNode
            return (
                <components.Link
                    key={key}
                    href={linkNode.href}
                    title={linkNode.title}
                >
                    {renderChildren(node.children || [], components)}
                </components.Link>
            )
        }

        case 'image': {
            const imgNode = node as ImageNode
            return (
                <components.Image
                    key={key}
                    src={imgNode.src}
                    alt={imgNode.alt}
                    title={imgNode.title}
                />
            )
        }

        case 'blockquote':
            return (
                <components.Blockquote key={key}>
                    {renderChildren(node.children || [], components)}
                </components.Blockquote>
            )

        case 'list': {
            const listNode = node as ListNode
            return (
                <components.List key={key} ordered={listNode.ordered}>
                    {renderChildren(node.children || [], components)}
                </components.List>
            )
        }

        case 'listitem':
            return (
                <components.ListItem key={key}>
                    {renderChildren(node.children || [], components)}
                </components.ListItem>
            )

        case 'table':
            return (
                <components.Table key={key}>
                    {renderTableContent(node.children || [], components)}
                </components.Table>
            )

        case 'hr':
            return <components.HorizontalRule key={key} />

        case 'br':
            return <br key={key} />

        case 'strong':
            return (
                <strong key={key} class='font-semibold'>
                    {renderChildren(node.children || [], components)}
                </strong>
            )

        case 'emphasis':
            return (
                <em key={key}>
                    {renderChildren(node.children || [], components)}
                </em>
            )

        case 'text':
            return node.value

        default:
            return renderChildren(node.children || [], components)
    }
}

/**
 * Render an array of AST nodes.
 */
function renderChildren(
    nodes: MarkdownNode[],
    components: Required<ComponentOverrides>,
): unknown[] {
    return nodes.map((node, index) => renderNode(node, components, index))
}

/**
 * Render table content with proper structure.
 */
function renderTableContent(
    rows: MarkdownNode[],
    components: Required<ComponentOverrides>,
): unknown {
    const headerRows: unknown[] = []
    const bodyRows: unknown[] = []

    rows.forEach((row, rowIndex) => {
        if (row.type !== 'tablerow') return

        const cells = row.children || []
        const isHeaderRow = cells.some((cell) =>
            (cell as TableCellNode).header === true
        )

        const renderedCells = cells.map((cell, cellIndex) => {
            const cellNode = cell as TableCellNode
            const CellComponent = cellNode.header ? TableHead : TableCell
            const alignClass = cellNode.align === 'center'
                ? 'text-center'
                : cellNode.align === 'right'
                ? 'text-right'
                : ''

            return (
                <CellComponent key={cellIndex} class={alignClass}>
                    {renderChildren(cell.children || [], components)}
                </CellComponent>
            )
        })

        if (isHeaderRow) {
            headerRows.push(<TableRow key={rowIndex}>{renderedCells}</TableRow>)
        } else {
            bodyRows.push(<TableRow key={rowIndex}>{renderedCells}</TableRow>)
        }
    })

    return (
        <>
            {headerRows.length > 0 && <TableHeader>{headerRows}</TableHeader>}
            {bodyRows.length > 0 && <TableBody>{bodyRows}</TableBody>}
        </>
    )
}

/**
 * MarkdownContent component props
 */
export interface MarkdownContentProps extends MarkdownRendererOptions {
    /**
     * Parsed AST nodes to render
     */
    nodes: MarkdownNode[]
}

/**
 * MarkdownContent Component
 *
 * Renders Markdown AST nodes using Lockness UI components.
 *
 * @example
 * ```tsx
 * import { parseHtmlToAst } from '@lockness/markdown/parser'
 * import { MarkdownContent } from '@lockness/markdown/renderer'
 *
 * const html = await renderMarkdownToHtml(content)
 * const ast = parseHtmlToAst(html)
 *
 * <MarkdownContent nodes={ast} />
 * ```
 */
export const MarkdownContent: FC<MarkdownContentProps> = ({
    nodes,
    components: overrides,
    stripTitle = false,
    class: className,
}) => {
    const components: Required<ComponentOverrides> = {
        ...defaultComponents,
        ...overrides,
    }

    // Filter out first H1 if stripTitle is true
    let nodesToRender = nodes
    if (stripTitle) {
        const firstH1Index = nodes.findIndex(
            (n) => n.type === 'heading' && (n as HeadingNode).level === 1,
        )
        if (firstH1Index !== -1) {
            nodesToRender = [
                ...nodes.slice(0, firstH1Index),
                ...nodes.slice(firstH1Index + 1),
            ]
        }
    }

    return (
        <div class={className}>
            {nodesToRender.map((node, index) =>
                renderNode(node, components, index)
            )}
        </div>
    )
}
