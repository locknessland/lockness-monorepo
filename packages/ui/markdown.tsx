/**
 * @fileoverview Design-system-styled Markdown rendering.
 *
 * This is the styled entry point for Markdown → JSX. It owns the mapping from
 * Markdown elements to `@lockness/ui` components (the `markdownComponents` map)
 * and re-exports {@link renderMarkdown} / {@link renderMarkdownWithoutTitle}
 * pre-bound to that map.
 *
 * The rendering **engine and parser** live in `@lockness/markdown`, which has a
 * plain-HTML default map and no dependency on this library. This module is the
 * only place the two are combined, keeping the package dependency edge one-way
 * (`ui → markdown`) — see issue #127.
 *
 * @module @lockness/ui/markdown
 *
 * @example
 * ```tsx
 * import { renderMarkdown } from '@lockness/ui/markdown'
 *
 * const jsx = await renderMarkdown('# Hello World')
 * // Returns: <Title level={1}>Hello World</Title>
 * ```
 */

import {
    renderMarkdown as renderMarkdownBase,
    renderMarkdownWithoutTitle as renderMarkdownWithoutTitleBase,
} from '@lockness/markdown'
import type {
    ComponentOverrides,
    MarkdownRendererOptions,
} from '@lockness/markdown'
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
} from './components.ts'

/**
 * The Markdown-element → `@lockness/ui` component map.
 *
 * Pass it to `@lockness/markdown`'s renderer via
 * {@link MarkdownRendererOptions.components} to render Markdown with the
 * Lockness design system. {@link renderMarkdown} does this for you.
 *
 * **Note** — the `CodeBlock` entry forwards the highlighter-generated `html`
 * to `HighlightedCodeBlock` (a raw-HTML sink). Per the trust invariant on
 * `ComponentOverrides.CodeBlock`, `html` is escaped highlighter output only;
 * never feed caller-supplied HTML through this map.
 */
export const markdownComponents: Required<ComponentOverrides> = {
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
    TableHeader: ({ children }) => <TableHeader>{children}</TableHeader>,
    TableBody: ({ children }) => <TableBody>{children}</TableBody>,
    TableRow: ({ children }) => <TableRow>{children}</TableRow>,
    TableHead: ({ children, class: className }) => (
        <TableHead class={className}>{children}</TableHead>
    ),
    TableCell: ({ children, class: className }) => (
        <TableCell class={className}>{children}</TableCell>
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
 * Merge {@link markdownComponents} under any caller-supplied overrides, so a
 * caller can still override a single element while keeping the styled map.
 */
function withStyledComponents(
    options?: MarkdownRendererOptions,
): MarkdownRendererOptions {
    return {
        ...options,
        components: { ...markdownComponents, ...options?.components },
    }
}

/**
 * Render Markdown content to JSX using the Lockness UI design system.
 *
 * Delegates to `@lockness/markdown`'s engine with {@link markdownComponents}
 * pre-bound. Caller-supplied `options.components` still win per element.
 *
 * @param content - Raw Markdown string
 * @param options - Rendering options; `components` override the styled map
 * @returns JSX element tree styled with `@lockness/ui` components
 *
 * @example
 * ```tsx
 * const jsx = await renderMarkdown('# Hello World')
 * // Returns: <Title level={1}>Hello World</Title>
 * ```
 */
export function renderMarkdown(
    content: string,
    options?: MarkdownRendererOptions,
): Promise<unknown> {
    return renderMarkdownBase(content, withStyledComponents(options))
}

/**
 * Render Markdown to JSX with the Lockness UI design system, stripping the
 * first H1 heading.
 *
 * @param content - Raw Markdown string
 * @param options - Rendering options; `components` override the styled map
 * @returns JSX element tree without the first H1, styled with `@lockness/ui`
 *
 * @example
 * ```tsx
 * const body = await renderMarkdownWithoutTitle(post.bodyMd)
 * ```
 */
export function renderMarkdownWithoutTitle(
    content: string,
    options?: MarkdownRendererOptions,
): Promise<unknown> {
    return renderMarkdownWithoutTitleBase(
        content,
        withStyledComponents(options),
    )
}
