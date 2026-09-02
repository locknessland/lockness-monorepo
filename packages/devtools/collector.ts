/**
 * @fileoverview Devtools data collector singleton.
 *
 * Provides a centralized store for all debugging data collected by the devtools.
 * The collector manages routes, logs, queries, requests, sessions, queue jobs,
 * mail, performance metrics, and deprecation notices.
 *
 * @module @lockness/devtools/collector
 *
 * @example
 * ```typescript
 * import { collector } from '@lockness/devtools'
 *
 * // Add a log entry
 * collector.addLog({
 *     timestamp: Date.now(),
 *     level: 'info',
 *     message: 'User logged in',
 * })
 *
 * // Get all collected data
 * const data = collector.getAllData()
 * ```
 */

import type {
    DeprecationEntry,
    DevtoolsData,
    EventInfo,
    LogEntry,
    MailInfo,
    PerformanceMetric,
    QueueJob,
    RequestInfo,
    RouteInfo,
    SessionData,
    SQLQuery,
} from './types.ts'

// =============================================================================
// Collector Class
// =============================================================================

/**
 * Singleton collector for devtools debugging data.
 *
 * This class manages all data collected by the devtools, including:
 * - Application routes
 * - Log entries
 * - SQL queries
 * - HTTP requests
 * - Session data
 * - Background jobs
 * - Sent emails
 * - Performance metrics
 * - Deprecation notices
 *
 * The collector automatically limits stored data to prevent memory issues.
 *
 * @example
 * ```typescript
 * const collector = DevtoolsCollector.getInstance()
 * collector.addRequest({ id: '123', method: 'GET', path: '/', ... })
 * ```
 */
export class DevtoolsCollector {
    /** Singleton instance */
    private static instance: DevtoolsCollector

    /** All collected devtools data */
    private data: DevtoolsData = {
        routes: [],
        logs: [],
        queries: [],
        requests: [],
        sessions: [],
        events: [],
        queue: [],
        mails: [],
        performance: [],
        deprecations: [],
    }

    /** Maximum number of event records to retain */
    private maxEvents = 500

    /** Maximum number of log entries to retain */
    private maxLogs = 1000

    /** Maximum number of SQL queries to retain */
    private maxQueries = 500

    /** Maximum number of requests to retain */
    private maxRequests = 100

    /** Map of component names to their source file paths */
    private componentMap = new Map<string, string>()

    /** Private constructor for singleton pattern */
    private constructor() {}

    /**
     * Get the singleton instance of the collector.
     *
     * @returns The shared DevtoolsCollector instance
     *
     * @example
     * ```typescript
     * const collector = DevtoolsCollector.getInstance()
     * ```
     */
    static getInstance(): DevtoolsCollector {
        if (!DevtoolsCollector.instance) {
            DevtoolsCollector.instance = new DevtoolsCollector()
        }
        return DevtoolsCollector.instance
    }

    // =========================================================================
    // Component Methods
    // =========================================================================

    /**
     * Set the component name to file path mapping.
     *
     * @param map - Map of component names to their source file paths
     */
    setComponentMap(map: Map<string, string>): void {
        this.componentMap = map
    }

    /**
     * Get the source file path for a component.
     *
     * @param name - The component name
     * @returns The file path, or undefined if not found
     */
    getComponentFile(name: string): string | undefined {
        return this.componentMap.get(name)
    }

    // =========================================================================
    // Route Methods
    // =========================================================================

    /**
     * Set all application routes.
     *
     * @param routes - Array of route information
     */
    setRoutes(routes: RouteInfo[]): void {
        this.data.routes = routes
    }

    /**
     * Get all registered routes.
     *
     * @returns Array of route information
     */
    getRoutes(): RouteInfo[] {
        return this.data.routes
    }

    // =========================================================================
    // Log Methods
    // =========================================================================

    /**
     * Add a log entry.
     *
     * Logs are stored in reverse chronological order (newest first).
     * Automatically trims to `maxLogs` entries.
     *
     * @param log - The log entry to add
     */
    addLog(log: LogEntry): void {
        this.data.logs.unshift(log)
        if (this.data.logs.length > this.maxLogs) {
            this.data.logs = this.data.logs.slice(0, this.maxLogs)
        }
    }

    /**
     * Record a dispatched event (newest first), trimmed to `maxEvents`.
     *
     * @param event - The captured event record.
     */
    addEvent(event: EventInfo): void {
        this.data.events.unshift(event)
        if (this.data.events.length > this.maxEvents) {
            this.data.events = this.data.events.slice(0, this.maxEvents)
        }
    }

    /**
     * Get all captured events (newest first).
     *
     * @returns The event records.
     */
    getEvents(): EventInfo[] {
        return this.data.events
    }

    /**
     * Get all log entries.
     *
     * @returns Array of log entries (newest first)
     */
    getLogs(): LogEntry[] {
        return this.data.logs
    }

    // =========================================================================
    // SQL Query Methods
    // =========================================================================

    /**
     * Add a SQL query.
     *
     * Queries are stored in reverse chronological order (newest first).
     * Automatically trims to `maxQueries` entries.
     *
     * @param query - The SQL query to add
     */
    addQuery(query: SQLQuery): void {
        this.data.queries.unshift(query)
        if (this.data.queries.length > this.maxQueries) {
            this.data.queries = this.data.queries.slice(0, this.maxQueries)
        }
    }

    /**
     * Get all tracked SQL queries.
     *
     * @returns Array of SQL queries (newest first)
     */
    getQueries(): SQLQuery[] {
        return this.data.queries
    }

    // =========================================================================
    // Request Methods
    // =========================================================================

