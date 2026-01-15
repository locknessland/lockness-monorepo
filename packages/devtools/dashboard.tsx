/**
 * Devtools Dashboard UI
 * Web-based debug dashboard with Tailwind CSS
 */

import type { Context } from '@lockness/core'
import { collector } from './collector.ts'
import type {
    DeprecationEntry,
    LogEntry,
    RequestInfo,
    RouteInfo,
} from './types.ts'

// Embedded Tailwind CSS (minimal production build)
const TAILWIND_CSS = `
*,::before,::after{box-sizing:border-box;border-width:0;border-style:solid;border-color:rgba(255,255,255,0.08)}::before,::after{--tw-content:''}html{line-height:1.5;-webkit-text-size-adjust:100%;-moz-tab-size:4;tab-size:4;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans",sans-serif,"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol","Noto Color Emoji"}
body{margin:0;line-height:inherit;background-color:#0f1115;color:#e5e7eb}
h1,h2,h3{font-size:inherit;font-weight:inherit;color:#e5e7eb}
a{color:inherit;text-decoration:inherit}
button{font-family:inherit;font-size:100%;font-weight:inherit;line-height:inherit;color:inherit;margin:0;padding:0;background-color:transparent;background-image:none}
table{text-indent:0;border-color:rgba(255,255,255,0.08);border-collapse:collapse}
th{color:#9ca3af}
td{color:#e5e7eb}
.container{width:100%}@media(min-width:640px){.container{max-width:640px}}@media(min-width:768px){.container{max-width:768px}}@media(min-width:1024px){.container{max-width:1024px}}@media(min-width:1280px){.container{max-width:1280px}}@media(min-width:1536px){.container{max-width:1536px}}
.fixed{position:fixed}.absolute{position:absolute}.relative{position:relative}.inset-0{inset:0}.top-0{top:0}.left-0{left:0}.z-10{z-index:10}.m-0{margin:0}.mx-auto{margin-left:auto;margin-right:auto}.mb-2{margin-bottom:.5rem}.mb-4{margin-bottom:1rem}.mb-6{margin-bottom:1.5rem}.mt-2{margin-top:.5rem}.mt-4{margin-top:1rem}.block{display:block}.inline-block{display:inline-block}.flex{display:flex}.inline-flex{display:inline-flex}.grid{display:grid}.hidden{display:none}.h-4{height:1rem}.h-6{height:1.5rem}.h-full{height:100%}.h-screen{height:100vh}.w-4{width:1rem}.w-6{width:1.5rem}.w-full{width:100%}.min-w-0{min-width:0}.max-w-7xl{max-width:80rem}.flex-1{flex:1 1 0%}.flex-shrink-0{flex-shrink:0}.cursor-pointer{cursor:pointer}.grid-cols-1{grid-template-columns:repeat(1,minmax(0,1fr))}.flex-col{flex-direction:column}.items-start{align-items:flex-start}.items-center{align-items:center}.justify-between{justify-content:space-between}.gap-2{gap:.5rem}.gap-3{gap:.75rem}.gap-4{gap:1rem}.gap-6{gap:1.5rem}.space-x-2>:not([hidden])~:not([hidden]){--tw-space-x-reverse:0;margin-right:calc(.5rem*var(--tw-space-x-reverse));margin-left:calc(.5rem*calc(1 - var(--tw-space-x-reverse)))}.space-y-4>:not([hidden])~:not([hidden]){--tw-space-y-reverse:0;margin-top:calc(1rem*calc(1 - var(--tw-space-y-reverse)));margin-bottom:calc(1rem*var(--tw-space-y-reverse))}.overflow-auto{overflow:auto}.overflow-hidden{overflow:hidden}.overflow-x-auto{overflow-x:auto}.truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rounded{border-radius:.25rem}.rounded-lg{border-radius:.5rem}.rounded-md{border-radius:.375rem}.rounded-full{border-radius:9999px}.border{border-width:1px}.border-b{border-bottom-width:1px}.border-gray-200{--tw-border-opacity:1;border-color:rgba(255,255,255,0.08)}.border-gray-700{--tw-border-opacity:1;border-color:rgba(255,255,255,0.08)}.bg-white{background-color:#0f1115}.bg-gray-50{background-color:#181a20}.bg-gray-800{background-color:#1f2937}.bg-gray-900{background-color:#0f1115}.bg-blue-500{background-color:#6366f1}.bg-blue-600{background-color:#4f46e5}.bg-green-500{background-color:#10b981}.bg-yellow-500{background-color:#f59e0b}.bg-red-500{background-color:#ef4444}.p-2{padding:.5rem}.p-3{padding:.75rem}.p-4{padding:1rem}.p-6{padding:1.5rem}.px-2{padding-left:.5rem;padding-right:.5rem}.px-3{padding-left:.75rem;padding-right:.75rem}.px-4{padding-left:1rem;padding-right:1rem}.px-6{padding-left:1.5rem;padding-right:1.5rem}.py-1{padding-top:.25rem;padding-bottom:.25rem}.py-2{padding-top:.5rem;padding-bottom:.5rem}.py-3{padding-top:.75rem;padding-bottom:.75rem}.py-4{padding-top:1rem;padding-bottom:1rem}.py-6{padding-top:1.5rem;padding-bottom:1.5rem}.text-left{text-align:left}.text-center{text-align:center}.text-xs{font-size:.75rem;line-height:1rem}.text-sm{font-size:.875rem;line-height:1.25rem}.text-base{font-size:1rem;line-height:1.5rem}.text-lg{font-size:1.125rem;line-height:1.75rem}.text-xl{font-size:1.25rem;line-height:1.75rem}.text-2xl{font-size:1.5rem;line-height:2rem}.text-3xl{font-size:1.875rem;line-height:2.25rem}.font-medium{font-weight:500}.font-semibold{font-weight:600}.font-bold{font-weight:700}.leading-tight{line-height:1.25}.tracking-tight{letter-spacing:-0.025em}.text-white{color:#ffffff}.text-gray-500{color:#9ca3af}.text-gray-600{color:#94a3b8}.text-gray-700{color:#e5e7eb}.text-gray-900{color:#ffffff}.text-blue-600{color:#818cf8}.text-green-600{color:#34d399}.text-yellow-600{color:#fbbf24}.text-red-600{color:#f87171}.shadow{box-shadow:0 4px 6px -1px rgba(0,0,0,0.1),0 2px 4px -1px rgba(0,0,0,0.06)}.shadow-sm{box-shadow:0 1px 2px 0 rgba(0,0,0,0.05)}.shadow-lg{box-shadow:0 10px 15px -3px rgba(0,0,0,0.1),0 4px 6px -2px rgba(0,0,0,0.05)}.transition{transition-property:all;transition-timing-function:cubic-bezier(.4,0,.2,1);transition-duration:150ms}.hover\\:bg-gray-100:hover{background-color:rgba(255,255,255,0.05)}.hover\\:bg-gray-700:hover{background-color:#374151}.hover\\:bg-blue-600:hover{background-color:#4338ca}.focus\\:outline-none:focus{outline:2px solid transparent;outline-offset:2px}@media(min-width:768px){.md\\:grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}.md\\:grid-cols-4{grid-template-columns:repeat(4,minmax(0,1fr))}}
/* Custom overrides */
.card-bg { background-color: #181a20; border: 1px solid rgba(255,255,255,0.08); }
.hover-row:hover { background-color: rgba(255,255,255,0.03); }
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
`

