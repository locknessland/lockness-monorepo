/**
 * @fileoverview Utility functions for the Inertia.js adapter.
 *
 * Provides helper functions for HTML escaping, JSON serialization,
 * and the default root view template.
 *
 * @module @lockness/inertia/helpers
 */

import type { PageObject } from './types.ts'

/**
 * HTML special characters that need escaping.
 * @internal
 */
const HTML_ESCAPE_MAP: Readonly<Record<string, string>> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
}

/**
 * Regex for matching HTML special characters.
 * @internal
 */
const HTML_ESCAPE_REGEX = /[&<>"']/g

/**
 * Escape HTML special characters in a string.
 *
 * Prevents XSS vulnerabilities when embedding user data or JSON
 * in HTML attributes or content.
 *
 * @param str - The string to escape
 * @returns The escaped string with HTML entities
 *
 * @example
 * ```typescript
 * escapeHtml('<script>alert("xss")</script>')
 * // Returns: '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
 * ```
 *
 * @example
 * ```typescript
 * escapeHtml("O'Brien & Sons")
 * // Returns: 'O&#039;Brien &amp; Sons'
 * ```
 */
export function escapeHtml(str: string): string {
    return str.replace(
        HTML_ESCAPE_REGEX,
        (char) => HTML_ESCAPE_MAP[char] ?? char,
    )
}

/**
 * Safely serialize a page object to JSON for HTML embedding.
 *
 * Combines JSON stringification with HTML escaping to produce
 * a string safe for use in HTML attributes like `data-page`.
 *
 * @param page - The Inertia page object to serialize
 * @returns An HTML-safe JSON string
 *
 * @example
 * ```typescript
 * const page = {
 *     component: 'Dashboard',
 *     props: { user: { name: "O'Brien" } },
 *     url: '/dashboard',
 *     version: '1.0',
 * }
 *
 * const json = serializePageForHtml(page)
 * // Safe to use in: <div data-page="${json}">
 * ```
 */
export function serializePageForHtml(page: PageObject): string {
    return escapeHtml(JSON.stringify(page))
}

/**
 * Default root view template.
 *
 * Provides a minimal HTML5 shell for Inertia applications when
 * no custom `rootView` is configured. Includes:
 * - Proper DOCTYPE and charset
 * - Viewport meta tag for responsive design
 * - App container with `data-page` attribute
 * - Module script tag for the frontend bundle
 *
 * Override this by providing a custom `rootView` in the middleware
 * config for full control over the HTML shell.
 *
 * @param page - The Inertia page object
 * @returns Complete HTML document string
 *
 * @example Using the default template
 * ```typescript
 * // The middleware uses this automatically:
 * const html = defaultRootView(pageObject)
 * ```
 *
 * @example Custom root view replacing the default
 * ```typescript
 * inertiaMiddleware({
 *     version: '1.0',
 *     rootView: (page) => `
 *         <!DOCTYPE html>
 *         <html lang="en">
 *             <head>
 *                 <meta charset="UTF-8">
 *                 <title>${page.props.title ?? 'My App'}</title>
 *                 <link rel="stylesheet" href="/css/app.css">
 *             </head>
 *             <body>
 *                 <div id="app" data-page="${serializePageForHtml(page)}"></div>
 *                 <script type="module" src="/js/app.js"></script>
 *             </body>
 *         </html>
 *     `,
 * })
 * ```
 */
export function defaultRootView(page: PageObject): string {
    const pageJson = serializePageForHtml(page)

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Lockness App</title>
</head>
<body>
    <div id="app" data-page="${pageJson}"></div>
    <script type="module" src="/js/app.js"></script>
</body>
</html>`
}
