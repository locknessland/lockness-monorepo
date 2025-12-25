/**
 * Devtools Data Collector
 * Collects and stores debugging data in memory
 */

import type {
    DevtoolsData,
    LogEntry,
    MailInfo,
    PerformanceMetric,
    QueueJob,
    RequestInfo,
    RouteInfo,
    SessionData,
    SQLQuery,
    DeprecationEntry,
} from './types.ts'

export class DevtoolsCollector {
    private static instance: DevtoolsCollector
    private data: DevtoolsData = {
        routes: [],
        logs: [],
        queries: [],
        requests: [],
        sessions: [],
        queue: [],
        mails: [],
        performance: [],
        deprecations: [],
    }

    private maxLogs = 1000
    private maxQueries = 500
    private maxRequests = 100

    private constructor() {}

    static getInstance(): DevtoolsCollector {
        if (!DevtoolsCollector.instance) {
            DevtoolsCollector.instance = new DevtoolsCollector()
        }
        return DevtoolsCollector.instance
    }

    // Routes
    setRoutes(routes: RouteInfo[]): void {
        this.data.routes = routes
    }

    getRoutes(): RouteInfo[] {
        return this.data.routes
    }

    // Logs
    addLog(log: LogEntry): void {
        this.data.logs.unshift(log)
        if (this.data.logs.length > this.maxLogs) {
            this.data.logs = this.data.logs.slice(0, this.maxLogs)
        }
    }

    getLogs(): LogEntry[] {
        return this.data.logs
    }

    // SQL Queries
    addQuery(query: SQLQuery): void {
        this.data.queries.unshift(query)
        if (this.data.queries.length > this.maxQueries) {
            this.data.queries = this.data.queries.slice(0, this.maxQueries)
        }
    }

    getQueries(): SQLQuery[] {
        return this.data.queries
    }

    // Requests
    addRequest(request: RequestInfo): void {
        this.data.requests.unshift(request)
        if (this.data.requests.length > this.maxRequests) {
            this.data.requests = this.data.requests.slice(0, this.maxRequests)
        }
    }

    updateRequest(id: string, updates: Partial<RequestInfo>): void {
        const request = this.data.requests.find((r) => r.id === id)
        if (request) {
            Object.assign(request, updates)
        }
    }

    getRequests(): RequestInfo[] {
        return this.data.requests
    }

    // Sessions
    updateSession(session: SessionData): void {
        const index = this.data.sessions.findIndex((s) => s.id === session.id)
        if (index >= 0) {
            this.data.sessions[index] = session
        } else {
            this.data.sessions.push(session)
        }
    }

    getSessions(): SessionData[] {
        return this.data.sessions
    }

    // Queue
    addQueueJob(job: QueueJob): void {
        this.data.queue.unshift(job)
        if (this.data.queue.length > 100) {
            this.data.queue = this.data.queue.slice(0, 100)
        }
    }

    updateQueueJob(id: string, updates: Partial<QueueJob>): void {
        const job = this.data.queue.find((j) => j.id === id)
        if (job) {
            Object.assign(job, updates)
        }
    }

    getQueueJobs(): QueueJob[] {
        return this.data.queue
    }

    // Mail
    addMail(mail: MailInfo): void {
        this.data.mails.unshift(mail)
        if (this.data.mails.length > 100) {
            this.data.mails = this.data.mails.slice(0, 100)
        }
    }

    getMails(): MailInfo[] {
        return this.data.mails
    }

    // Performance
    addPerformanceMetric(metric: PerformanceMetric): void {
        this.data.performance.unshift(metric)
        if (this.data.performance.length > 500) {
            this.data.performance = this.data.performance.slice(0, 500)
        }
    }

    getPerformanceMetrics(): PerformanceMetric[] {
        return this.data.performance
    }

    // Deprecations
    addDeprecation(deprecation: DeprecationEntry): void {
        this.data.deprecations.unshift(deprecation)
        if (this.data.deprecations.length > 500) {
            this.data.deprecations = this.data.deprecations.slice(0, 500)
        }
    }

    getDeprecations(): DeprecationEntry[] {
        return this.data.deprecations
    }

    // Get all data
    getAllData(): DevtoolsData {
        return this.data
    }

    // Clear data
    clear(): void {
        this.data = {
            routes: this.data.routes, // Keep routes
            logs: [],
            queries: [],
            requests: [],
            sessions: [],
            queue: [],
            mails: [],
            performance: [],
            deprecations: [],
        }
    }
}

export const collector: DevtoolsCollector = DevtoolsCollector.getInstance()
