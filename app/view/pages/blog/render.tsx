/**
 * @fileoverview Blog view helper — the single home of Markdown rendering and
 * meta-description extraction for the blog.
 *
 * `renderPostBody` is the one call to `@lockness/markdown` (plan §5, A5): the
 * shared allowlist pipeline that gives the blog the same styling and XSS safety
 * as the docs. `plaintextExcerpt` produces a plain-text summary for
 * `<meta name="description">` — it must be set via a JSX attribute binding
 * (`content={excerpt}`), never string-concatenated into markup (S3).
 *
 * @module @view/pages/blog/render
 */

import { renderMarkdownWithoutTitle } from '@lockness/markdown'

/**
 * Format a post's publication date for display.
 *
 * The single home of the blog's date formatting — both the index and the post
 * page render dates through this helper so the format cannot drift between them.
 *
 * @param date - The post's publication date.
 * @returns A long-form English date, e.g. `January 15, 2026`.
 *
 * @example
 * ```ts
 * formatDate(new Date('2026-01-15'))  // "January 15, 2026"
 * ```
 */
export function formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    })
}

/**
 * Render a post's Markdown body to JSX through the shared pipeline.
 *
 * The first H1 is stripped so it does not double the `title` column already
 * shown by the page (edge case in plan §2).
 *
 * @param bodyMd - Raw Markdown source from the `body_md` column.
 * @returns A JSX tree rendered by `@lockness/markdown`.
 *
 * @example
 * ```tsx
 * <article>{await renderPostBody(post.bodyMd)}</article>
 * ```
 */
export function renderPostBody(bodyMd: string): Promise<unknown> {
    return renderMarkdownWithoutTitle(bodyMd)
}

/**
 * Extract a plain-text excerpt from a Markdown body for `<meta description>`.
 *
 * Strips code fences, HTML tags and the common Markdown markup, collapses
 * whitespace, and truncates to `maxLength` characters (adding an ellipsis when
 * it cuts). The result is plain text with no markup, so binding it to a JSX
 * attribute (`content={excerpt}`) is safe — the framework escapes it (S3).
 *
 * @param bodyMd - Raw Markdown source.
 * @param maxLength - Maximum length of the excerpt. Defaults to 160.
 * @returns A plain-text, markup-free excerpt.
 *
 * @example
 * ```ts
 * plaintextExcerpt('# Title\n\nHello **world**')  // "Hello world"
 * ```
 */
export function plaintextExcerpt(bodyMd: string, maxLength = 160): string {
    const text = bodyMd
        // Drop a leading H1 — the page shows the `title` column separately, so
        // the rendered body strips it too (renderPostBody uses stripTitle).
        .replace(/^\s*#\s+.*$/m, ' ')
        // Remove fenced code blocks entirely.
        .replace(/```[\s\S]*?```/g, ' ')
        // Remove inline code, keeping the inner text.
        .replace(/`([^`]*)`/g, '$1')
        // Drop any HTML/XML tags (e.g. <script>, <img ...>).
        .replace(/<[^>]*>/g, ' ')
        // Images: ![alt](url) -> alt
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
        // Links: [text](url) -> text
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        // Headings, blockquotes and list markers at line starts.
        .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
        // Emphasis / bold / strikethrough markers.
        .replace(/[*_~]/g, '')
        // Collapse all whitespace runs.
        .replace(/\s+/g, ' ')
        .trim()

    if (text.length <= maxLength) return text
    return text.slice(0, maxLength).trimEnd() + '…'
}
