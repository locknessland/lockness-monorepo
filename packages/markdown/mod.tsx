/**
 * @fileoverview Lockness Markdown Package
 *
 * Renders Markdown content to JSX using Lockness UI components.
 * Provides a seamless integration between Markdown documentation
 * and the Lockness design system.
 *
 * @module @lockness/markdown
 *
 * @example Basic usage
 * ```tsx
 * import { renderMarkdown, Markdown } from '@lockness/markdown'
 *
 * // Option 1: Render function (async)
 * const jsx = await renderMarkdown('# Hello\n\nWorld!')
 *
 * // Option 2: Component with pre-rendered HTML
 * <Markdown html={htmlFromLibsMarkdown} />
 *
 * // Option 3: Component with raw Markdown
 * <Markdown content="# Hello\n\nWorld!" />
 * ```
 *
 * @example With custom components
 * ```tsx
 * <Markdown
 *   content={markdown}
 *   components={{
 *     CodeBlock: MyCustomCodeBlock,
 *     Blockquote: MyCustomCallout,
 *   }}
 * />
 * ```
 */

import type { FC } from 'hono/jsx'
import { Renderer } from '@libs/markdown'
import gfm from '@libs/markdown/plugins/gfm'
import highlighting from '@libs/markdown/plugins/highlighting'
import { parseHtmlToAst } from './parser.ts'
import { MarkdownContent } from './renderer.tsx'
import type { MarkdownRendererOptions } from './types.ts'

// Re-export types
export type {
    ComponentOverrides,
    MarkdownNode,
    MarkdownNodeType,
    MarkdownRendererOptions,
} from './types.ts'

// Re-export components and utilities
export { MarkdownContent } from './renderer.tsx'
export { parseHtmlToAst } from './parser.ts'

/**
 * Singleton renderer instance
 */
let renderer: Renderer | null = null

/**
 * Get or create the markdown renderer instance.
 */
async function getRenderer(): Promise<Renderer> {
    if (!renderer) {
        renderer = await Renderer.with({
            plugins: [gfm, highlighting],
        })
    }
    return renderer
}

/**
 * Render Markdown content to JSX using Lockness UI components.
 *
 * @param content - Raw Markdown string
 * @param options - Rendering options
 * @returns JSX element tree
 *
 * @example
 * ```tsx
 * const jsx = await renderMarkdown('# Hello World')
 * // Returns: <Title level={1}>Hello World</Title>
 * ```
 */
export async function renderMarkdown(
    content: string,
    options?: MarkdownRendererOptions,
): Promise<unknown> {
    const md = await getRenderer()
    const html = await md.render(content)
    const ast = parseHtmlToAst(html)

    return (
        <MarkdownContent
            nodes={ast}
            {...options}
        />
    )
}

/**
 * Render Markdown content to JSX, stripping the first H1 heading.
 *
 * @param content - Raw Markdown string
 * @param options - Rendering options
 * @returns JSX element tree without the first H1
 */
export async function renderMarkdownWithoutTitle(
    content: string,
    options?: MarkdownRendererOptions,
): Promise<unknown> {
    return await renderMarkdown(content, { ...options, stripTitle: true })
}

/**
 * Markdown component props
 */
export interface MarkdownProps extends MarkdownRendererOptions {
    /**
     * Pre-rendered HTML from @libs/markdown
     * Use this when you've already rendered the Markdown
     */
    html?: string
    /**
     * Raw Markdown content
     * Will be rendered synchronously if used (requires pre-rendered HTML)
     */
    content?: string
}

/**
 * Markdown Component (Sync)
 *
 * Renders pre-rendered HTML using Lockness UI components.
 * For raw Markdown, use the async `renderMarkdown()` function.
 *
 * @example
 * ```tsx
 * // Pre-render with @libs/markdown, then use component
 * const html = await libsMarkdownRenderer.render(content)
 *
 * <Markdown html={html} />
 * ```
 */
export const Markdown: FC<MarkdownProps> = ({
    html,
    components,
    stripTitle = false,
    class: className,
}) => {
    if (!html) {
        return (
            <div class={className}>
                <p class='text-muted-foreground'>No content provided</p>
            </div>
        )
    }

    const ast = parseHtmlToAst(html)

    return (
        <MarkdownContent
            nodes={ast}
            components={components}
            stripTitle={stripTitle}
            class={className}
        />
    )
}
