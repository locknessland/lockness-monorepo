/**
 * @fileoverview Devtools middleware for request interception.
 *
 * This middleware intercepts all HTTP requests to collect debugging data
 * such as request/response info, timing, and rendered components. It also
 * injects the debug toolbar into HTML responses.
 *
 * @module @lockness/devtools/middleware
 *
 * @example
 * ```typescript
 * import { devtoolsMiddleware } from '@lockness/devtools'
 *
 * app.use('*', devtoolsMiddleware(true))
 * ```
 */

import type { Context, MiddlewareHandler } from 'hono'
import { collector } from './collector.ts'
import { DebugToolbar } from './components/toolbar.tsx'
import type { RequestInfo } from './types.ts'

// =============================================================================
// Route Matching
// =============================================================================

/**
 * Matches a route pattern against a request path.
 *
 * Supports dynamic segments like `:id` which match any value.
 *
 * @param pattern - The route pattern (e.g., '/users/:id')
 * @param path - The actual request path (e.g., '/users/123')
 * @returns True if the pattern matches the path
 *
 * @example
 * ```typescript
 * matchRoutePattern('/users/:id', '/users/123') // true
 * matchRoutePattern('/users/:id', '/posts/123') // false
 * ```
 *
 * @internal
 */
function matchRoutePattern(pattern: string, path: string): boolean {
    const patternParts = pattern.split('/')
    const pathParts = path.split('/')

    if (patternParts.length !== pathParts.length) {
        return false
    }

    return patternParts.every((part, i) => {
        return part.startsWith(':') || part === pathParts[i]
    })
}

// =============================================================================
// Middleware
// =============================================================================

/**
 * Creates the devtools middleware for request interception.
 *
 * This middleware:
 * - Tracks request timing and metadata
 * - Captures rendered component information
 * - Logs request/response details
 * - Records performance metrics
 * - Injects the debug toolbar into HTML responses
 *
 * @param showToolbar - Whether to inject the debug toolbar into HTML responses
 * @returns A Hono middleware handler
 *
 * @example
 * ```typescript
 * import { devtoolsMiddleware } from '@lockness/devtools'
 *
 * // Add to all routes
 * app.use('*', devtoolsMiddleware())
 *
 * // Or disable toolbar injection
 * app.use('*', devtoolsMiddleware(false))
 * ```
 */
export function devtoolsMiddleware(showToolbar = true): MiddlewareHandler {
    return async (c: Context, next: () => Promise<void>) => {
        const requestId = crypto.randomUUID()
        const startTime = performance.now()

        let capturedComponent: string | undefined

        // Helper to extract component name
        // deno-lint-ignore no-explicit-any
        const captureComponent = (content: any) => {
            if (content && typeof content === 'object') {
                if (content.type) {
                    let name = ''
                    if (typeof content.type === 'function') {
                        name = content.type.name
                    } else if (typeof content.type === 'string') {
                        name = content.type
                    }

                    if (name) {
                        const fileName = collector.getComponentFile(name)
                        capturedComponent = `<${name} ${
                            fileName ? `_source="${fileName}"` : ''
                        }/>`
                    }
                }
            }
        }

        // Intercept c.html()
        const originalHtml = c.html.bind(c)
        // deno-lint-ignore no-explicit-any
        c.html = function (content: any, init?: any) {
            captureComponent(content)
            return originalHtml(content, init)
        } as typeof c.html

        // Intercept c.render() if available (from jsxRenderer)
        // deno-lint-ignore no-explicit-any
        if (typeof (c as any).render === 'function') {
            // deno-lint-ignore no-explicit-any
            const originalRender = (c as any).render.bind(c) // deno-lint-ignore no-explicit-any
            ;(c as any).render = function (content: any, ...args: any[]) {
                captureComponent(content)
                return originalRender(content, ...args)
            }
        }

        // Collect request info
        const requestInfo: RequestInfo = {
            id: requestId,
            method: c.req.method,
            path: c.req.path,
            timestamp: Date.now(),
            headers: Object.fromEntries(c.req.raw.headers.entries()),
            query: Object.fromEntries(
                new URL(c.req.url).searchParams.entries(),
            ),
        }

        // Try to match route to get controller info
        const routes = collector.getRoutes()
        const matchedRoute = routes.find(
            (route) =>
                route.method === c.req.method &&
                (route.path === c.req.path ||
                    matchRoutePattern(route.path, c.req.path)),
        )
        if (matchedRoute) {
            requestInfo.controller = matchedRoute.controller
            requestInfo.action = matchedRoute.action
            requestInfo.routeName = matchedRoute.name
        }

        // Try to get body for POST/PUT/PATCH
        if (['POST', 'PUT', 'PATCH'].includes(c.req.method)) {
            try {
                const contentType = c.req.header('content-type')
                if (contentType?.includes('application/json')) {
                    requestInfo.body = await c.req.json().catch(() => null)
                }
            } catch {
                // Ignore body parsing errors
            }
        }

        collector.addRequest(requestInfo)

        // Log request
        collector.addLog({
            timestamp: Date.now(),
            level: 'info',
            message: `${c.req.method} ${c.req.path}`,
            context: { requestId },
        })

        try {
            await next()

            // Update request with response info
            const duration = performance.now() - startTime
            collector.updateRequest(requestId, {
                duration: Math.round(duration * 100) / 100,
                statusCode: c.res.status,
                component: capturedComponent,
            })

            // Performance metric
            collector.addPerformanceMetric({
                name: `${c.req.method} ${c.req.path}`,
                duration: Math.round(duration * 100) / 100,
                timestamp: Date.now(),
                type: 'route',
            })

            // Inject debug toolbar into HTML responses
            if (
                showToolbar &&
                c.res.headers.get('content-type')?.includes('text/html') &&
                !c.req.path.startsWith('/_devtools')
            ) {
                const clonedResponse = c.res.clone()
                const originalBody = await clonedResponse.text()

                // Skip if already has toolbar
                if (!originalBody.includes('lockness-debug-toolbar')) {
                    const toolbarHtml = DebugToolbar({ requestId }).toString()
                    const modifiedBody = originalBody.replace(
                        '</body>',
                        `${toolbarHtml}</body>`,
                    )

                    // Replace the response
                    c.res = new Response(modifiedBody, {
                        status: c.res.status,
                        headers: c.res.headers,
                    })
                }
            }
        } catch (error) {
            const duration = performance.now() - startTime
            collector.updateRequest(requestId, {
                duration: Math.round(duration * 100) / 100,
                statusCode: 500,
            })

            collector.addLog({
                timestamp: Date.now(),
                level: 'error',
                message: (error as Error).message,
                context: {
                    requestId,
                    stack: (error as Error).stack,
                },
            })

            throw error
        }
    }
}
