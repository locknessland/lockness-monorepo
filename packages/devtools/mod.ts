/**
 * @fileoverview Lockness Devtools - Development debugging toolbar and dashboard.
 *
 * Provides a comprehensive debugging experience for Lockness applications with:
 * - Real-time request/response tracking
 * - SQL query monitoring
 * - Log aggregation
 * - Route inspection
 * - Performance metrics
 * - Deprecation notice tracking
 * - Component tree visualization
 *
 * @module @lockness/devtools
 *
 * @example Basic setup
 * ```typescript
 * import { enableDevtools, collectAppRoutes } from '@lockness/devtools'
 * import { isDevelopment } from '@lockness/core'
 *
 * // In your kernel.ts (dev mode only)
 * if (isDevelopment()) {
 *     enableDevtools(app.getHono())  // Before app.init()
 *     await app.init({ ... })
 *     collectAppRoutes(app)  // After app.init()
 * }
 *
 * // Access dashboard at: http://localhost:8888/_devtools
 * ```
 *
 * @example Manual tracking
 * ```typescript
 * import { log, trackQuery, trackJob } from '@lockness/devtools'
 *
 * // Log a message
 * log('info', 'User logged in', { userId: 123 })
 *
 * // Track a database query
 * trackQuery('SELECT * FROM users', 2.5, [])
 *
 * // Track a background job
 * trackJob({ id: '123', name: 'SendEmail', status: 'completed', attempts: 1, timestamp: Date.now() })
 * ```
 */

import type { Hono, MiddlewareHandler } from '@lockness/hono'
import { dispatcher } from '@lockness/events'
import { devtoolsMiddleware } from './middleware.ts'
import { renderDashboard } from './dashboard.tsx'
import { collector } from './collector.ts'
import { authorizeDevtools, devtoolsActive } from './gate.ts'
import { currentRequestId } from './request_context.ts'
import type { DevtoolsConfig, MailInfo, QueueJob, RouteInfo } from './types.ts'
import { ComponentDependencyAnalyzer } from './utils/component_dependency_analyzer.ts'

export * from './types.ts'
export { collector } from './collector.ts'
export { devtoolsMiddleware } from './middleware.ts'
export { ComponentDependencyAnalyzer } from './utils/component_dependency_analyzer.ts'

// Global analyzer instance for component tree building
let componentAnalyzer: ComponentDependencyAnalyzer | null = null

/**
 * Default configuration for devtools.
 *
 * Covers only the operational fields. The authorization fields (`token`,
 * `authorize`) have no default — an absent one means "not configured", which the
 * gate resolves to the env var / loopback posture — so they are excluded here.
 * @internal
 */
const DEFAULT_CONFIG: Required<Omit<DevtoolsConfig, 'token' | 'authorize'>> = {
    enabled: true,
    basePath: '/_devtools',
    maxLogs: 1000,
    maxQueries: 500,
    maxRequests: 100,
    showDebugBar: Deno.env.get('DEBUG_BAR') !== 'false',
} as const

// =============================================================================
// Types
// =============================================================================

/**
 * Interface for apps that provide a Hono instance.
 */
interface HonoProvider {
    /** Get the underlying Hono application instance */
    getHono(): Hono
}

/**
 * Interface for apps that expose route information.
 */
interface RouteProvider {
    /** Get all registered routes */
    getRoutes(): RouteInfo[]
}

// =============================================================================
// Setup Functions
// =============================================================================

// =============================================================================
// Setup Functions
// =============================================================================

/**
 * Enable Lockness Devtools on your application.
 *
 * This function:
 * - Adds the devtools middleware to intercept requests
 * - Registers the dashboard route
 * - Sets up API endpoints for data retrieval
 * - Starts component scanning for tree visualization
 *
 * @param app - Your Hono or Lockness App instance
 * @param config - Optional configuration options
 *
 * @example Basic usage
 * ```typescript
 * import { enableDevtools } from '@lockness/devtools'
 * import { isDevelopment } from '@lockness/core'
 *
 * if (isDevelopment()) {
 *     enableDevtools(app.getHono())  // Before app.init()
 *     await app.init({ ... })
 *     collectAppRoutes(app)  // After app.init()
 * }
 * ```
 *
 * @example With custom configuration
 * ```typescript
 * enableDevtools(app.getHono(), {
 *     basePath: '/_debug',
 *     maxRequests: 200,
 *     showDebugBar: false,
 * })
 * ```
 */
/** Guards the single global `onAny` subscription (A6). */
let eventsWired = false

