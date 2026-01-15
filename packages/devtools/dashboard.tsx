/**
 * Devtools Dashboard UI
 * Web-based debug dashboard with Tailwind CSS
 */

import type { Context } from '@lockness/core'
import { collector } from './collector.ts'
import type { RequestInfo } from './types.ts'
import { Dashboard } from './ui/Dashboard.tsx'

export function renderDashboard(c: Context) {
    const data = {
        ...collector.getAllData(),
        system: {
            uptime: performance.now() / 1000,
            memory: Deno.memoryUsage(),
        },
    }
    const activePanel = c.req.query('panel') || 'overview'
    const requestId = c.req.query('requestId')
    const selectedRequest = requestId
        ? data.requests.find((r: RequestInfo) => r.id === requestId)
        : null

    return c.html(
        <Dashboard
            data={data}
            activePanel={activePanel}
            selectedRequest={selectedRequest}
        />,
    )
}
