/**
 * @fileoverview The framework's built-in error pages (404, 401, 403, 500).
 *
 * The pages are written with Hono's `html` tagged template, **not JSX**, and
 * this file is deliberately a `.ts`. `@lockness/core` must publish no `.tsx`:
 * under `"jsx": "precompile"` Deno transpiles a JSR `.tsx` with the CONSUMING
 * application's `jsxImportSource`, ignoring the pragma `deno publish` writes
 * into it, so every app without JSX of its own (the api and slim kits) failed
 * to load `@lockness/core` at all (#470). `publish:check` now refuses a `.tsx`
 * in any package that has no `jsx` entry in `deps.policy.jsonc`.
 *
 * `html` escapes every interpolated value exactly as JSX did, so the error
 * message and stack shown on the development 500 page stay inert text. Only
 * the static stylesheets go through `raw`, and they are constants.
 *
 * @module @lockness/core/exceptions/default_view
 */

import { html, raw } from '@lockness/hono'
import type { Context } from '../types.ts'
import { formatErrorForConsole } from './formatter.ts'
import { isExplicitlyDevelopment } from '../environment.ts'

/** What `html` produces — an escaped string, or a promise of one. */
type Markup = ReturnType<typeof html>

/**
 * Build a page stylesheet. The 404/401/403 pages and the 500 page share every
 * rule except the container width, the paragraph width and the error-details
 * block, which the 500 page alone renders.
 */
function stylesheet(
    { container = '', paragraph = '', extra = '' }: {
        container?: string
        paragraph?: string
        extra?: string
    },
): string {
    return `
                body {
                    font-family: system-ui, -apple-system, sans-serif;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 100vh;
                    margin: 0;
                    background: #f9fafb;
                }
                .container {
                    text-align: center;
                    padding: 2rem;${container}
                }
                h1 {
                    font-size: 6rem;
                    margin: 0;
                    color: #d1d5db;
                    font-weight: 700;
                }
                h2 {
                    font-size: 1.5rem;
                    margin: 1rem 0;
                    color: #1f2937;
                }
                p {
                    color: #6b7280;
                    margin: 1rem auto;${paragraph}
                }${extra}
                a {
                    display: inline-block;
                    margin-top: 2rem;
                    padding: 0.75rem 1.5rem;
                    background: #3b82f6;
                    color: white;
                    text-decoration: none;
                    border-radius: 0.5rem;
                    transition: background 0.2s;
                }
                a:hover {
                    background: #2563eb;
                }
            `
}

/** Stylesheet of the 404, 401 and 403 pages. */
const STATUS_PAGE_CSS = stylesheet({
    paragraph: `
                    max-width: 28rem;`,
})

/** Stylesheet of the 500 page, which may carry an error-details block. */
const SERVER_ERROR_CSS = stylesheet({
    container: `
                    max-width: 48rem;`,
    extra: `
                .error-details {
                    margin-top: 2rem;
                    text-align: left;
                    background: #fef2f2;
                    border: 1px solid #fecaca;
                    border-radius: 0.5rem;
                    padding: 1rem;
                }
                .error-details h3 {
                    color: #991b1b;
                    margin-top: 0;
                    font-size: 1rem;
                }
                .error-details pre {
                    color: #b91c1c;
                    font-size: 0.875rem;
                    overflow: auto;
                    margin: 0;
                    white-space: pre-wrap;
                }`,
})

/**
 * Wrap page content in the shared HTML document. `css` is a module constant
 * and is the only value inserted unescaped; `title` and `content` go through
 * `html`'s escaping (content is already-escaped markup, so it passes as is).
 */
function page(title: string, css: string, content: Markup): Markup {
    return html`
        <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>${title}</title>
                <style>${raw(css)}</style>
            </head>
            <body>
                <div class="container">${content}<a href="/">Go Back Home</a></div>
            </body>
        </html>
    `
}

/** The 404 page. */
const notFoundPage = (): Markup =>
    page(
        '404 - Not Found',
        STATUS_PAGE_CSS,
        html`
            <h1>404</h1>
            <h2>Page Not Found</h2>
            <p>The page you are looking for doesn&#39;t exist or has been moved.</p>
        `,
    )

/** The 401 page. */
const unauthorizedPage = (): Markup =>
    page(
        '401 - Unauthorized',
        STATUS_PAGE_CSS,
        html`
            <h1>401</h1>
            <h2>Unauthorized</h2>
            <p>You need to be authenticated to access this resource.</p>
        `,
    )

/** The 403 page. */
const forbiddenPage = (): Markup =>
    page(
        '403 - Forbidden',
        STATUS_PAGE_CSS,
        html`
            <h1>403</h1>
            <h2>Access Forbidden</h2>
            <p>You don&#39;t have permission to access this resource.</p>
        `,
    )

/**
 * The 500 page. With `showDetails`, the error message and stack are rendered
 * in a `<pre>` — both escaped by `html`, since either can carry text a client
 * controls (a request value echoed into an exception message, for instance).
 */
const serverErrorPage = (error: Error, showDetails: boolean): Markup => {
    const trace = error.stack ? `\n\n${error.stack}` : ''
    const details = showDetails
        ? html`
            <div class="error-details">
                <h3>Error Details:</h3>
                <pre>${error.message}${trace}</pre>
            </div>
        `
        : ''
    return page(
        '500 - Server Error',
        SERVER_ERROR_CSS,
        html`
            <h1>500</h1>
            <h2>Something Went Wrong</h2>
            <p>An unexpected error occurred. Please try again later.</p>
            ${details}
        `,
    )
}

/**
 * The default error handler for Lockness: logs the error to the console and
 * answers with a self-contained HTML page for its status.
 *
 * The status comes from the error's `status` property (as set by
 * `HTTPException` and custom errors). 404, 401 and 403 get their own page;
 * every other status, including none, answers 500. The 500 page shows the
 * error message and stack only under an EXPLICIT development signal — see
 * {@link isExplicitlyDevelopment}: an unset or unreadable environment fails
 * closed, so a fresh deploy never leaks stack traces (H1, #165).
 *
 * To customise the pages, run `deno task cli make:error-pages` and register
 * the generated handler with `app.useErrorHandler(errorHandler)`, or place it
 * at `app/view/pages/errors/error_handler.tsx` for auto-discovery.
 *
 * @param error - The error that escaped the request pipeline.
 * @param c - The request context, used to read the path and build the response.
 * @returns The HTML error response.
 *
 * @example
 * ```ts
 * import { defaultErrorHandler, Hono } from '@lockness/core'
 *
 * const app = new Hono()
 * app.onError((err, c) => defaultErrorHandler(err, c))
 * ```
 */
export const defaultErrorHandler = (
    error: Error,
    c: Context,
): Response | Promise<Response> => {
    // Check for status property (from custom errors)
    const status = (error as unknown as { status?: number }).status || 500

    // Format and log the error
    formatErrorForConsole(error, status, c.req.path)

    // Return appropriate error page based on status
    switch (status) {
        case 404:
            return c.html(notFoundPage(), 404)
        case 401:
            return c.html(unauthorizedPage(), 401)
        case 403:
            return c.html(forbiddenPage(), 403)
        default: {
            // Show error details only under an EXPLICIT development signal.
            // `isExplicitlyDevelopment()` fails closed: an unset/ambiguous
            // environment (fresh deploy, or a compiled binary without
            // --allow-env) resolves to false, so stack traces never leak to
            // clients by default (H1, #165). Matches the devtools gate.
            const showDetails = isExplicitlyDevelopment()
            return c.html(serverErrorPage(error, showDetails), 500)
        }
    }
}
