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
import type { Session } from '@lockness/session'
import { collector } from './collector.ts'
import { DebugToolbar } from './components/toolbar.tsx'
import type { RequestInfo } from './types.ts'
import { devtoolsActive } from './gate.ts'
import { devtoolsRequestContext } from './request_context.ts'
import { redactSecrets, redactValue } from './redact.ts'

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
    return (c: Context, next: () => Promise<void>) => {
        // Fail closed: collect nothing unless devtools is explicitly active
        // (S1/S2). This guards the collection boundary even when the middleware
        // is wired directly, bypassing enableDevtools's mount gate.
        if (!devtoolsActive()) return next()

        const requestId = crypto.randomUUID()
        // Establish the per-request scope so passive collectors (the events
        // subscriber, which has no Context) can correlate what they capture to
        // this request (A4). `run` (not `enterWith`) confines the scope to this
        // request — enterWith would leak the requestId forward to events fired
        // after the response (§7/A4).
        return devtoolsRequestContext.run({ requestId }, async () => {
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
                // Redact at capture (asker — the sole decider is redact.ts).
                // headers/query are readonly, so redact in the literal, not by
                // reassignment. redactValue returns string values here (each
                // leaf is a string or REDACTED), so the narrowing cast is sound.
                headers: redactValue(
                    Object.fromEntries(c.req.raw.headers.entries()),
                ) as Record<string, string>,
                query: redactValue(
                    Object.fromEntries(
                        new URL(c.req.url).searchParams.entries(),
                    ),
                ) as Record<string, string>,
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
                        // Redact at capture. redactValue is total (never throws,
                        // depth- and cycle-bounded), so this runs safely even
                        // though the body block precedes `try { await next() }`.
                        const raw = await c.req.json().catch(() => null)
                        requestInfo.body = redactValue(raw)
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

                // Capture the session snapshot for the Sessions panel (S3: secret
                // values redacted at capture). Guarded — the session middleware may
                // not be installed for this request.
                try {
                    const session = c.get('session') as Session | undefined
                    if (session && typeof session.getId === 'function') {
                        const all = session.all()
                        const flashKeys = Object.keys(all).filter((k) =>
                            k.startsWith('_flash')
                        )
                        const flash: Record<string, unknown> = {}
                        for (const k of flashKeys) flash[k] = all[k]
                        const now = Date.now()
                        collector.updateSession({
                            id: session.getId(),
                            data: redactSecrets(all),
                            flash: redactSecrets(flash),
                            createdAt: now,
                            updatedAt: now,
                        })
                    }
                } catch (error) {
                    collector.addLog({
                        timestamp: Date.now(),
                        level: 'warn',
                        message: 'devtools: session capture skipped',
                        context: { requestId, error: (error as Error).message },
                    })
                }

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
                        const toolbarHtml = DebugToolbar({ requestId })
                            .toString()
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
        })
    }
}
