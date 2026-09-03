/**
 * @fileoverview Type definitions for Lockness Devtools.
 *
 * Provides interfaces for all data structures collected and displayed
 * by the devtools dashboard, including routes, logs, queries, requests,
 * sessions, queue jobs, mail, performance metrics, and deprecations.
 *
 * @module @lockness/devtools/types
 */

import type { Context } from '@lockness/hono'

// =============================================================================
// HTTP Method Types
// =============================================================================

/**
 * Standard HTTP methods supported by the devtools.
 */
export type HttpMethod =
    | 'GET'
    | 'POST'
    | 'PUT'
    | 'PATCH'
    | 'DELETE'
    | 'HEAD'
    | 'OPTIONS'

/**
 * Log severity levels.
 */
export type LogLevel = 'info' | 'warn' | 'error' | 'debug'

/**
 * Queue job status values.
 */
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed'

/**
 * Mail delivery status values.
 */
export type MailStatus = 'sent' | 'failed'

/**
 * Performance metric type categories.
 */
export type MetricType = 'route' | 'database' | 'middleware' | 'other'

// =============================================================================
// Route Types
// =============================================================================

/**
 * Information about a registered route.
 *
 * Collected from the application's router to display in the Routes panel.
 *
 * @example
 * ```typescript
 * const route: RouteInfo = {
 *     method: 'GET',
 *     path: '/users/:id',
 *     name: 'users.show',
 *     controller: 'UserController',
 *     action: 'show',
 *     middlewares: ['auth', 'verified'],
 * }
 * ```
 */
export interface RouteInfo {
    /** The HTTP method (GET, POST, PUT, etc.) */
    readonly method: string
    /** The route path pattern (e.g., '/users/:id') */
    readonly path: string
    /** Optional named route identifier */
    readonly name?: string
    /** The controller class name handling this route */
    readonly controller?: string
    /** The controller method/action name */
    readonly action?: string
    /** List of middleware names applied to this route */
    readonly middlewares: string[]
}

// =============================================================================
// Logging Types
// =============================================================================

/**
 * A log entry captured by the devtools.
 *
 * @example
 * ```typescript
 * const log: LogEntry = {
 *     timestamp: Date.now(),
 *     level: 'info',
 *     message: 'User logged in successfully',
 *     context: { userId: 123 },
 * }
 * ```
 */
export interface LogEntry {
    /** Unix timestamp when the log was created */
    readonly timestamp: number
    /** The severity level of the log */
    readonly level: LogLevel
    /** The log message */
    readonly message: string
    /** Optional contextual data attached to the log */
    readonly context?: Record<string, unknown>
}

// =============================================================================
// Database Types
// =============================================================================

/**
 * A SQL query tracked by the devtools.
 *
 * @example
 * ```typescript
 * const query: SQLQuery = {
 *     query: 'SELECT * FROM users WHERE id = ?',
 *     duration: 2.5,
 *     timestamp: Date.now(),
 *     bindings: [123],
 * }
 * ```
 */
export interface SQLQuery {
    /** The SQL query string */
    readonly query: string
    /** Query execution time in milliseconds */
    readonly duration: number
    /** Unix timestamp when the query was executed */
    readonly timestamp: number
    /** Optional parameter bindings for prepared statements */
    readonly bindings?: unknown[]
}

// =============================================================================
// Component Types
// =============================================================================

/**
 * A node in the component dependency tree.
 *
 * Used to visualize component hierarchies in the dashboard.
 *
 * @example
 * ```typescript
 * const tree: ComponentNode = {
 *     name: 'UserProfile',
 *     file: 'app/view/pages/UserProfile.tsx',
 *     props: ['user', 'isEditing'],
 *     children: [
 *         { name: 'Avatar', children: [] },
 *         { name: 'UserForm', children: [] },
 *     ],
 * }
 * ```
 */
export interface ComponentNode {
    /** The component name */
    readonly name: string
    /** The source file path (relative to project root) */
    readonly file?: string
    /** List of prop names accepted by the component */
    readonly props?: string[]
    /** Child components used by this component */
    readonly children: ComponentNode[]
}

// =============================================================================
// Request Types
// =============================================================================

/**
 * Detailed information about an HTTP request.
 *
 * Captured by the devtools middleware for display in the Requests panel.
 *
 * @example
 * ```typescript
 * const request: RequestInfo = {
 *     id: 'abc-123',
 *     method: 'POST',
 *     path: '/api/users',
 *     timestamp: Date.now(),
 *     duration: 45.2,
 *     statusCode: 201,
 *     headers: { 'content-type': 'application/json' },
 *     query: {},
 *     controller: 'UserController',
 *     action: 'create',
 * }
 * ```
 */
