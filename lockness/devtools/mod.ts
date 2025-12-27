/**
 * @lockness/devtools
 * Development debugging toolbar and dashboard
 *
 * @module
 * @example
 * ```typescript
 * import { enableDevtools } from '@lockness/devtools'
 *
 * // In your kernel.ts (dev mode only)
 * if (Deno.env.get('APP_ENV') === 'development') {
 *     enableDevtools(app)
 * }
 *
 * // Access dashboard at: http://localhost:8888/_devtools
 * ```
 */

import type { Hono } from 'hono'
import { devtoolsMiddleware } from './middleware.ts'
import { renderDashboard } from './dashboard.tsx'
import { collector } from './collector.ts'
import type { DevtoolsConfig, MailInfo, QueueJob, RouteInfo } from './types.ts'

export * from './types.ts'
export { collector } from './collector.ts'
export { devtoolsMiddleware } from './middleware.ts'

const DEFAULT_CONFIG: DevtoolsConfig = {
    enabled: true,
    basePath: '/_devtools',
    maxLogs: 1000,
    maxQueries: 500,
    maxRequests: 100,
    showDebugBar: Deno.env.get('DEBUG_BAR') !== 'false',
}

/**
 * Enable Lockness Devtools on your application
 * This adds the devtools middleware and registers the dashboard route
 *
 * @param app - Your Hono or Lockness App instance
 * @param config - Optional configuration
 *
 * @example
 * ```typescript
 * import { enableDevtools } from '@lockness/devtools'
 *
 * if (Deno.env.get('APP_ENV') === 'development') {
 *     enableDevtools(app.getHono())  // Before app.init()
 *     await app.init({ ... })
 *     collectAppRoutes(app)  // After app.init()
 * }
 * ```
 */
export function enableDevtools(
    app: Hono | { getHono: () => Hono },
    config: DevtoolsConfig = {},
) {
    const cfg = { ...DEFAULT_CONFIG, ...config }

    if (!cfg.enabled) {
        return
    }

    console.log(`[Devtools] Registering routes on basePath: ${cfg.basePath}`)

    // Extract Hono instance
    const honoApp = 'getHono' in app ? app.getHono() : app

    // Add middleware to collect data and inject toolbar
    honoApp.use('*', devtoolsMiddleware(cfg.showDebugBar))

    // Dashboard route
    honoApp.get(cfg.basePath!, (c) => {
        console.log(`[Devtools] Dashboard route hit!`)
        return renderDashboard(c)
    })

    // API endpoints
    honoApp.get(`${cfg.basePath}/api/data`, (c) => {
        return c.json(collector.getAllData())
    })

    honoApp.post(`${cfg.basePath}/clear`, (c) => {
        collector.clear()
        return c.json({ success: true })
    })

    console.log(`🔧 Devtools enabled at: ${cfg.basePath}`)
}

/**
 * Collect routes from your Lockness App instance
 * Call this AFTER app.init() to populate the Routes panel
 *
 * @param app - Your Lockness App instance
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
export function collectAppRoutes(app: { getRoutes: () => RouteInfo[] }) {
    const routes = app.getRoutes()
    if (routes.length > 0) {
        collector.setRoutes(routes)
        console.log(`[Devtools] Collected ${routes.length} routes`)
    }
}

/**
 * Manually collect routes from your application
 * This is useful to populate the Routes panel
 *
 * @param routes - Array of route information
 *
 * @example
 * ```typescript
 * import { collectRoutes } from '@lockness/devtools'
 *
 * collectRoutes([
 *     { method: 'GET', path: '/users', controller: 'UserController', action: 'index', middlewares: ['auth'] },
 *     { method: 'POST', path: '/users', controller: 'UserController', action: 'create', middlewares: [] },
 * ])
 * ```
 */
export function collectRoutes(routes: RouteInfo[]) {
    collector.setRoutes(routes)
}

/**
 * Manually log a message to devtools
 *
 * @param level - Log level (info, warn, error, debug)
 * @param message - Log message
 * @param context - Optional context data
 *
 * @example
 * ```typescript
 * import { log } from '@lockness/devtools'
 *
 * log('info', 'User logged in', { userId: 123 })
 * log('error', 'Database connection failed', { error: err.message })
 * ```
 */
export function log(
    level: 'info' | 'warn' | 'error' | 'debug',
    message: string,
    context?: Record<string, unknown>,
) {
    collector.addLog({
        timestamp: Date.now(),
        level,
        message,
        context,
    })
}

/**
 * Track a SQL query in devtools
 *
 * @param query - SQL query string
 * @param duration - Execution time in milliseconds
 * @param bindings - Optional query bindings
 *
 * @example
 * ```typescript
 * import { trackQuery } from '@lockness/devtools'
 *
 * const start = performance.now()
 * const result = await db.query('SELECT * FROM users WHERE id = ?', [123])
 * trackQuery('SELECT * FROM users WHERE id = ?', performance.now() - start, [123])
 * ```
 */
export function trackQuery(
    query: string,
    duration: number,
    bindings?: unknown[],
) {
    collector.addQuery({
        query,
        duration: Math.round(duration * 100) / 100,
        timestamp: Date.now(),
        bindings,
    })
}

/**
 * Track a background job in devtools
 *
 * @param job - Job information
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
 */
export function trackJob(job: QueueJob) {
    collector.addQueueJob(job)
}

/**
 * Track a sent email in devtools
 *
 * @param mail - Mail information
 *
 * @example
 * ```typescript
 * import { trackMail } from '@lockness/devtools'
 *
 * trackMail({
 *     to: 'user@example.com',
 *     subject: 'Welcome!',
 *     timestamp: Date.now(),
 *     driver: 'smtp',
 *     status: 'sent',
 * })
 * ```
 */
export function trackMail(mail: MailInfo) {
    collector.addMail(mail)
}
