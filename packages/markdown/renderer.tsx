/**
 * @fileoverview JSX renderer using Lockness UI components.
 *
 * Transforms Markdown AST nodes into JSX elements using
 * the Lockness UI component library.
 *
 * @module @lockness/markdown/renderer
 */

import type { FC } from 'hono/jsx'
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
 * Default component map — **plain semantic HTML only**, with no dependency on
 * any component library. This is what makes `@lockness/markdown` renderable
 * standalone (issue #127): a consumer that only wants Markdown → JSX pulls in
 * no UI package. For design-system output, `@lockness/ui/markdown` supplies a
 * styled map that overrides these via {@link MarkdownRendererOptions.components}.
 */
const defaultComponents: Required<ComponentOverrides> = {
    Heading: ({ level, children }) => {
        switch (level) {
            case 1:
                return <h1>{children}</h1>
            case 2:
                return <h2>{children}</h2>
            case 3:
                return <h3>{children}</h3>
            case 4:
                return <h4>{children}</h4>
            case 5:
                return <h5>{children}</h5>
            default:
                return <h6>{children}</h6>
        }
    },
    Paragraph: ({ children }) => <p>{children}</p>,
    // Renders escaped `children` (plain code text) only. It deliberately
    // IGNORES the `html` field: forwarding pre-highlighted HTML would require a
    // raw-HTML sink (`dangerouslySetInnerHTML`), which is the one thing the
    // plain default must never introduce. Syntax-highlighted output is the
    // styled map's job (`@lockness/ui`), not the framework-free default.
    // See the trust invariant on ComponentOverrides.CodeBlock and issue #127.
    CodeBlock: ({ language, children }) => {
        // The parser may hand back either a bare language (`ts`) or an
        // already-prefixed token (`language-ts`, from the highlighter's
        // `hljs language-ts` class); normalise to exactly one `language-`
        // prefix so downstream highlighters get a stable hook.
        const languageClass = language
            ? (language.startsWith('language-')
                ? language
                : `language-${language}`)
            : undefined
        return (
            <pre>
                <code class={languageClass}>{children}</code>
            </pre>
        )
    },
    InlineCode: ({ children }) => <code>{children}</code>,
    // `href` is forwarded verbatim (Hono escapes the value but does not strip
    // the scheme). This matches the styled path's current behaviour exactly;
    // URI-scheme allowlisting is a parser/engine concern (see #148), never a
    // per-map decision.
    Link: ({ href, title, children }) => (
        <a href={href} title={title}>{children}</a>
    ),
    Blockquote: ({ children }) => <blockquote>{children}</blockquote>,
    Table: ({ children }) => <table>{children}</table>,
    TableHeader: ({ children }) => <thead>{children}</thead>,
    TableBody: ({ children }) => <tbody>{children}</tbody>,
    TableRow: ({ children }) => <tr>{children}</tr>,
    TableHead: ({ children, class: className }) => (
        <th class={className}>{children}</th>
    ),
    TableCell: ({ children, class: className }) => (
        <td class={className}>{children}</td>
    ),
    List: ({ ordered, children }) =>
        ordered ? <ol>{children}</ol> : <ul>{children}</ul>,
    ListItem: ({ children }) => <li>{children}</li>,
    HorizontalRule: () => <hr />,
    Image: ({ src, alt, title }) => <img src={src} alt={alt} title={title} />,
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
    // The five structural table primitives come from the component map so this
    // package renders tables without importing @lockness/ui. The header/body
    // GROUPING decision below (which rows are headers, which cell kind to use)
    // stays in the engine — it is rendering logic, not a styling choice.
    const {
        TableHeader,
        TableBody,
        TableRow,
        TableHead,
        TableCell,
    } = components
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