    /**
     * Add a request.
     *
     * Requests are stored in reverse chronological order (newest first).
     * Automatically trims to `maxRequests` entries.
     *
     * @param request - The request info to add
     */
    addRequest(request: RequestInfo): void {
        this.data.requests.unshift(request)
        if (this.data.requests.length > this.maxRequests) {
            this.data.requests = this.data.requests.slice(0, this.maxRequests)
        }
    }

    /**
     * Update an existing request with additional data.
     *
     * Typically used to add response information (status code, duration)
     * after the request has completed.
     *
     * @param id - The request ID to update
     * @param updates - Partial request data to merge
     */
    updateRequest(id: string, updates: Partial<RequestInfo>): void {
        const request = this.data.requests.find((r) => r.id === id)
        if (request) {
            Object.assign(request, updates)
        }
    }

    /**
     * Get all tracked requests.
     *
     * @returns Array of request info (newest first)
     */
    getRequests(): RequestInfo[] {
        return this.data.requests
    }

    // =========================================================================
    // Session Methods
    // =========================================================================

    /**
     * Update or add a session.
     *
     * If a session with the same ID exists, it will be updated.
     * Otherwise, a new session is added.
     *
     * @param session - The session data
     */
    updateSession(session: SessionData): void {
        const index = this.data.sessions.findIndex((s) => s.id === session.id)
        if (index >= 0) {
            this.data.sessions[index] = session
        } else {
            this.data.sessions.push(session)
        }
    }

    /**
     * Get all tracked sessions.
     *
     * @returns Array of session data
     */
    getSessions(): SessionData[] {
        return this.data.sessions
    }

    // =========================================================================
    // Queue Job Methods
    // =========================================================================

    /**
     * Add a queue job.
     *
     * Jobs are stored in reverse chronological order (newest first).
     * Automatically trims to 100 entries.
     *
     * @param job - The job to add
     */
    addQueueJob(job: QueueJob): void {
        this.data.queue.unshift(job)
        if (this.data.queue.length > 100) {
            this.data.queue = this.data.queue.slice(0, 100)
        }
    }

    /**
     * Update an existing queue job.
     *
     * @param id - The job ID to update
     * @param updates - Partial job data to merge
     */
    updateQueueJob(id: string, updates: Partial<QueueJob>): void {
        const job = this.data.queue.find((j) => j.id === id)
        if (job) {
            Object.assign(job, updates)
        }
    }

    /**
     * Get all tracked queue jobs.
     *
     * @returns Array of queue jobs (newest first)
     */
    getQueueJobs(): QueueJob[] {
        return this.data.queue
    }

    // =========================================================================
    // Mail Methods
    // =========================================================================

    /**
     * Add a sent mail entry.
     *
     * Mails are stored in reverse chronological order (newest first).
     * Automatically trims to 100 entries.
     *
     * @param mail - The mail info to add
     */
    addMail(mail: MailInfo): void {
        this.data.mails.unshift(mail)
        if (this.data.mails.length > 100) {
            this.data.mails = this.data.mails.slice(0, 100)
        }
    }

    /**
     * Get all tracked mails.
     *
     * @returns Array of mail info (newest first)
     */
    getMails(): MailInfo[] {
        return this.data.mails
    }

    // =========================================================================
    // Performance Methods
    // =========================================================================

    /**
     * Add a performance metric.
     *
     * Metrics are stored in reverse chronological order (newest first).
     * Automatically trims to 500 entries.
     *
     * @param metric - The performance metric to add
     */
    addPerformanceMetric(metric: PerformanceMetric): void {
        this.data.performance.unshift(metric)
        if (this.data.performance.length > 500) {
            this.data.performance = this.data.performance.slice(0, 500)
        }
    }

    /**
     * Get all performance metrics.
     *
     * @returns Array of performance metrics (newest first)
     */
    getPerformanceMetrics(): PerformanceMetric[] {
        return this.data.performance
    }

    // =========================================================================
    // Deprecation Methods
    // =========================================================================

    /**
     * Add a deprecation notice.
     *
     * Deprecations are stored in reverse chronological order (newest first).
     * Automatically trims to 500 entries.
     *
     * @param deprecation - The deprecation entry to add
     */
    addDeprecation(deprecation: DeprecationEntry): void {
        this.data.deprecations.unshift(deprecation)
        if (this.data.deprecations.length > 500) {
            this.data.deprecations = this.data.deprecations.slice(0, 500)
        }
    }

    /**
     * Get all deprecation notices.
     *
     * @returns Array of deprecation entries (newest first)
     */
    getDeprecations(): DeprecationEntry[] {
        return this.data.deprecations
    }

    // =========================================================================
    // Utility Methods
    // =========================================================================

    /**
     * Get all collected devtools data.
     *
     * @returns All devtools data
     */
    getAllData(): DevtoolsData {
        return this.data
    }

    /**
     * Clear all collected data except routes.
     *
     * Routes are preserved since they represent the application structure
     * and don't change during runtime.
     */
    clear(): void {
        this.data = {
            routes: this.data.routes, // Keep routes
            logs: [],
            queries: [],
            requests: [],
            sessions: [],
            events: [],
            queue: [],
            mails: [],
            performance: [],
            deprecations: [],
        }
    }
}

// =============================================================================
// Singleton Export
// =============================================================================

/**
 * The shared devtools collector instance.
 *
 * @example
 * ```typescript
 * import { collector } from '@lockness/devtools'
 *
 * collector.addLog({ timestamp: Date.now(), level: 'info', message: 'Hello' })
 * ```
 */
export const collector: DevtoolsCollector = DevtoolsCollector.getInstance()