// HTML component helpers
const badge = (text: string, color: string = 'gray') => {
    const colors: Record<string, string> = {
        gray:
            'bg-[#181a20] text-gray-400 border border-[rgba(255,255,255,0.08)]',
        blue: 'bg-indigo-900/30 text-indigo-400 border border-indigo-500/20',
        green: 'bg-green-900/30 text-green-400 border border-green-500/20',
        yellow: 'bg-yellow-900/30 text-yellow-400 border border-yellow-500/20',
        red: 'bg-red-900/30 text-red-400 border border-red-500/20',
    }
    return `<span class="inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold ${
        colors[color] || colors.gray
    }">${text}</span>`
}

const card = (
    title: string,
    value: number,
    subtitle: string,
    color: string = 'blue',
) => `
    <div class="card-bg rounded-lg p-6 shadow-sm">
        <div class="flex items-center justify-between mb-2">
            <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider">${title}</h3>
            ${badge(subtitle, color)}
        </div>
        <div class="text-3xl font-bold text-white font-mono">${value}</div>
    </div>
`

const tab = (
    name: string,
    active: boolean,
    count?: number,
    iconPath?: string,
) => {
    const countBadge = count !== undefined
        ? `<span class="ml-2.5 px-2 py-0.5 text-[10px] rounded-md font-mono transition-colors ${
            active
                ? 'bg-indigo-500/20 text-indigo-300'
                : 'bg-[#0f1115] border border-[rgba(255,255,255,0.08)] text-gray-500 group-hover:bg-[#181a20] group-hover:text-gray-400'
        }">${count}</span>`
        : ''

    const icon = iconPath
        ? `<svg class="w-4 h-4 mr-2.5 ${
            active
                ? 'text-indigo-400'
                : 'text-gray-500 group-hover:text-gray-400'
        }" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${iconPath}"/></svg>`
        : ''

    return `
        <button
            onclick="showPanel('${name.toLowerCase()}')"
            class="group flex items-center px-5 py-3.5 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
        active
            ? 'border-indigo-500 text-white bg-[#181a20]/50'
            : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-[rgba(255,255,255,0.08)] hover:bg-[#181a20]/30'
    }"
        >
            ${icon}${name}${countBadge}
        </button>
    `
}

