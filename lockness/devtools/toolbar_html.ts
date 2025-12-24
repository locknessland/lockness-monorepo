/**
 * Generate debug toolbar HTML
 * Returns raw HTML string for injection
 */

import { collector } from './collector.ts'
import type { RequestInfo } from './types.ts'

// Heroicons SVG (flat style)
const icons = {
    wrench: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75a4.5 4.5 0 0 1-4.884 4.484c-1.076-.091-2.264.071-2.95.904l-7.152 8.684a2.548 2.548 0 1 1-3.586-3.586l8.684-7.152c.833-.686.995-1.874.904-2.95a4.5 4.5 0 0 1 6.336-4.486l-3.276 3.276a3.004 3.004 0 0 0 2.25 2.25l3.276-3.276c.256.565.398 1.192.398 1.852Z" /></svg>',
    globe: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" /></svg>',
    chart: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /></svg>',
    bolt: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" /></svg>',
    document: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>',
    database: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" /></svg>',
    queue: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" /></svg>',
    envelope: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>',
    close: '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>',
}

function getStatusColor(statusCode?: number): string {
    if (!statusCode) return '#1e293b'
    if (statusCode >= 500) return '#dc2626' // red-600
    if (statusCode >= 400) return '#ea580c' // orange-600
    if (statusCode >= 300) return '#0891b2' // cyan-600
    if (statusCode >= 200) return '#16a34a' // green-600
    return '#64748b' // slate-500
}

