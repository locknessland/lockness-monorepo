/**
 * @fileoverview Inertia.js middleware for the Lockness framework.
 *
 * This middleware implements the server-side Inertia protocol:
 * - Asset version checking with 409 Conflict responses
 * - Redirect status code conversion (302 → 303 for non-GET)
 * - Inertia instance injection into request context
 *
 * @module @lockness/inertia/middleware
 *
 * @example
 * ```typescript
 * import { App } from '@lockness/core'
 * import { inertiaMiddleware } from '@lockness/inertia'
 *
 * const app = new App()
 *
 * app.useMiddleware(
 *     inertiaMiddleware({
 *         version: '1.0.0',
 *     }),
 * )
 * ```
 *
 * @see https://inertiajs.com/the-protocol
 */

import type { Context, MiddlewareHandler, Next } from 'hono'
import type { InertiaConfig, RedirectConversionMethod } from './types.ts'
import { Inertia } from './inertia.ts'

/**
 * HTTP methods that require redirect status code conversion.
 *
 * Per the Inertia protocol, 302 redirects after PUT/PATCH/DELETE
 * should be converted to 303 See Other to ensure browsers use GET.
 *
 * @internal
 */
const REDIRECT_CONVERSION_METHODS: ReadonlySet<RedirectConversionMethod> =
    new Set(['PUT', 'PATCH', 'DELETE'])

/**
 * Check if the current request is an Inertia AJAX request.
 *
 * Inertia requests include the `X-Inertia: true` header to identify
 * themselves as AJAX navigation requests.
 *
 * @param c - The Hono context
 * @returns `true` if the request has `X-Inertia: true` header
 *
 * @internal
 */
function isInertiaRequest(c: Context): boolean {
    return c.req.header('X-Inertia') === 'true'
}

/**
 * Resolve the version from config (string or function).
 *
 * Supports both static version strings and dynamic version resolvers
 * that are evaluated on each request.
 *
 * @param version - Version string or resolver function
 * @returns The resolved version string
 *
 * @internal
 */
function resolveVersion(version: InertiaConfig['version']): string {
    if (typeof version === 'function') {
        return version()
    }
    return version ?? '1.0'
}

/**
 * Creates the Inertia.js middleware for handling the Inertia protocol.
 *
 * This middleware performs three key functions:
 *
 * 1. **Version Checking**: Compares client's `X-Inertia-Version` header
 *    with the server's version. On mismatch, returns 409 Conflict with
 *    `X-Inertia-Location` header to trigger a full page reload.
 *
 * 2. **Redirect Conversion**: Converts 302 Found to 303 See Other for
 *    PUT/PATCH/DELETE requests, ensuring browsers use GET for redirects.
 *
 * 3. **Context Injection**: Creates an `Inertia` instance and injects
 *    it into the request context for use in controllers.
 *
 * @param config - Configuration options for the middleware
 * @returns Hono middleware handler
 *
 * @example Basic usage
 * ```typescript
 * app.useMiddleware(
 *     inertiaMiddleware({
 *         version: '1.0.0',
 *     }),
 * )
 * ```
 *
 * @example Dynamic version
 * ```typescript
 * app.useMiddleware(
 *     inertiaMiddleware({
 *         version: () => Deno.env.get('BUILD_HASH') ?? '1.0.0',
 *     }),
 * )
 * ```
 *
 * @example With custom root view
 * ```typescript
 * app.useMiddleware(
 *     inertiaMiddleware({
 *         version: '1.0.0',
 *         rootView: (page) => `
 *             <!DOCTYPE html>
 *             <html>
 *                 <body>
 *                     <div id="app" data-page='${JSON.stringify(page)}'></div>
 *                     <script src="/js/app.js"></script>
 *                 </body>
 *             </html>
 *         `,
 *     }),
 * )
 * ```
 *
 * @see https://inertiajs.com/the-protocol
 */
export function inertiaMiddleware(
    config: InertiaConfig = {},
): MiddlewareHandler {
    return async (c: Context, next: Next): Promise<Response | void> => {
        // Resolve current version (supports static strings and functions)
        const currentVersion = resolveVersion(config.version)

        // Check version mismatch for Inertia requests
        if (isInertiaRequest(c)) {
            const clientVersion = c.req.header('X-Inertia-Version')

            if (clientVersion && clientVersion !== currentVersion) {
                // Version mismatch - return 409 to trigger full page reload
                // The X-Inertia-Location header tells the client where to reload
                return new Response(null, {
                    status: 409,
                    headers: {
                        'X-Inertia-Location': c.req.url,
                    },
                })
            }
        }

        // Create and inject Inertia instance into context
        const inertia = new Inertia(c, {
            version: currentVersion,
            rootView: config.rootView,
        })
        c.set('inertia', inertia)

        // Continue to next middleware/handler
        await next()

        // Convert 302 to 303 for PUT/PATCH/DELETE requests
        // This ensures browsers use GET for the redirect target
        const method = c.req.method as RedirectConversionMethod
        if (
            isInertiaRequest(c) &&
            c.res.status === 302 &&
            REDIRECT_CONVERSION_METHODS.has(method)
        ) {
            c.res = new Response(null, {
                status: 303,
                headers: c.res.headers,
            })
        }
    }
}
