/**
 * Generate debug toolbar HTML
 * Returns raw HTML string for injection
 */

import { collector } from './collector.ts'
import type { RequestInfo } from './types.ts'

export function generateToolbarHtml(requestId?: string): string {
    const data = collector.getAllData()
    const currentRequest: RequestInfo | undefined = requestId
        ? data.requests.find((r) => r.id === requestId)
        : data.requests[data.requests.length - 1]

    const hasErrors = data.logs.filter((l) => l.level === 'error').length > 0

    const durationColor = !currentRequest?.duration
        ? '#9ca3af'
        : currentRequest.duration < 100
        ? '#10b981'
        : currentRequest.duration < 500
        ? '#f59e0b'
        : '#ef4444'

    return `
<div
    id="lockness-debug-toolbar"
    style="position: fixed; bottom: 0; left: 0; right: 0; height: 48px; background-color: #1f2937; color: white; font-family: system-ui, -apple-system, sans-serif; font-size: 13px; z-index: 999999; box-shadow: 0 -2px 10px rgba(0,0,0,0.3); display: flex; align-items: center; padding: 0 16px; gap: 24px;"
>
    <!-- Logo -->
    <a
        href="/_devtools"
        style="display: flex; align-items: center; gap: 8px; color: white; text-decoration: none; font-weight: 600;"
    >
        <span style="font-size: 18px;">🔧</span>
        <span>Lockness</span>
    </a>

    <!-- Divider -->
    <div style="width: 1px; height: 24px; background-color: #4b5563;"></div>

    <!-- Routes -->
    <a
        href="/_devtools?panel=routes"
        style="display: flex; align-items: center; gap: 8px; color: white; text-decoration: none; padding: 8px 12px; border-radius: 6px; transition: background-color 0.2s;"
        onmouseover="this.style.backgroundColor='#374151'"
        onmouseout="this.style.backgroundColor='transparent'"
    >
        <span style="font-size: 16px;">🌐</span>
        <div style="display: flex; flex-direction: column; gap: 2px;">
            <span style="font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px;">ROUTES</span>
            <span style="font-weight: 600; color: #9ca3af;">${data.routes.length}</span>
        </div>
    </a>

    <!-- Requests -->
    <a
        href="/_devtools?panel=requests"
        style="display: flex; align-items: center; gap: 8px; color: white; text-decoration: none; padding: 8px 12px; border-radius: 6px; transition: background-color 0.2s;"
        onmouseover="this.style.backgroundColor='#374151'"
        onmouseout="this.style.backgroundColor='transparent'"
    >
        <span style="font-size: 16px;">📊</span>
        <div style="display: flex; flex-direction: column; gap: 2px;">
            <span style="font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px;">REQUESTS</span>
            <span style="font-weight: 600; color: #9ca3af;">${data.requests.length}</span>
        </div>
    </a>

    <!-- Duration -->
    ${
        currentRequest
            ? `
    <div style="display: flex; align-items: center; gap: 8px; padding: 8px 12px;">
        <span style="font-size: 16px;">⚡</span>
        <div style="display: flex; flex-direction: column; gap: 2px;">
            <span style="font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px;">DURATION</span>
            <span style="font-weight: 600; color: ${durationColor};">${
                currentRequest.duration?.toFixed(2) || '0'
            }ms</span>
        </div>
    </div>
    `
            : ''
    }

    <!-- Logs -->
    <a
        href="/_devtools?panel=logs"
        style="display: flex; align-items: center; gap: 8px; color: white; text-decoration: none; padding: 8px 12px; border-radius: 6px; transition: background-color 0.2s; position: relative;"
        onmouseover="this.style.backgroundColor='#374151'"
        onmouseout="this.style.backgroundColor='transparent'"
    >
        <span style="font-size: 16px;">📝</span>
        <div style="display: flex; flex-direction: column; gap: 2px;">
            <span style="font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px;">LOGS</span>
            <span style="font-weight: 600; color: #9ca3af;">${data.logs.length}</span>
        </div>
        ${
        hasErrors
            ? `
        <span
            style="position: absolute; top: 4px; right: 4px; width: 8px; height: 8px; background-color: #ef4444; border-radius: 50%; border: 2px solid #1f2937;"
        ></span>
        `
            : ''
    }
    </a>

    <!-- SQL -->
    <a
        href="/_devtools?panel=sql"
        style="display: flex; align-items: center; gap: 8px; color: white; text-decoration: none; padding: 8px 12px; border-radius: 6px; transition: background-color 0.2s;"
        onmouseover="this.style.backgroundColor='#374151'"
        onmouseout="this.style.backgroundColor='transparent'"
    >
        <span style="font-size: 16px;">🗄️</span>
        <div style="display: flex; flex-direction: column; gap: 2px;">
            <span style="font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px;">SQL</span>
            <span style="font-weight: 600; color: #9ca3af;">${data.queries.length}</span>
        </div>
    </a>

    <!-- Queue -->
    <a
        href="/_devtools?panel=queue"
        style="display: flex; align-items: center; gap: 8px; color: white; text-decoration: none; padding: 8px 12px; border-radius: 6px; transition: background-color 0.2s;"
        onmouseover="this.style.backgroundColor='#374151'"
        onmouseout="this.style.backgroundColor='transparent'"
    >
        <span style="font-size: 16px;">📬</span>
        <div style="display: flex; flex-direction: column; gap: 2px;">
            <span style="font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px;">QUEUE</span>
            <span style="font-weight: 600; color: #9ca3af;">${data.queue.length}</span>
        </div>
    </a>

    <!-- Mail -->
    <a
        href="/_devtools?panel=mail"
        style="display: flex; align-items: center; gap: 8px; color: white; text-decoration: none; padding: 8px 12px; border-radius: 6px; transition: background-color 0.2s;"
        onmouseover="this.style.backgroundColor='#374151'"
        onmouseout="this.style.backgroundColor='transparent'"
    >
        <span style="font-size: 16px;">✉️</span>
        <div style="display: flex; flex-direction: column; gap: 2px;">
            <span style="font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px;">MAIL</span>
            <span style="font-weight: 600; color: #9ca3af;">${data.mails.length}</span>
        </div>
    </a>

    <!-- Spacer -->
    <div style="flex: 1;"></div>

    <!-- Close button -->
    <button
        onclick="document.getElementById('lockness-debug-toolbar').style.display='none'"
        style="background-color: transparent; border: none; color: #9ca3af; cursor: pointer; padding: 4px 8px; border-radius: 4px; font-size: 18px;"
        title="Hide toolbar"
    >
        ✕
    </button>
</div>
    `.trim()
}