export interface RequestInfo {
    /** Unique identifier for this request */
    readonly id: string
    /** The HTTP method */
    readonly method: string
    /** The request path */
    readonly path: string
    /** Unix timestamp when the request was received */
    readonly timestamp: number
    /** Request duration in milliseconds (set after response) */
    duration?: number
    /** HTTP status code of the response */
    statusCode?: number
    /** Request headers */
    readonly headers: Record<string, string>
    /** Query string parameters */
    readonly query: Record<string, string>
    /** Request body (for POST/PUT/PATCH) */
    body?: unknown
    /** Controller class name handling this request */
    controller?: string
    /** Controller action/method name */
    action?: string
    /** Named route identifier */
    routeName?: string
    /** Root component rendered for this request */
    component?: string
    /** Component dependency tree */
    componentTree?: ComponentNode[]
}

// =============================================================================
// Session Types
// =============================================================================

/**
 * Session data stored in the devtools.
 *
 * @example
 * ```typescript
 * const session: SessionData = {
 *     id: 'session-abc',
 *     data: { userId: 123, role: 'admin' },
 *     createdAt: Date.now(),
 *     updatedAt: Date.now(),
 * }
 * ```
 */
export interface SessionData {
    /** Unique session identifier */
    readonly id: string
    /** Session data key-value pairs (secret-looking values redacted at capture) */
    readonly data: Record<string, unknown>
    /** Flash messages present on the session (redacted at capture) */
    readonly flash?: Record<string, unknown>
    /** Unix timestamp when the session was created */
    readonly createdAt: number
    /** Unix timestamp when the session was last updated */
    readonly updatedAt: number
}

/**
 * A single dispatched event captured for the Events panel.
 *
 * Correlated to the request that fired it via {@link requestId} (undefined for
 * events fired outside a request, e.g. at boot). Carries the count of listeners
 * **registered** for the event at capture time — not "fired", which the
 * dispatcher does not expose (see #27/#90).
 *
 * @example
 * ```typescript
 * const info: EventInfo = {
 *     eventName: 'UserRegistered',
 *     listenerCount: 2,
 *     timestamp: Date.now(),
 *     requestId: 'a1b2c3',
 * }
 * ```
 */
export interface EventInfo {
    /** The dispatched event's name. */
    readonly eventName: string
    /** Listeners registered for this event at capture time. */
    readonly listenerCount: number
    /** Unix timestamp when the event was captured. */
    readonly timestamp: number
    /** Id of the request that fired it, or `undefined` outside a request. */
    readonly requestId?: string
}

// =============================================================================
// Queue Types
// =============================================================================

/**
 * Information about a background job.
 *
 * @example
 * ```typescript
 * const job: QueueJob = {
 *     id: 'job-123',
 *     name: 'SendWelcomeEmail',
 *     status: 'completed',
 *     attempts: 1,
 *     timestamp: Date.now(),
 * }
 * ```
 */
export interface QueueJob {
    /** Unique job identifier */
    readonly id: string
    /** Job class or handler name */
    readonly name: string
    /** Current job status */
    readonly status: JobStatus
    /** Number of execution attempts */
    readonly attempts: number
    /** Unix timestamp when the job was queued */
    readonly timestamp: number
    /** Error message if the job failed */
    readonly error?: string
}

// =============================================================================
// Mail Types
// =============================================================================

/**
 * Information about a sent email.
 *
 * @example
 * ```typescript
 * const mail: MailInfo = {
 *     to: 'user@example.com',
 *     subject: 'Welcome to our app!',
 *     timestamp: Date.now(),
 *     driver: 'smtp',
 *     status: 'sent',
 * }
 * ```
 */
export interface MailInfo {
    /** Recipient email address */
    readonly to: string
    /** Email subject line */
    readonly subject: string
    /** Unix timestamp when the email was sent */
    readonly timestamp: number
    /** Mail driver used (smtp, ses, etc.) */
    readonly driver: string
    /** Delivery status */
    readonly status: MailStatus
}

// =============================================================================
// Performance Types
// =============================================================================

/**
 * A performance measurement.
 *
 * @example
 * ```typescript
 * const metric: PerformanceMetric = {
 *     name: 'GET /api/users',
 *     duration: 23.5,
 *     timestamp: Date.now(),
 *     type: 'route',
 * }
 * ```
 */
export interface PerformanceMetric {
    /** Descriptive name of the measured operation */
    readonly name: string
    /** Duration in milliseconds */
    readonly duration: number
    /** Unix timestamp when the measurement was taken */
    readonly timestamp: number
    /** Category of the measurement */
    readonly type: MetricType
}