/**
 * Subscribe the collector to every dispatched event, exactly once.
 *
 * `dispatcher()` is a process-global singleton and `enableDevtools` may be
 * called more than once (boot step + a manual call), so a module-scope flag
 * keeps this to a single subscription — a second would double-capture. Each
 * event is tagged with the current request's id (undefined outside a request),
 * and carries the listeners **registered** for it at capture time (A3).
 */
function wireEventCapture(): void {
    if (eventsWired) return
    eventsWired = true
    const emitter = dispatcher().getEmitter()
    dispatcher().onAny((payload: { event: string; data: unknown }) => {
        collector.addEvent({
            eventName: payload.event,
            listenerCount: emitter.listenerCount(payload.event),
            timestamp: Date.now(),
            requestId: currentRequestId(),
        })
    })
}

export function enableDevtools(
    app: Hono | HonoProvider,
    config: DevtoolsConfig = {},
): void {
    const cfg:
        & Required<Omit<DevtoolsConfig, 'token' | 'authorize'>>
        & Pick<DevtoolsConfig, 'token' | 'authorize'> = {
            ...DEFAULT_CONFIG,
            ...config,
        }

    // Fail closed: mount only when devtools is explicitly active (S1). A bare
    // `isProduction()`/`isDevelopment()` check would fail open on a no-env or
    // compiled-without-`--allow-env` production deploy (the env name defaults to
    // development); `devtoolsActive()` requires an explicit dev signal.
    if (!cfg.enabled || !devtoolsActive()) {
        return
    }

    // Capture every dispatched event, once (A6).
    wireEventCapture()

    // Start component scanning with dependency analysis
    const analyzer = new ComponentDependencyAnalyzer()
    analyzer.scan().then(() => {
        // Store analyzer globally for tree building
        componentAnalyzer = analyzer
        // Set component map for backward compatibility
        collector.setComponentMap(analyzer.getComponentMap())
    })

    // Extract Hono instance
    const honoApp = 'getHono' in app ? app.getHono() : app

    // Add middleware to collect data and inject toolbar
    honoApp.use('*', devtoolsMiddleware(cfg.showDebugBar))

    // Gate every collector-facing route behind authorization (#161). The gate is
    // applied as **per-route middleware** on each collector route rather than via
    // a `use('${basePath}/*')` wildcard: mounted under a constrained i18n mount
    // pattern, that wildcard `use` corrupts Hono 4.11.1's RegExpRouter route table
    // (`undefined is not iterable` at build), breaking dev-mode boot entirely
    // (#54 follow-up). Per-route application covers exactly the same collector
    // routes without the wildcard. The single decider lives in gate.ts; here we
    // only *ask* and emit the one denial shape — a `401` with an empty body.
    const gate: MiddlewareHandler = async (c, next) => {
        if (!(await authorizeDevtools(c, cfg))) {
            return c.body(null, 401)
        }
        await next()
    }

    // Dashboard route
    honoApp.get(cfg.basePath, gate, (c) => {
        return renderDashboard(c)
    })

    // API endpoints
    honoApp.get(`${cfg.basePath}/api/data`, gate, (c) => {
        return c.json(collector.getAllData())
    })

    // New endpoint: get component tree for a component
    honoApp.get(`${cfg.basePath}/api/component-tree/:name`, gate, (c) => {
        const componentName = c.req.param('name')
        if (!componentAnalyzer) {
            return c.json({ error: 'Analyzer not ready' }, 503)
        }
        const tree = componentAnalyzer.buildTree(componentName)
        return c.json(tree)
    })

    honoApp.post(`${cfg.basePath}/clear`, gate, (c) => {
        collector.clear()
        return c.json({ success: true })
    })

    console.log(`🔧 Devtools enabled at: ${cfg.basePath}`)
}

// =============================================================================
// Route Collection
// =============================================================================

/**
 * Collect routes from your Lockness App instance.
 *
 * Call this **after** `app.init()` to populate the Routes panel with
 * all registered application routes.
 *
 * @param app - Your Lockness App instance (must have `getRoutes` method)
 *
 * @example
 * ```typescript
 * import { enableDevtools, collectAppRoutes } from '@lockness/devtools'
 *
 * enableDevtools(app.getHono())  // Before app.init()
 * await app.init({ ... })
 * collectAppRoutes(app)  // After app.init()
 * ```
 */
export function collectAppRoutes(app: RouteProvider): void {
    const routes = app.getRoutes()
    if (routes.length > 0) {
        collector.setRoutes(routes)
    }
}

