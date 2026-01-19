/**
 * Types for Lockness Devtools
 */

export interface RouteInfo {
    method: string
    path: string
    name?: string
    controller?: string
    action?: string
    middlewares: string[]
}

export interface LogEntry {
    timestamp: number
    level: 'info' | 'warn' | 'error' | 'debug'
    message: string
    context?: Record<string, unknown>
}

export interface SQLQuery {
    query: string
    duration: number
    timestamp: number
    bindings?: unknown[]
}

export interface ComponentNode {
    name: string
    file?: string
    props?: string[]
    children: ComponentNode[]
}

export interface RequestInfo {
    id: string
    method: string
    path: string
    timestamp: number
    duration?: number
    statusCode?: number
    headers: Record<string, string>
    query: Record<string, string>
    body?: unknown
    controller?: string
    action?: string
    routeName?: string
    component?: string
    componentTree?: ComponentNode[]
}

export interface SessionData {
    id: string
    data: Record<string, unknown>
    createdAt: number
    updatedAt: number
}

export interface QueueJob {
    id: string
    name: string
    status: 'pending' | 'processing' | 'completed' | 'failed'
    attempts: number
    timestamp: number
    error?: string
}

export interface MailInfo {
    to: string
    subject: string
    timestamp: number
    driver: string
    status: 'sent' | 'failed'
}

export interface PerformanceMetric {
    name: string
    duration: number
    timestamp: number
    type: 'route' | 'database' | 'middleware' | 'other'
}

export interface DeprecationEntry {
    pkg: string
    version: string
    message: string
    fullMessage: string
    timestamp: number
    stack?: string
}

export interface DevtoolsData {
    routes: RouteInfo[]
    logs: LogEntry[]
    queries: SQLQuery[]
    requests: RequestInfo[]
    sessions: SessionData[]
    queue: QueueJob[]
    mails: MailInfo[]
    performance: PerformanceMetric[]
    deprecations: DeprecationEntry[]
}

export interface DevtoolsConfig {
    enabled?: boolean
    basePath?: string
    maxLogs?: number
    maxQueries?: number
    maxRequests?: number
    showDebugBar?: boolean
}
