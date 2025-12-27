/** @jsx jsx */
/** @jsxImportSource @lockness/core */

/**
 * Devtools Middleware
 * Intercepts requests and collects debugging data
 */

import type { Context, MiddlewareHandler } from 'hono'
import { collector } from './collector.ts'
import { DebugToolbar } from './components/toolbar.tsx'
import type { RequestInfo } from './types.ts'

/**
 * Simple route pattern matcher for dynamic routes
 * Matches patterns like /users/:id with /users/123
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

export function devtoolsMiddleware(showToolbar = true): MiddlewareHandler {
    return async (c: Context, next: () => Promise<void>) => {
        const requestId = crypto.randomUUID()
        const startTime = performance.now()

        // Intercept c.html() to capture component name
        const originalHtml = c.html.bind(c)
        let capturedComponent: string | undefined

        // deno-lint-ignore no-explicit-any
        c.html = function (content: any, init?: any) {
            // Try to extract component name from the JSX element
            if (content && typeof content === 'object') {
                // Check if it's a JSX element with a type property
                if (content.type) {
                    if (typeof content.type === 'function') {
                        capturedComponent = content.type.name
                    } else if (typeof content.type === 'string') {
                        capturedComponent = content.type
                    }
                }
            }
            return originalHtml(content, init)
        } as typeof c.html

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