// =============================================================================
// Deprecation Types
// =============================================================================

/**
 * A deprecation notice entry.
 *
 * Collected from `@lockness/deprecation-contracts` to display warnings.
 *
 * @example
 * ```typescript
 * const deprecation: DeprecationEntry = {
 *     pkg: 'my-package',
 *     version: '1.2.0',
 *     message: 'Use newMethod() instead',
 *     fullMessage: 'Since my-package 1.2.0: Use newMethod() instead',
 *     timestamp: Date.now(),
 * }
 * ```
 */
export interface DeprecationEntry {
    /** Package name that triggered the deprecation */
    readonly pkg: string
    /** Version when the deprecation was introduced */
    readonly version: string
    /** The deprecation message */
    readonly message: string
    /** Full formatted message with prefix */
    readonly fullMessage: string
    /** Unix timestamp when the deprecation was triggered */
    readonly timestamp: number
    /** Optional stack trace for debugging */
    readonly stack?: string
}

// =============================================================================
// Aggregate Types
// =============================================================================

/**
 * All data collected by the devtools.
 *
 * This is the main data structure returned by `collector.getAllData()`
 * and consumed by the dashboard UI.
 *
 * @example
 * ```typescript
 * const data: DevtoolsData = collector.getAllData()
 * console.log(`Tracked ${data.requests.length} requests`)
 * ```
 */
export interface DevtoolsData {
    /** Registered application routes */
    routes: RouteInfo[]
    /** Captured log entries */
    logs: LogEntry[]
    /** Tracked SQL queries */
    queries: SQLQuery[]
    /** Captured HTTP requests */
    requests: RequestInfo[]
    /** Active sessions */
    sessions: SessionData[]
    /** Captured dispatched events */
    events: EventInfo[]
    /** Background jobs */
    queue: QueueJob[]
    /** Sent emails */
    mails: MailInfo[]
    /** Performance metrics */
    performance: PerformanceMetric[]
    /** Deprecation notices */
    deprecations: DeprecationEntry[]
}

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Configuration options for enabling devtools.
 *
 * @example
 * ```typescript
 * enableDevtools(app, {
 *     enabled: true,
 *     basePath: '/_devtools',
 *     maxRequests: 200,
 *     showDebugBar: true,
 * })
 * ```
 */
export interface DevtoolsConfig {
    /**
     * Whether devtools is enabled.
     * @default true
     */
    readonly enabled?: boolean

    /**
     * Base path for the devtools dashboard.
     * @default '/_devtools'
     */
    readonly basePath?: string

    /**
     * Maximum number of log entries to keep in memory.
     * @default 1000
     */
    readonly maxLogs?: number

    /**
     * Maximum number of SQL queries to keep in memory.
     * @default 500
     */
    readonly maxQueries?: number

    /**
     * Maximum number of requests to keep in memory.
     * @default 100
     */
    readonly maxRequests?: number

    /**
     * Whether to show the debug toolbar on HTML pages.
     * Can be disabled with `DEBUG_BAR=false` environment variable.
     * @default true
     */
    readonly showDebugBar?: boolean

    /**
     * Shared secret required to reach the gated devtools routes from any host.
     *
     * When set (here or via the `LOCKNESS_DEVTOOLS_TOKEN` env var), every
     * devtools route requires an `Authorization: Bearer <token>` header that
     * matches, compared in constant time; a configured token is **not** bypassed
     * by the loopback default. When unset, the default loopback posture applies.
     * Generate it with a CSPRNG and at least 128 bits of entropy — there is no
     * per-attempt lockout, so token entropy is the only barrier.
     *
     * @default undefined — falls back to `LOCKNESS_DEVTOOLS_TOKEN`, else the
     * loopback posture.
     */
    readonly token?: string

    /**
     * Escape hatch that lets the application decide authorization for the
     * devtools routes with its own logic (a session check, `@lockness/auth`, an
     * IP allowlist) without devtools depending on it.
     *
     * When provided it is **the** decider (it supersedes `token` and the
     * loopback default): returning `true` allows the request, `false` denies it.
     * It is always awaited and wrapped in a `try/catch` — a callback that throws
     * or returns a rejected Promise denies (fail closed), never grants. It must
     * not trust a spoofable forwarding header (`X-Forwarded-For` et al.) to
     * *grant* access.
     *
     * @param c - The Hono request context for the incoming devtools request.
     * @returns `true` to allow, `false` to deny; may be async.
     *
     * @example
     * ```typescript
     * enableDevtools(app, {
     *   authorize: (c) => c.get('user')?.isAdmin === true,
     * })
     * ```
     */
    readonly authorize?: (c: Context) => boolean | Promise<boolean>
}
