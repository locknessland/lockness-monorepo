/**
 * @fileoverview Lifecycle Events Middleware
 *
 * Internal middleware that emits lifecycle events for each HTTP request.
 * This middleware is automatically applied by the framework before user middlewares.
 *
 * Events emitted:
 * - RequestStarted: At the start of each request
 * - RequestCompleted: After the response is sent
 * - ExceptionOccurred: When an unhandled error occurs
 *
 * @module @lockness/core/http/lifecycle_middleware
 * @since 0.2.0
 */

import type { Context, MiddlewareHandler, Next } from 'hono'

/**
 * Generate a unique request ID
 * @internal
 */
function generateRequestId(): string {
    return crypto.randomUUID()
}

/**
 * Creates the lifecycle events middleware.
 *
 * This middleware wraps each request to emit lifecycle events that listeners
 * can subscribe to for logging, analytics, metrics collection, etc.
 *
 * @returns Hono middleware handler
 *
 * @example
 * ```typescript
 * // Applied automatically by the framework
 * app.use(createLifecycleMiddleware())
 * ```
 *
 * @internal
 */
export function createLifecycleMiddleware(): MiddlewareHandler {
    // Lazy load events module to avoid circular dependencies
    // deno-lint-ignore no-explicit-any
    let eventsModule: any = null
    let eventsLoaded = false

    return async (c: Context, next: Next) => {
        const startTime = performance.now()
        const requestId = generateRequestId()
        const method = c.req.method
        const path = c.req.path

        // Store requestId in context for access in controllers/listeners
        c.set('requestId', requestId)

        // Lazy load events module on first request
        if (!eventsLoaded) {
            try {
                eventsModule = await import('@lockness/events')
                eventsLoaded = true
            } catch {
                // Events package not available, skip lifecycle events
                eventsModule = null
                eventsLoaded = true
            }
        }

        if (!eventsModule) {
            await next()
            return
        }

        const {
            dispatcher,
            RequestStarted,
            RequestCompleted,
            ExceptionOccurred,
        } = eventsModule

        try {
            // Emit RequestStarted event
            await dispatcher().emit(
                new RequestStarted(c, method, path, requestId),
            )

            // Continue to next middleware/controller
            await next()

            // Calculate duration
            const duration = performance.now() - startTime
            const statusCode = c.res.status

            // Emit RequestCompleted event
            await dispatcher().emit(
                new RequestCompleted(
                    c,
                    path,
                    method,
                    statusCode,
                    duration,
                    c.get('controller'),
                    c.get('action'),
                ),
            )
        } catch (error) {
            // Emit ExceptionOccurred event
            await dispatcher().emit(
                new ExceptionOccurred(
                    c,
                    error instanceof Error ? error : new Error(String(error)),
                    path,
                    method,
                ),
            )

            // Re-throw to let error handler deal with it
            throw error
        }
    }
}