export function renderDashboard(c: Context) {
    const data = collector.getAllData()
    const activePanel = c.req.query('panel') || 'overview'
    const requestId = c.req.query('requestId')
    const selectedRequest = requestId
        ? data.requests.find((r: RequestInfo) => r.id === requestId)
        : null

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🔧 Lockness Devtools</title>
    <style>${TAILWIND_CSS}</style>
    <script>
        function showPanel(panel) {
            document.querySelectorAll('[data-panel]').forEach(el => {
                el.classList.add('hidden')
            })
            document.querySelector('[data-panel="' + panel + '"]')?.classList.remove('hidden')
            
            // Update URL
            const url = new URL(window.location)
            url.searchParams.set('panel', panel)
            window.history.pushState({}, '', url)
        }

        function clearData() {
            if (confirm('Clear all collected data?')) {
                fetch('/__devtools/clear', { method: 'POST' })
                    .then(() => window.location.reload())
            }
        }
    </script>
</head>
<body class="bg-[#0f1115] text-gray-300 font-sans antialiased min-h-screen">
    <!-- Header -->
    <header class="bg-[#0f1115]/80 backdrop-blur-md sticky top-0 z-50 border-b border-[rgba(255,255,255,0.08)]">
        <div class="max-w-7xl mx-auto px-6 py-4">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-4">
                    <h1 class="text-xl font-bold flex items-center gap-2">
                         <span class="text-indigo-400">⚡</span> Lockness <span class="text-gray-500 font-normal">Devtools</span>
                    </h1>
                    ${badge('Development', 'green')}
                </div>
                <div class="flex items-center gap-3">
                    <a href="/" class="group flex items-center px-3 py-1.5 text-xs font-semibold text-gray-400 bg-[#181a20] border border-[rgba(255,255,255,0.08)] rounded-md hover:text-white hover:border-indigo-500/30 transition-all">
                        <svg class="w-3.5 h-3.5 mr-2 text-gray-500 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
                        Back to App
                    </a>
                    <button onclick="clearData()" class="group flex items-center px-3 py-1.5 bg-red-500/5 hover:bg-red-500/10 text-red-500/70 hover:text-red-400 border border-red-500/10 hover:border-red-500/30 rounded-md text-xs font-semibold transition-all">
                        <svg class="w-3.5 h-3.5 mr-2 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        Clear Data
                    </button>
                </div>
            </div>
        </div>
    </header>
    
    <!-- Tabs -->
    <div class="bg-[#0f1115] border-b border-[rgba(255,255,255,0.08)] sticky top-0 z-10 backdrop-blur-md bg-opacity-95">
        <div class="max-w-7xl mx-auto px-6">
            <nav class="flex space-x-1 overflow-x-auto no-scrollbar">
                ${
        tab(
            'Overview',
            activePanel === 'overview',
            undefined,
            'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z',
        )
    }
                ${
        tab(
            'Routes',
            activePanel === 'routes',
            data.routes.length,
            'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7',
        )
    }
                ${
        tab(
            'Requests',
            activePanel === 'requests',
            data.requests.length,
            'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9',
        )
    }
                ${
        tab(
            'Logs',
            activePanel === 'logs',
            data.logs.length,
            'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
        )
    }
                ${
        tab(
            'SQL',
            activePanel === 'sql',
            data.queries.length,
            'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4',
        )
    }
                ${
        tab(
            'Queue',
            activePanel === 'queue',
            data.queue.length,
            'M4 6h16M4 12h16M4 18h16',
        )
    }
                ${
        tab(
            'Mail',
            activePanel === 'mail',
            data.mails.length,
            'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
        )
    }
                ${
        tab(
            'Performance',
            activePanel === 'performance',
            data.performance.length,
            'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
        )
    }
                ${
        tab(
            'Deprecations',
            activePanel === 'deprecations',
            data.deprecations.length,
            'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
        )
    }
            </nav>
        </div>
    </div>

    <!-- Content -->
    <main class="max-w-7xl mx-auto px-6 py-6">
        <!-- Overview Panel -->
        <div data-panel="overview" class="${
        activePanel !== 'overview' ? 'hidden' : ''
    }">
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                ${
        card('Total Routes', data.routes.length, 'Registered', 'blue')
    }
                ${card('Requests', data.requests.length, 'Captured', 'green')}
                ${card('SQL Queries', data.queries.length, 'Logged', 'yellow')}
                ${
        card('Deprecations', data.deprecations.length, 'Notices', 'yellow')
    }
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <!-- Recent Requests -->
                <div class="card-bg rounded-lg p-6 shadow-sm">
                    <h2 class="text-sm font-semibold mb-4 text-gray-400 uppercase tracking-wider">Recent Requests</h2>
                    <div class="space-y-2">
                        ${
        data.requests.slice(0, 5).map((req: RequestInfo) => `
                            <div class="flex items-center justify-between p-3 hover-row rounded-lg transition border border-transparent hover:border-[rgba(255,255,255,0.05)] cursor-pointer" onclick="window.location.href='?panel=requests&requestId=${req.id}'">
                                <div class="flex items-center gap-3">
                                    ${
            badge(req.method, req.method === 'GET' ? 'blue' : 'green')
        }
                                    <span class="text-sm font-medium text-gray-300 font-mono">${req.path}</span>
                                    ${
            req.routeName
                ? `<span class="text-xs text-indigo-400/80 font-medium">(${req.routeName})</span>`
                : ''
        }
                                </div>
                                <span class="text-xs text-gray-600 font-mono">${
            req.duration?.toFixed(0) || '-'
        }ms</span>
                            </div>
                        `).join('')
    }
                    </div>
                </div>

                <!-- Recent Logs -->
                <div class="card-bg rounded-lg p-6 shadow-sm">
                    <h2 class="text-sm font-semibold mb-4 text-gray-400 uppercase tracking-wider">Recent Logs</h2>
                    <div class="space-y-2">
                        ${
        data.logs.slice(0, 5).map((log: LogEntry) => {
            const colors: Record<string, string> = {
                info: 'blue',
                warn: 'yellow',
                error: 'red',
                debug: 'gray',
            }
            return `
                            <div class="flex items-start gap-3 p-3 hover-row rounded-lg transition">
                                ${
                badge(log.level.toUpperCase(), colors[log.level])
            }
                                <p class="text-sm text-gray-400 flex-1 font-mono tracking-tight">${log.message}</p>
                            </div>
                        `
        }).join('')
    }
                    </div>
                </div>
            </div>
        </div>

        <!-- Routes Panel -->
        <div data-panel="routes" class="${
        activePanel !== 'routes' ? 'hidden' : ''
    }">
            <div class="card-bg rounded-lg overflow-hidden">
                <table class="w-full">
                    <thead class="bg-[#20232a] border-b border-[rgba(255,255,255,0.08)]">
                        <tr>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Path</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Controller</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Middlewares</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-[rgba(255,255,255,0.05)]">
                        ${
        data.routes.map((route: RouteInfo) => `
                            <tr class="hover-row transition">
                                <td class="px-6 py-4 whitespace-nowrap">
                                    ${
            badge(route.method, route.method === 'GET' ? 'blue' : 'green')
        }
                                </td>
                                <td class="px-6 py-4 font-mono text-sm text-gray-300">${route.path}</td>
                                <td class="px-6 py-4 text-sm text-indigo-400 font-medium">${
            route.name || '-'
        }</td>
                                <td class="px-6 py-4 text-sm text-gray-500 font-mono text-xs">${
            route.controller || '-'
        }</td>
                                <td class="px-6 py-4 text-sm">
                                    ${
            route.middlewares.map((m: string) => badge(m, 'gray')).join(' ')
        }
                                </td>
                            </tr>
                        `).join('')
    }
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Other panels... -->
        <div data-panel="requests" class="${
        activePanel !== 'requests' ? 'hidden' : ''
    }">
            ${
        selectedRequest
            ? `
                <div class="space-y-6">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-4">
                            <button onclick="showPanel('requests'); window.history.back()" class="p-2 hover:bg-[#2a2d35] rounded-full transition text-gray-400">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
                            </button>
                            <div>
                                <h2 class="text-xl font-bold flex items-center gap-2 text-white">
                                    ${
                badge(
                    selectedRequest.method,
                    selectedRequest.method === 'GET' ? 'blue' : 'green',
                )
            }
                                    <span class="font-mono text-gray-300 border-b border-gray-700 border-dashed pb-0.5">${selectedRequest.path}</span>
                                </h2>
                                <p class="text-sm text-gray-500 mt-1 flex items-center gap-2">
                                    <span class="w-2 h-2 rounded-full bg-gray-600"></span> ${
                new Date(selectedRequest.timestamp).toLocaleString()
            } 
                                    <span class="w-2 h-2 rounded-full bg-gray-600 ml-2"></span> ${
                selectedRequest.duration?.toFixed(2)
            }ms 
                                    <span class="w-2 h-2 rounded-full bg-gray-600 ml-2"></span> Status ${
                selectedRequest.statusCode || '-'
            }</p>
                            </div>
                        </div>
                        ${
                selectedRequest.statusCode
                    ? badge(
                        selectedRequest.statusCode.toString(),
                        selectedRequest.statusCode >= 400 ? 'red' : 'green',
                    )
                    : ''
            }
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div class="card-bg rounded-lg shadow-sm overflow-hidden">
                            <div class="px-6 py-4 border-b border-[rgba(255,255,255,0.08)] bg-[#20232a] flex justify-between items-center">
                                <h3 class="font-medium text-gray-300 text-sm uppercase tracking-wider">Headers</h3>
                            </div>
                            <div class="max-h-96 overflow-auto">
                                <table class="w-full text-sm">
                                    <tbody class="divide-y divide-[rgba(255,255,255,0.05)]">
                                        ${
                Object.entries(selectedRequest.headers || {}).map(([k, v]) => `
                                            <tr class="hover-row transition">
                                                <td class="px-4 py-2 font-medium text-gray-500 w-1/3 break-all text-xs uppercase">${k}</td>
                                                <td class="px-4 py-2 text-gray-300 break-all font-mono text-xs">${v}</td>
                                            </tr>
                                        `).join('')
            }
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div class="card-bg rounded-lg shadow-sm overflow-hidden">
                            <div class="px-6 py-4 border-b border-[rgba(255,255,255,0.08)] bg-[#20232a]">
                                <h3 class="font-medium text-gray-300 text-sm uppercase tracking-wider">Metadata</h3>
                            </div>
                            <div class="p-6 space-y-4">
                                <div>
                                    <span class="text-[10px] font-bold text-gray-600 uppercase tracking-widest">Controller</span>
                                    <p class="text-sm font-mono text-indigo-300 mt-1">${
                selectedRequest.controller || '-'
            }</p>
                                </div>
                                <div>
                                    <span class="text-[10px] font-bold text-gray-600 uppercase tracking-widest">Action</span>
                                    <p class="text-sm font-mono text-indigo-300 mt-1">${
                selectedRequest.action || '-'
            }</p>
                                </div>
                                <div>
                                    <span class="text-[10px] font-bold text-gray-600 uppercase tracking-widest">Route Name</span>
                                    <p class="text-sm font-mono text-gray-400 mt-1">${
                selectedRequest.routeName || '-'
            }</p>
                                </div>
                                <div>
                                    <span class="text-[10px] font-bold text-gray-600 uppercase tracking-widest">Component</span>
                                    <p class="text-sm font-mono text-purple-300 mt-1">${
                selectedRequest.component || '-'
            }</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    ${
                selectedRequest.body
                    ? `
                    <div class="card-bg rounded-lg shadow-sm overflow-hidden">
                        <div class="px-6 py-4 border-b border-[rgba(255,255,255,0.08)] bg-[#20232a]">
                            <h3 class="font-medium text-gray-300 text-sm uppercase tracking-wider">Body Payload</h3>
                        </div>
                        <div class="p-6 bg-[#0f1115] text-gray-300 overflow-auto border-t border-[rgba(255,255,255,0.08)]">
                            <pre class="text-xs font-mono leading-relaxed text-green-400">${
                        JSON.stringify(selectedRequest.body, null, 2)
                    }</pre>
                        </div>
                    </div>
                    `
                    : ''
            }
                </div>
            `
            : `
            <div class="card-bg rounded-lg shadow-sm overflow-hidden">
                <div class="px-6 py-4 border-b border-[rgba(255,255,255,0.08)] flex justify-between items-center bg-[#20232a]">
                    <h2 class="text-sm font-semibold text-gray-300 uppercase tracking-wider">Request History</h2>
                    <span class="text-xs text-gray-500 bg-[#0f1115] px-2 py-1 rounded-full border border-gray-800">${data.requests.length} total</span>
                </div>
                <table class="w-full">
                    <thead class="bg-[#1a1d23] border-b border-[rgba(255,255,255,0.08)]">
                        <tr>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Path</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                            <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-[rgba(255,255,255,0.05)]">
                        ${
                data.requests.slice().reverse().map((req: RequestInfo) => `
                            <tr class="hover-row cursor-pointer transition" onclick="window.location.href='?panel=requests&requestId=${req.id}'">
                                <td class="px-6 py-4 whitespace-nowrap">
                                    ${
                    badge(
                        (req.statusCode || '?').toString(),
                        !req.statusCode
                            ? 'gray'
                            : req.statusCode >= 500
                            ? 'red'
                            : req.statusCode >= 400
                            ? 'yellow'
                            : 'green',
                    )
                }
                                </td>
                                <td class="px-6 py-4 whitespace-nowrap">
                                    ${
                    badge(req.method, req.method === 'GET' ? 'blue' : 'green')
                }
                                </td>
                                <td class="px-6 py-4 text-sm font-mono text-gray-300 max-w-xs truncate" title="${req.path}">
                                    ${req.path}
                                </td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                                    ${req.duration?.toFixed(0) || '-'}ms
                                </td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    ${
                    new Date(req.timestamp).toLocaleTimeString([], {
                        hour12: false,
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                    })
                }
                                </td>
                                <td class="px-6 py-4 whitespace-nowrap text-right text-sm text-indigo-400 font-medium">
                                    View &rarr;
                                </td>
                            </tr>
                        `).join('')
            }
                    </tbody>
                </table>
            </div>
            `
    }
        </div>

        <div data-panel="logs" class="${
        activePanel !== 'logs' ? 'hidden' : ''
    }">
            <div class="card-bg rounded-lg shadow-sm overflow-hidden">
                <div class="px-6 py-4 border-b border-[rgba(255,255,255,0.08)] bg-[#20232a] flex justify-between items-center">
                    <h2 class="text-sm font-semibold text-gray-300 uppercase tracking-wider">Application Logs</h2>
                    <span class="text-xs text-gray-500 bg-[#0f1115] px-2 py-1 rounded-full border border-gray-800">${data.logs.length} entries</span>
                </div>
                <!-- TODO: Implement actual logs table -->
                <div class="p-12 text-center text-gray-500 italic">
                    Log viewer implementation coming soon...
                </div>
            </div>
        </div>

        <div data-panel="sql" class="${activePanel !== 'sql' ? 'hidden' : ''}">
            <div class="card-bg rounded-lg shadow-sm overflow-hidden">
                <div class="px-6 py-4 border-b border-[rgba(255,255,255,0.08)] bg-[#20232a] flex justify-between items-center">
                    <h2 class="text-sm font-semibold text-gray-300 uppercase tracking-wider">SQL Queries</h2>
                    <span class="text-xs text-gray-500 bg-[#0f1115] px-2 py-1 rounded-full border border-gray-800">${data.queries.length} queries</span>
                </div>
                <!-- TODO: Implement actual SQL table -->
                <div class="p-12 text-center text-gray-500 italic">
                    SQL viewer implementation coming soon...
                </div>
            </div>
        </div>

        <div data-panel="queue" class="${
        activePanel !== 'queue' ? 'hidden' : ''
    }">
            <div class="card-bg rounded-lg shadow-sm overflow-hidden">
                <div class="px-6 py-4 border-b border-[rgba(255,255,255,0.08)] bg-[#20232a] flex justify-between items-center">
                    <h2 class="text-sm font-semibold text-gray-300 uppercase tracking-wider">Background Queue</h2>
                    <span class="text-xs text-gray-500 bg-[#0f1115] px-2 py-1 rounded-full border border-gray-800">${data.queue.length} jobs</span>
                </div>
                <div class="p-12 text-center text-gray-500 italic">
                    Queue viewer implementation coming soon...
                </div>
            </div>
        </div>

        <div data-panel="mail" class="${
        activePanel !== 'mail' ? 'hidden' : ''
    }">
            <div class="card-bg rounded-lg shadow-sm overflow-hidden">
                <div class="px-6 py-4 border-b border-[rgba(255,255,255,0.08)] bg-[#20232a] flex justify-between items-center">
                    <h2 class="text-sm font-semibold text-gray-300 uppercase tracking-wider">Mail Log</h2>
                    <span class="text-xs text-gray-500 bg-[#0f1115] px-2 py-1 rounded-full border border-gray-800">${data.mails.length} emails</span>
                </div>
                <div class="p-12 text-center text-gray-500 italic">
                    Mail viewer implementation coming soon...
                </div>
            </div>
        </div>

        <div data-panel="performance" class="${
        activePanel !== 'performance' ? 'hidden' : ''
    }">
            <div class="card-bg rounded-lg shadow-sm overflow-hidden">
                <div class="px-6 py-4 border-b border-[rgba(255,255,255,0.08)] bg-[#20232a] flex justify-between items-center">
                    <h2 class="text-sm font-semibold text-gray-300 uppercase tracking-wider">Performance Metrics</h2>
                    <span class="text-xs text-gray-500 bg-[#0f1115] px-2 py-1 rounded-full border border-gray-800">${data.performance.length} metrics</span>
                </div>
                <div class="p-12 text-center text-gray-500 italic">
                    Performance viewer implementation coming soon...
                </div>
            </div>
        </div>

        <!-- Deprecations Panel -->
        <div data-panel="deprecations" class="${
        activePanel !== 'deprecations' ? 'hidden' : ''
    }">
            <div class="card-bg rounded-lg shadow-sm overflow-hidden">
                <div class="px-6 py-4 border-b border-[rgba(255,255,255,0.08)] bg-[#20232a] flex justify-between items-center">
                    <h2 class="text-sm font-semibold text-gray-300 uppercase tracking-wider">Deprecation Notices</h2>
                    <span class="text-xs text-gray-500 bg-[#0f1115] px-2 py-1 rounded-full border border-gray-800">${data.deprecations.length} notices</span>
                </div>
                <table class="w-full">
                    <thead class="bg-[#1a1d23] border-b border-[rgba(255,255,255,0.08)]">
                        <tr>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Since</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Package</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Message</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stack</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-[rgba(255,255,255,0.05)]">
                        ${
        data.deprecations.map((dep: DeprecationEntry) => `
                            <tr class="hover-row transition">
                                <td class="px-6 py-4 whitespace-nowrap text-sm font-mono text-blue-400">${dep.version}</td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-300">${dep.pkg}</td>
                                <td class="px-6 py-4 text-sm text-gray-400">${dep.message}</td>
                                <td class="px-6 py-4 text-xs font-mono text-gray-500">
                                    <details class="cursor-pointer group">
                                        <summary class="hover:text-blue-400 focus:outline-none transition">View Stack</summary>
                                        <div class="mt-2 p-3 bg-[#0f1115] rounded border border-[rgba(255,255,255,0.08)] overflow-auto max-w-lg max-h-48 scrollbar-thin">
                                            <pre class="whitespace-pre-wrap text-gray-500 leading-relaxed">${
            dep.stack || 'No stack trace available'
        }</pre>
                                        </div>
                                    </details>
                                </td>
                            </tr>
                        `).join('')
    }
                        ${
        data.deprecations.length === 0
            ? `
                            <tr>
                                <td colspan="4" class="px-6 py-12 text-center text-gray-500 italic">
                                    No deprecation notices found. Your code is clean! 🎉
                                </td>
                            </tr>
                        `
            : ''
    }
                    </tbody>
                </table>
            </div>
        </div>
    </main>

    <footer class="mt-12 py-6 text-center text-sm text-gray-500">
        <p>Lockness Devtools • Development Mode Only</p>
    </footer>
</body>
</html>
`

    return c.html(html)
}
