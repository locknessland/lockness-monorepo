/**
 * @fileoverview Framework Lifecycle Events.
 *
 * Events emitted by the framework at critical execution points.
 * These events allow packages and user code to hook into the framework lifecycle.
 *
 * @module @lockness/events/kernel_events
 */

import { BaseEvent } from './base_event.ts'
import type { Context } from '@lockness/hono'

/**
 * Emitted when the application kernel has finished bootstrapping.
 *
 * Use this event for initialization tasks like:
 * - Cache warming
 * - Plugin initialization
 * - Database connection verification
 *
 * @example
 * ```typescript
 * @Service()
 * export class CacheWarmer {
 *     @Listener(KernelBooted)
 *     async warmCache(event: KernelBooted) {
 *         await this.cache.warmup()
 *     }
 * }
 * ```
 */
export class KernelBooted extends BaseEvent {
    constructor(
        public readonly appName: string,
        public readonly environment: string,
    ) {
        super()
    }
}

/**
 * Emitted at the start of each HTTP request, before any middleware.
 *
 * Use this event for:
 * - Request logging
 * - Analytics
 * - Custom request preparation
 *
 * @example
 * ```typescript
 * @Service()
 * export class RequestLogger {
 *     @Listener(RequestStarted)
 *     logRequest(event: RequestStarted) {
 *         console.log(`[${event.method}] ${event.path}`)
 *     }
 * }
 * ```
 */
export class RequestStarted extends BaseEvent {
    constructor(
        public readonly context: Context,
        public readonly method: string,
        public readonly path: string,
        public readonly requestId: string,
    ) {
        super()
    }
}

/**
 * Emitted just before a controller action is executed.
 *
 * Use this event for:
 * - Controller-specific logging
 * - Argument modification
 * - Additional authorization checks
 *
 * @example
 * ```typescript
 * @Service()
 * export class ControllerLogger {
 *     @Listener(ControllerExecuting)
 *     logController(event: ControllerExecuting) {
 *         console.log(`Executing: ${event.controller}.${event.action}`)
 *     }
 * }
 * ```
 */
export class ControllerExecuting extends BaseEvent {
    constructor(
        public readonly context: Context,
        public readonly controller: string,
        public readonly action: string,
    ) {
        super()
    }
}

/**
 * Emitted after a controller action has completed and returned a response.
 *
 * Use this event for:
 * - Response modification
 * - Header injection
 * - Response logging
 *
 * @example
 * ```typescript
 * @Service()
 * export class ResponseLogger {
 *     @Listener(ResponsePrepared)
 *     logResponse(event: ResponsePrepared) {
 *         console.log(`Response: ${event.statusCode}`)
 *     }
 * }
 * ```
 */
export class ResponsePrepared extends BaseEvent {
    constructor(
        public readonly context: Context,
        public readonly statusCode: number,
    ) {
        super()
    }
}

/**
 * Emitted after the response has been sent to the client.
 *
 * Use this event for:
 * - Post-request cleanup
 * - Background task triggering (emails, notifications)
 * - Final request metrics
 *
 * @example
 * ```typescript
 * @Service()
 * export class MetricsCollector {
 *     @Listener(RequestCompleted)
 *     async collectMetrics(event: RequestCompleted) {
 *         await this.metrics.record({
 *             path: event.path,
 *             duration: event.duration,
 *             statusCode: event.statusCode
 *         })
 *     }
 * }
 * ```
 */
export class RequestCompleted extends BaseEvent {
    constructor(
        public readonly context: Context,
        public readonly path: string,
        public readonly method: string,
        public readonly statusCode: number,
        public readonly duration: number,
        public readonly controller?: string,
        public readonly action?: string,
    ) {
        super()
    }
}

/**
 * Emitted when an unhandled exception occurs during request processing.
 *
 * Use this event for:
 * - Error logging
 * - Error reporting (Sentry, etc.)
 * - Custom error formatting
 * - Error alerts
 *
 * @example
 * ```typescript
 * @Service()
 * export class ErrorReporter {
 *     @Listener(ExceptionOccurred)
 *     async reportError(event: ExceptionOccurred) {
 *         if (event.error.name !== 'HttpException') {
 *             await Sentry.captureException(event.error)
 *         }
 *     }
 * }
 * ```
 */
export class ExceptionOccurred extends BaseEvent {
    constructor(
        public readonly context: Context,
        public readonly error: Error,
        public readonly path: string,
        public readonly method: string,
    ) {
        super()
    }
}

/**
 * Emitted when the application is shutting down.
 *
 * Use this event for:
 * - Graceful connection closure
 * - Resource cleanup
 * - Final data persistence
 *
 * @example
 * ```typescript
 * @Service()
 * export class DatabaseService {
 *     @Listener(KernelTerminating)
 *     async closeConnections(event: KernelTerminating) {
 *         await this.db.close()
 *         console.log('Database connections closed')
 *     }
 * }
 * ```
 */
export class KernelTerminating extends BaseEvent {
    constructor(
        public readonly reason: string,
    ) {
        super()
    }
}
