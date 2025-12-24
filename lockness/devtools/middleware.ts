/** @jsx jsx */
/** @jsxImportSource hono/jsx */

/**
 * Devtools Middleware
 * Intercepts requests and collects debugging data
 */

import type { Context, MiddlewareHandler } from 'hono'
import { collector } from './collector.ts'
import { DebugToolbar } from './components/toolbar.tsx'
import type { RequestInfo } from './types.ts'

export function devtoolsMiddleware(showToolbar = true): MiddlewareHandler {
    return async (c: Context, next: () => Promise<void>) => {
        const requestId = crypto.randomUUID()
        const startTime = performance.now()

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
