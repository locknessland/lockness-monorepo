/**
 * @fileoverview The span attribute allow-list — **names and shapes only**, never
 * resolved param values.
 *
 * A request's resolved path/query values carry secrets (this framework's own
 * signed-URL signatures and verify/reset tokens live in them — security S2), so
 * a span attribute is built from the matched route **pattern** (`/verify/:id`),
 * the HTTP method, and the response status — never `c.req.path` (resolved) or
 * any query value. Exceptions are redacted through `renderError` (S4).
 *
 * @module @lockness/telemetry/attributes
 * @since 0.2.1
 */

import { renderError } from '@lockness/contract'
import type { Context } from '@lockness/hono'

/** A span attribute value — a string or number, never an object or secret. */
export type AttributeValue = string | number

/**
 * Build the allow-listed span attributes for a request. Only the route
 * **pattern** and method are known before the handler runs; the status is added
 * after.
 *
 * @param c - The request context.
 * @returns Safe attributes — no resolved param values.
 *
 * @example
 * ```typescript
 * const attributes = buildAttributes(c) // { 'http.request.method', 'http.route' }
 * for (const [key, value] of Object.entries(attributes)) {
 *     span.setAttribute(key, value)
 * }
 * ```
 */
export function buildAttributes(c: Context): Record<string, AttributeValue> {
    // `routePath` is the matched PATTERN (`/verify/:id`); `c.req.path` is the
    // resolved value and must never become an attribute.
    const route = c.req.routePath ?? '(unmatched)'
    return {
        'http.request.method': c.req.method,
        'http.route': route,
    }
}

/**
 * Render a caught error into a **redacted** OTel exception — name + a truncated,
 * credential-free message, and **no stack trace** (a stack carries DSNs and
 * tokens to the trace backend, security S4 / confirms #261).
 *
 * @param error - The caught error.
 * @returns An OTel-compatible exception object with no stack.
 *
 * @example
 * ```typescript
 * span.recordException(toRecordedException(error))
 * ```
 */
export function toRecordedException(
    error: unknown,
): { name: string; message: string } {
    const name = error instanceof Error ? error.name : 'Error'
    return { name, message: renderError(error) }
}