export function generateToolbarHtml(requestId?: string): string {
    const data = collector.getAllData()
    const currentRequest: RequestInfo | undefined = requestId
        ? data.requests.find((r) => r.id === requestId)
        : data.requests[data.requests.length - 1]

    const hasErrors = data.logs.filter((l) => l.level === 'error').length > 0

    const durationColor = !currentRequest?.duration
        ? '#94a3b8'
        : currentRequest.duration < 100
            ? '#10b981'
            : currentRequest.duration < 500
                ? '#f59e0b'
                : '#ef4444'

    const statusCode = currentRequest?.statusCode
    const statusBgColor = getStatusColor(statusCode)

    return `
<div
    id="lockness-debug-toolbar"
    style="position: fixed; bottom: 0; left: 0; right: 0; height: 60px; background-color: #090c14; color: white; font-family: system-ui, -apple-system, sans-serif; font-size: 13px; z-index: 999999; box-shadow: 0 -2px 10px rgba(0,0,0,0.3); display: flex; align-items: center; padding: 0 20px; gap: 24px;"
>
    <!-- Logo -->
    <a
        href="/_devtools"
        style="display: flex; align-items: center; gap: 10px; color: white; text-decoration: none; font-weight: 600;"
    >
        <div style="width: 20px; height: 20px; color: #38bdf8;">${icons.wrench}</div>
        <span>Lockness</span>
    </a>

    ${statusCode
            ? `
    <!-- HTTP Status Code -->
    <div style="display: flex; align-items: center; background-color: ${statusBgColor}; padding: 6px 12px; border-radius:4px; font-weight: 700; font-size: 14px; gap: 6px;">
        <span>${statusCode}</span>
    </div>
    `
            : ''
        }

    <!-- Divider -->
    <div style="width: 1px; height: 32px; background-color: #334155;"></div>

    <!-- Routes -->
    <a
        href="/_devtools?panel=routes"
        style="display: flex; align-items: center; gap: 10px; color: white; text-decoration: none; padding: 10px 14px; border-radius: 8px; transition: background-color 0.2s;"
        onmouseover="this.style.backgroundColor='#1e293b'"
        onmouseout="this.style.backgroundColor='transparent'"
    >
        <div style="width: 18px; height: 18px; flex-shrink: 0;">${icons.globe}</div>
        <div style="display: flex; flex-direction: column; gap: 2px;">
            <span style="font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 500;">ROUTES</span>
            <span style="font-weight: 600; color: #94a3b8; font-size: 14px;">${data.routes.length}</span>
        </div>
    </a>

    <!-- Requests -->
    <a
        href="/_devtools?panel=requests"
        style="display: flex; align-items: center; gap: 10px; color: white; text-decoration: none; padding: 10px 14px; border-radius: 8px; transition: background-color 0.2s;"
        onmouseover="this.style.backgroundColor='#1e293b'"
        onmouseout="this.style.backgroundColor='transparent'"
    >
        <div style="width: 18px; height: 18px; flex-shrink: 0;">${icons.chart}</div>
        <div style="display: flex; flex-direction: column; gap: 2px;">
            <span style="font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 500;">REQUESTS</span>
            <span style="font-weight: 600; color: #94a3b8; font-size: 14px;">${data.requests.length}</span>
        </div>
    </a>

    <!-- Duration -->
    ${currentRequest
            ? `
    <div style="display: flex; align-items: center; gap: 10px; padding: 10px 14px;">
        <div style="width: 18px; height: 18px; flex-shrink: 0;">${icons.bolt}</div>
        <div style="display: flex; flex-direction: column; gap: 2px;">
            <span style="font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 500;">DURATION</span>
            <span style="font-weight: 600; color: ${durationColor}; font-size: 14px;">${currentRequest.duration?.toFixed(2) || '0'
            }ms</span>
        </div>
    </div>
    `
            : ''
        }

    <!-- Logs -->
    <a
        href="/_devtools?panel=logs"
        style="display: flex; align-items: center; gap: 10px; color: white; text-decoration: none; padding: 10px 14px; border-radius: 8px; transition: background-color 0.2s; position: relative;"
        onmouseover="this.style.backgroundColor='#1e293b'"
        onmouseout="this.style.backgroundColor='transparent'"
    >
        <div style="width: 18px; height: 18px; flex-shrink: 0;">${icons.document}</div>
        <div style="display: flex; flex-direction: column; gap: 2px;">
            <span style="font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 500;">LOGS</span>
            <span style="font-weight: 600; color: #94a3b8; font-size: 14px;">${data.logs.length}</span>
        </div>
        ${hasErrors
            ? `
        <span
            style="position: absolute; top: 6px; right: 6px; width: 8px; height: 8px; background-color: #ef4444; border-radius: 50%; border: 2px solid #0f172a;"
        ></span>
        `
            : ''
        }
    </a>

    <!-- SQL -->
    <a
        href="/_devtools?panel=sql"
        style="display: flex; align-items: center; gap: 10px; color: white; text-decoration: none; padding: 10px 14px; border-radius: 8px; transition: background-color 0.2s;"
        onmouseover="this.style.backgroundColor='#1e293b'"
        onmouseout="this.style.backgroundColor='transparent'"
    >
        <div style="width: 18px; height: 18px; flex-shrink: 0;">${icons.database}</div>
        <div style="display: flex; flex-direction: column; gap: 2px;">
            <span style="font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 500;">SQL</span>
            <span style="font-weight: 600; color: #94a3b8; font-size: 14px;">${data.queries.length}</span>
        </div>
    </a>

    <!-- Queue -->
    <a
        href="/_devtools?panel=queue"
        style="display: flex; align-items: center; gap: 10px; color: white; text-decoration: none; padding: 10px 14px; border-radius: 8px; transition: background-color 0.2s;"
        onmouseover="this.style.backgroundColor='#1e293b'"
        onmouseout="this.style.backgroundColor='transparent'"
    >
        <div style="width: 18px; height: 18px; flex-shrink: 0;">${icons.queue}</div>
        <div style="display: flex; flex-direction: column; gap: 2px;">
            <span style="font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 500;">QUEUE</span>
            <span style="font-weight: 600; color: #94a3b8; font-size: 14px;">${data.queue.length}</span>
        </div>
    </a>

    <!-- Mail -->
    <a
        href="/_devtools?panel=mail"
        style="display: flex; align-items: center; gap: 10px; color: white; text-decoration: none; padding: 10px 14px; border-radius: 8px; transition: background-color 0.2s;"
        onmouseover="this.style.backgroundColor='#1e293b'"
        onmouseout="this.style.backgroundColor='transparent'"
    >
        <div style="width: 18px; height: 18px; flex-shrink: 0;">${icons.envelope}</div>
        <div style="display: flex; flex-direction: column; gap: 2px;">
            <span style="font-size: 10px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 500;">MAIL</span>
            <span style="font-weight: 600; color: #94a3b8; font-size: 14px;">${data.mails.length}</span>
        </div>
    </a>

    <!-- Spacer -->
    <div style="flex: 1;"></div>

    <!-- Close button -->
    <button
        onclick="document.getElementById('lockness-debug-toolbar').style.display='none'"
        style="background-color: transparent; border: none; color: #64748b; cursor: pointer; padding: 6px; border-radius: 6px; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;"
        onmouseover="this.style.backgroundColor='#1e293b'; this.style.color='#cbd5e1'"
        onmouseout="this.style.backgroundColor='transparent'; this.style.color='#64748b'"
        title="Hide toolbar"
    >
        <div style="width: 16px; height: 16px;">${icons.close}</div>
    </button>
</div>
    `.trim()
}
