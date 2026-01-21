/**
 * @fileoverview Devtools dashboard renderer.
 *
 * Renders the web-based debug dashboard UI using the collected devtools data.
 *
 * @module @lockness/devtools/dashboard
 */

import type { Context } from 'hono'
import { collector } from './collector.ts'
import type { DevtoolsData, RequestInfo } from './types.ts'
import { Dashboard } from './ui/Dashboard.tsx'

// =============================================================================
// Dashboard Data Types
// =============================================================================

/**
 * System information displayed in the dashboard.
 * @internal
 */
interface SystemInfo {
    /** Application uptime in seconds */
    readonly uptime: number
    /** Deno memory usage statistics */
    readonly memory: Deno.MemoryUsage
}

/**
 * Extended dashboard data including system info.
 * @internal
 */
interface DashboardData extends DevtoolsData {
    /** System runtime information */
    readonly system: SystemInfo
}

// =============================================================================
// Dashboard Renderer
// =============================================================================

/**
 * Render the devtools dashboard page.
 *
 * This function is called when the dashboard route is accessed.
 * It gathers all collected data and renders the Dashboard component.
 *
 * @param c - The Hono context
 * @returns The HTML response containing the dashboard
 *
 * @example
 * ```typescript
 * app.get('/_devtools', (c) => renderDashboard(c))
 * ```
 */
export function renderDashboard(c: Context) {
    const data: DashboardData = {
        ...collector.getAllData(),
        system: {
            uptime: performance.now() / 1000,
            memory: Deno.memoryUsage(),
        },
    }
    const activePanel: string = c.req.query('panel') || 'overview'
    const requestId: string | undefined = c.req.query('requestId')
    const selectedRequest: RequestInfo | null = requestId
        ? (data.requests.find((r) => r.id === requestId) ?? null)
        : null

    return c.html(
        <Dashboard
            data={data}
            activePanel={activePanel}
            selectedRequest={selectedRequest}
        />,
    )
}