/**
 * Manually register routes with the devtools collector.
 *
 * This is useful when your application doesn't implement `getRoutes()`
 * or when you need to provide custom route information.
 *
 * @param routes - Array of route information objects
 *
 * @example
 * ```typescript
 * import { collectRoutes } from '@lockness/devtools'
 *
 * collectRoutes([
 *     {
 *         method: 'GET',
 *         path: '/users',
 *         controller: 'UserController',
 *         action: 'index',
 *         middlewares: ['auth'],
 *     },
 *     {
 *         method: 'POST',
 *         path: '/users',
 *         controller: 'UserController',
 *         action: 'create',
 *         middlewares: [],
 *     },
 * ])
 * ```
 */
export function collectRoutes(routes: RouteInfo[]): void {
    collector.setRoutes(routes)
}

// =============================================================================
// Manual Tracking Functions
// =============================================================================

/**
 * Log a message to the devtools collector.
 *
 * These logs appear in the devtools dashboard Logs panel.
 *
 * @param level - The log severity level
 * @param message - The log message
 * @param context - Optional contextual data to attach
 *
 * @example
 * ```typescript
 * import { log } from '@lockness/devtools'
 *
 * log('info', 'User logged in', { userId: 123, email: 'user@example.com' })
 * log('error', 'Database connection failed', { host: 'db.example.com' })
 * log('debug', 'Processing request', { requestId: 'abc-123' })
 * ```
 */
export function log(
    level: 'info' | 'warn' | 'error' | 'debug',
    message: string,
    context?: Record<string, unknown>,
): void {
    collector.addLog({
        timestamp: Date.now(),
        level,
        message,
        context,
    })
}

/**
 * Track a SQL query in the devtools collector.
 *
 * These queries appear in the devtools dashboard Queries panel.
 * Use this to integrate with your ORM or database driver.
 *
 * @param query - The SQL query string
 * @param duration - Query execution time in milliseconds
 * @param bindings - Optional parameter bindings for prepared statements
 *
 * @example
 * ```typescript
 * import { trackQuery } from '@lockness/devtools'
 *
 * const start = performance.now()
 * const result = await db.query('SELECT * FROM users WHERE id = ?', [123])
 * trackQuery('SELECT * FROM users WHERE id = ?', performance.now() - start, [123])
 * ```
 *
 * @example With ORM integration
 * ```typescript
 * db.on('query', (event) => {
 *     trackQuery(event.sql, event.duration, event.bindings)
 * })
 * ```
 */
export function trackQuery(
    query: string,
    duration: number,
    bindings?: unknown[],
): void {
    collector.addQuery({
        query,
        duration: Math.round(duration * 100) / 100,
        timestamp: Date.now(),
        bindings,
    })
}

/**
 * Track a background job in the devtools collector.
 *
 * These jobs appear in the devtools dashboard Queue panel.
 * Use this to integrate with your queue driver.
 *
 * @param job - The job information
 *
 * @example
 * ```typescript
 * import { trackJob } from '@lockness/devtools'
 *
 * trackJob({
 *     id: crypto.randomUUID(),
 *     name: 'SendWelcomeEmail',
 *     status: 'completed',
 *     attempts: 1,
 *     timestamp: Date.now(),
 * })
 * ```
 *
 * @example With queue integration
 * ```typescript
 * queue.on('job:completed', (job) => {
 *     trackJob({
 *         id: job.id,
 *         name: job.name,
 *         status: 'completed',
 *         attempts: job.attempts,
 *         timestamp: Date.now(),
 *     })
 * })
 * ```
 */
export function trackJob(job: QueueJob): void {
    collector.addQueueJob(job)
}

/**
 * Track a sent email in the devtools collector.
 *
 * These emails appear in the devtools dashboard Mail panel.
 * Use this to integrate with your mail driver.
 *
 * @param mail - The mail information
 *
 * @example
 * ```typescript
 * import { trackMail } from '@lockness/devtools'
 *
 * trackMail({
 *     to: 'user@example.com',
 *     subject: 'Welcome to our app!',
 *     timestamp: Date.now(),
 *     driver: 'smtp',
 *     status: 'sent',
 * })
 * ```
 *
 * @example With mailer integration
 * ```typescript
 * mailer.on('sent', (result) => {
 *     trackMail({
 *         to: result.to,
 *         subject: result.subject,
 *         timestamp: Date.now(),
 *         driver: result.driver,
 *         status: result.success ? 'sent' : 'failed',
 *     })
 * })
 * ```
 */
export function trackMail(mail: MailInfo): void {
    collector.addMail(mail)
}
