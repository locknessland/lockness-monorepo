/**
 * @fileoverview The tracing middleware — a per-request child span (nested under
 * Deno's built-in HTTP server span) enriched with framework attributes, plus a
 * framework request counter.
 *
 * **No-ops cleanly when disabled.** When `OTEL_DENO` is unset, Deno installs no
 * provider and `@opentelemetry/api` returns its no-op tracer/meter — so
 * `startActiveSpan` runs the handler against a no-op span and nothing is
 * emitted, at negligible cost. The framework needs no `OTEL_DENO` check.
 *
 * @module @lockness/telemetry/middleware
 * @since 0.2.1
 */

import { metrics, SpanStatusCode, trace } from '@opentelemetry/api'
import type { Context, MiddlewareHandler, Next } from '@lockness/hono'
import { buildAttributes, toRecordedException } from './attributes.ts'

const TRACER_NAME = '@lockness/telemetry'

/**
 * Build the Lockness tracing middleware. Add it early in the global chain.
 *
 * @returns A Hono middleware that opens an enriched child span per request.
 *
 * @example
 * ```typescript
 * app.use(telemetryMiddleware())
 * ```
 */
export function telemetryMiddleware(): MiddlewareHandler {
    const tracer = trace.getTracer(TRACER_NAME)
    const meter = metrics.getMeter(TRACER_NAME)
    const requests = meter.createCounter('lockness.http.server.requests', {
        description: 'Requests handled, by matched route.',
    })

    return (c: Context, next: Next) => {
        const route = c.req.routePath ?? '(unmatched)'
        return tracer.startActiveSpan(
            `${c.req.method} ${route}`,
            async (span) => {
                try {
                    for (
                        const [key, value] of Object.entries(buildAttributes(c))
                    ) {
                        span.setAttribute(key, value)
                    }
                    await next()
                    span.setAttribute('http.response.status_code', c.res.status)
                    requests.add(1, { 'http.route': route })
                } catch (error) {
                    // Redacted: name + truncated message, never the stack (S4).
                    span.recordException(toRecordedException(error))
                    span.setStatus({ code: SpanStatusCode.ERROR })
                    throw error
                } finally {
                    span.end()
                }
            },
        )
    }
}
