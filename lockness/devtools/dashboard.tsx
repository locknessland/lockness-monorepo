/**
 * Devtools Dashboard UI
 * Web-based debug dashboard with Tailwind CSS
 */

import type { Context } from 'hono'
import { collector } from './collector.ts'
import type {
    DeprecationEntry,
    LogEntry,
    RequestInfo,
    RouteInfo,
} from './types.ts'

// Embedded Tailwind CSS (minimal production build)
const TAILWIND_CSS = `
*,::before,::after{box-sizing:border-box;border-width:0;border-style:solid;border-color:#e5e7eb}::before,::after{--tw-content:''}html{line-height:1.5;-webkit-text-size-adjust:100%;-moz-tab-size:4;tab-size:4;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans",sans-serif,"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol","Noto Color Emoji"}body{margin:0;line-height:inherit}h1,h2,h3{font-size:inherit;font-weight:inherit}a{color:inherit;text-decoration:inherit}button{font-family:inherit;font-size:100%;font-weight:inherit;line-height:inherit;color:inherit;margin:0;padding:0;background-color:transparent;background-image:none}table{text-indent:0;border-color:inherit;border-collapse:collapse}input{font-family:inherit;font-size:100%;font-weight:inherit;line-height:inherit;color:inherit;margin:0;padding:0}::-webkit-inner-spin-button,::-webkit-outer-spin-button{height:auto}[type='search']{-webkit-appearance:textfield;outline-offset:-2px}::-webkit-search-decoration{-webkit-appearance:none}svg{display:block;vertical-align:middle}*,::before,::after{--tw-border-spacing-x:0;--tw-border-spacing-y:0;--tw-translate-x:0;--tw-translate-y:0;--tw-rotate:0;--tw-skew-x:0;--tw-skew-y:0;--tw-scale-x:1;--tw-scale-y:1;--tw-scroll-snap-strictness:proximity;--tw-ring-offset-width:0px;--tw-ring-offset-color:#fff;--tw-ring-color:rgb(59 130 246/0.5);--tw-ring-offset-shadow:0 0 #0000;--tw-ring-shadow:0 0 #0000;--tw-shadow:0 0 #0000;--tw-shadow-colored:0 0 #0000}
.container{width:100%}@media(min-width:640px){.container{max-width:640px}}@media(min-width:768px){.container{max-width:768px}}@media(min-width:1024px){.container{max-width:1024px}}@media(min-width:1280px){.container{max-width:1280px}}@media(min-width:1536px){.container{max-width:1536px}}
.fixed{position:fixed}.absolute{position:absolute}.relative{position:relative}.inset-0{inset:0}.top-0{top:0}.left-0{left:0}.z-10{z-index:10}.m-0{margin:0}.mx-auto{margin-left:auto;margin-right:auto}.mb-2{margin-bottom:.5rem}.mb-4{margin-bottom:1rem}.mb-6{margin-bottom:1.5rem}.mt-2{margin-top:.5rem}.mt-4{margin-top:1rem}.block{display:block}.inline-block{display:inline-block}.flex{display:flex}.inline-flex{display:inline-flex}.grid{display:grid}.hidden{display:none}.h-4{height:1rem}.h-6{height:1.5rem}.h-full{height:100%}.h-screen{height:100vh}.w-4{width:1rem}.w-6{width:1.5rem}.w-full{width:100%}.min-w-0{min-width:0}.max-w-7xl{max-width:80rem}.flex-1{flex:1 1 0%}.flex-shrink-0{flex-shrink:0}.cursor-pointer{cursor:pointer}.grid-cols-1{grid-template-columns:repeat(1,minmax(0,1fr))}.flex-col{flex-direction:column}.items-start{align-items:flex-start}.items-center{align-items:center}.justify-between{justify-content:space-between}.gap-2{gap:.5rem}.gap-3{gap:.75rem}.gap-4{gap:1rem}.gap-6{gap:1.5rem}.space-x-2>:not([hidden])~:not([hidden]){--tw-space-x-reverse:0;margin-right:calc(.5rem*var(--tw-space-x-reverse));margin-left:calc(.5rem*calc(1 - var(--tw-space-x-reverse)))}.space-y-4>:not([hidden])~:not([hidden]){--tw-space-y-reverse:0;margin-top:calc(1rem*calc(1 - var(--tw-space-y-reverse)));margin-bottom:calc(1rem*var(--tw-space-y-reverse))}.overflow-auto{overflow:auto}.overflow-hidden{overflow:hidden}.overflow-x-auto{overflow-x:auto}.truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rounded{border-radius:.25rem}.rounded-lg{border-radius:.5rem}.rounded-md{border-radius:.375rem}.rounded-full{border-radius:9999px}.border{border-width:1px}.border-b{border-bottom-width:1px}.border-gray-200{--tw-border-opacity:1;border-color:rgb(229 231 235/var(--tw-border-opacity))}.border-gray-700{--tw-border-opacity:1;border-color:rgb(55 65 81/var(--tw-border-opacity))}.bg-white{--tw-bg-opacity:1;background-color:rgb(255 255 255/var(--tw-bg-opacity))}.bg-gray-50{--tw-bg-opacity:1;background-color:rgb(249 250 251/var(--tw-bg-opacity))}.bg-gray-800{--tw-bg-opacity:1;background-color:rgb(31 41 55/var(--tw-bg-opacity))}.bg-gray-900{--tw-bg-opacity:1;background-color:rgb(17 24 39/var(--tw-bg-opacity))}.bg-blue-500{--tw-bg-opacity:1;background-color:rgb(59 130 246/var(--tw-bg-opacity))}.bg-blue-600{--tw-bg-opacity:1;background-color:rgb(37 99 235/var(--tw-bg-opacity))}.bg-green-500{--tw-bg-opacity:1;background-color:rgb(34 197 94/var(--tw-bg-opacity))}.bg-yellow-500{--tw-bg-opacity:1;background-color:rgb(234 179 8/var(--tw-bg-opacity))}.bg-red-500{--tw-bg-opacity:1;background-color:rgb(239 68 68/var(--tw-bg-opacity))}.p-2{padding:.5rem}.p-3{padding:.75rem}.p-4{padding:1rem}.p-6{padding:1.5rem}.px-2{padding-left:.5rem;padding-right:.5rem}.px-3{padding-left:.75rem;padding-right:.75rem}.px-4{padding-left:1rem;padding-right:1rem}.px-6{padding-left:1.5rem;padding-right:1.5rem}.py-1{padding-top:.25rem;padding-bottom:.25rem}.py-2{padding-top:.5rem;padding-bottom:.5rem}.py-3{padding-top:.75rem;padding-bottom:.75rem}.py-4{padding-top:1rem;padding-bottom:1rem}.py-6{padding-top:1.5rem;padding-bottom:1.5rem}.text-left{text-align:left}.text-center{text-align:center}.text-xs{font-size:.75rem;line-height:1rem}.text-sm{font-size:.875rem;line-height:1.25rem}.text-base{font-size:1rem;line-height:1.5rem}.text-lg{font-size:1.125rem;line-height:1.75rem}.text-xl{font-size:1.25rem;line-height:1.75rem}.text-2xl{font-size:1.5rem;line-height:2rem}.text-3xl{font-size:1.875rem;line-height:2.25rem}.font-medium{font-weight:500}.font-semibold{font-weight:600}.font-bold{font-weight:700}.leading-tight{line-height:1.25}.tracking-tight{letter-spacing:-0.025em}.text-white{--tw-text-opacity:1;color:rgb(255 255 255/var(--tw-text-opacity))}.text-gray-500{--tw-text-opacity:1;color:rgb(107 114 128/var(--tw-text-opacity))}.text-gray-600{--tw-text-opacity:1;color:rgb(75 85 99/var(--tw-text-opacity))}.text-gray-700{--tw-text-opacity:1;color:rgb(55 65 81/var(--tw-text-opacity))}.text-gray-900{--tw-text-opacity:1;color:rgb(17 24 39/var(--tw-text-opacity))}.text-blue-600{--tw-text-opacity:1;color:rgb(37 99 235/var(--tw-text-opacity))}.text-green-600{--tw-text-opacity:1;color:rgb(22 163 74/var(--tw-text-opacity))}.text-yellow-600{--tw-text-opacity:1;color:rgb(202 138 4/var(--tw-text-opacity))}.text-red-600{--tw-text-opacity:1;color:rgb(220 38 38/var(--tw-text-opacity))}.shadow{--tw-shadow:0 1px 3px 0 rgb(0 0 0/0.1),0 1px 2px -1px rgb(0 0 0/0.1);--tw-shadow-colored:0 1px 3px 0 var(--tw-shadow-color),0 1px 2px -1px var(--tw-shadow-color);box-shadow:var(--tw-ring-offset-shadow,0 0 #0000),var(--tw-ring-shadow,0 0 #0000),var(--tw-shadow)}.shadow-sm{--tw-shadow:0 1px 2px 0 rgb(0 0 0/0.05);--tw-shadow-colored:0 1px 2px 0 var(--tw-shadow-color);box-shadow:var(--tw-ring-offset-shadow,0 0 #0000),var(--tw-ring-shadow,0 0 #0000),var(--tw-shadow)}.shadow-lg{--tw-shadow:0 10px 15px -3px rgb(0 0 0/0.1),0 4px 6px -4px rgb(0 0 0/0.1);--tw-shadow-colored:0 10px 15px -3px var(--tw-shadow-color),0 4px 6px -4px var(--tw-shadow-color);box-shadow:var(--tw-ring-offset-shadow,0 0 #0000),var(--tw-ring-shadow,0 0 #0000),var(--tw-shadow)}.transition{transition-property:color,background-color,border-color,text-decoration-color,fill,stroke,opacity,box-shadow,transform,filter,backdrop-filter;transition-timing-function:cubic-bezier(.4,0,.2,1);transition-duration:150ms}.hover\\:bg-gray-100:hover{--tw-bg-opacity:1;background-color:rgb(243 244 246/var(--tw-bg-opacity))}.hover\\:bg-gray-700:hover{--tw-bg-opacity:1;background-color:rgb(55 65 81/var(--tw-bg-opacity))}.hover\\:bg-blue-600:hover{--tw-bg-opacity:1;background-color:rgb(37 99 235/var(--tw-bg-opacity))}.focus\\:outline-none:focus{outline:2px solid transparent;outline-offset:2px}@media(min-width:768px){.md\\:grid-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}.md\\:grid-cols-4{grid-template-columns:repeat(4,minmax(0,1fr))}}
`

// HTML component helpers
const badge = (text: string, color: string = 'gray') => {
    const colors: Record<string, string> = {
        gray: 'bg-gray-100 text-gray-700',
        blue: 'bg-blue-500 text-white',
        green: 'bg-green-500 text-white',
        yellow: 'bg-yellow-500 text-white',
        red: 'bg-red-500 text-white',
    }
    return `<span class="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${
        colors[color] || colors.gray
    }">${text}</span>`
}

const card = (
    title: string,
    value: number,
    subtitle: string,
    color: string = 'blue',
) => `
    <div class="bg-white rounded-lg shadow p-6">
        <div class="flex items-center justify-between mb-2">
            <h3 class="text-sm font-medium text-gray-600">${title}</h3>
            ${badge(subtitle, color)}
        </div>
        <div class="text-3xl font-bold text-gray-900">${value}</div>
    </div>
`

const tab = (name: string, active: boolean, count?: number) => {
    const countBadge = count !== undefined
        ? `<span class="ml-2 px-2 py-1 text-xs rounded-full ${
            active ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
        }">${count}</span>`
        : ''

    return `
        <button
            onclick="showPanel('${name.toLowerCase()}')"
            class="px-4 py-3 text-sm font-medium border-b-2 transition ${
        active
            ? 'border-blue-600 text-blue-600'
            : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
    }"
        >
            ${name}${countBadge}
        </button>
    `
}

export function renderDashboard(c: Context) {
    const data = collector.getAllData()
    const activePanel = c.req.query('panel') || 'overview'

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

        // Auto-refresh every 5 seconds if on dashboard
        setInterval(() => {
            if (!document.hidden) {
                window.location.reload()
            }
        }, 5000)
    </script>
</head>
<body class="bg-gray-50">
    <!-- Header -->
    <header class="bg-gray-900 text-white shadow-lg">
        <div class="max-w-7xl mx-auto px-6 py-4">
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                    <h1 class="text-2xl font-bold">🔧 Lockness Devtools</h1>
                    ${badge('Development', 'green')}
                </div>
                <button onclick="clearData()" class="px-4 py-2 bg-red-500 hover:bg-red-600 rounded-md text-sm font-medium transition">
                    Clear Data
                </button>
            </div>
        </div>
    </header>

    <!-- Tabs -->
    <div class="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div class="max-w-7xl mx-auto px-6">
            <nav class="flex space-x-2 overflow-x-auto">
                ${tab('Overview', activePanel === 'overview')}
                ${tab('Routes', activePanel === 'routes', data.routes.length)}
                ${
        tab('Requests', activePanel === 'requests', data.requests.length)
    }
                ${tab('Logs', activePanel === 'logs', data.logs.length)}
                ${tab('SQL', activePanel === 'sql', data.queries.length)}
                ${tab('Queue', activePanel === 'queue', data.queue.length)}
                ${tab('Mail', activePanel === 'mail', data.mails.length)}
                ${
        tab(
            'Performance',
            activePanel === 'performance',
            data.performance.length,
        )
    }
                ${
        tab(
            'Deprecations',
            activePanel === 'deprecations',
            data.deprecations.length,
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
                <div class="bg-white rounded-lg shadow p-6">
                    <h2 class="text-lg font-semibold mb-4">Recent Requests</h2>
                    <div class="space-y-2">
                        ${
        data.requests.slice(0, 5).map((req: RequestInfo) => `
                            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                <div class="flex items-center gap-3">
                                    ${
            badge(req.method, req.method === 'GET' ? 'blue' : 'green')
        }
                                    <span class="text-sm font-medium">${req.path}</span>
                                    ${
            req.routeName
                ? `<span class="text-xs text-blue-600 font-medium">(${req.routeName})</span>`
                : ''
        }
                                </div>
                                <span class="text-xs text-gray-500">${
            req.duration?.toFixed(2) || '-'
        }ms</span>
                            </div>
                        `).join('')
    }
                    </div>
                </div>

                <!-- Recent Logs -->
                <div class="bg-white rounded-lg shadow p-6">
                    <h2 class="text-lg font-semibold mb-4">Recent Logs</h2>
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
                            <div class="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                                ${
                badge(log.level.toUpperCase(), colors[log.level])
            }
                                <p class="text-sm text-gray-700 flex-1">${log.message}</p>
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
            <div class="bg-white rounded-lg shadow overflow-hidden">
                <table class="w-full">
                    <thead class="bg-gray-50 border-b border-gray-200">
                        <tr>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Path</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Controller</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Middlewares</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200">
                        ${
        data.routes.map((route: RouteInfo) => `
                            <tr class="hover:bg-gray-50">
                                <td class="px-6 py-4 whitespace-nowrap">
                                    ${
            badge(route.method, route.method === 'GET' ? 'blue' : 'green')
        }
                                </td>
                                <td class="px-6 py-4 font-mono text-sm">${route.path}</td>
                                <td class="px-6 py-4 text-sm text-blue-600 font-medium">${
            route.name || '-'
        }</td>
                                <td class="px-6 py-4 text-sm text-gray-600">${
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
            <div class="bg-white rounded-lg shadow p-6">
                <h2 class="text-xl font-semibold mb-4">Request History</h2>
                <p class="text-gray-600">Captured ${data.requests.length} requests</p>
            </div>
        </div>

        <div data-panel="logs" class="${
        activePanel !== 'logs' ? 'hidden' : ''
    }">
            <div class="bg-white rounded-lg shadow p-6">
                <h2 class="text-xl font-semibold mb-4">Application Logs</h2>
                <p class="text-gray-600">${data.logs.length} log entries</p>
            </div>
        </div>

        <div data-panel="sql" class="${activePanel !== 'sql' ? 'hidden' : ''}">
            <div class="bg-white rounded-lg shadow p-6">
                <h2 class="text-xl font-semibold mb-4">SQL Queries</h2>
                <p class="text-gray-600">${data.queries.length} queries logged</p>
            </div>
        </div>

        <div data-panel="queue" class="${
        activePanel !== 'queue' ? 'hidden' : ''
    }">
            <div class="bg-white rounded-lg shadow p-6">
                <h2 class="text-xl font-semibold mb-4">Background Queue</h2>
                <p class="text-gray-600">${data.queue.length} jobs</p>
            </div>
        </div>

        <div data-panel="mail" class="${
        activePanel !== 'mail' ? 'hidden' : ''
    }">
            <div class="bg-white rounded-lg shadow p-6">
                <h2 class="text-xl font-semibold mb-4">Mail Log</h2>
                <p class="text-gray-600">${data.mails.length} emails sent</p>
            </div>
        </div>

        <div data-panel="performance" class="${
        activePanel !== 'performance' ? 'hidden' : ''
    }">
            <div class="bg-white rounded-lg shadow p-6">
                <h2 class="text-xl font-semibold mb-4">Performance Metrics</h2>
                <p class="text-gray-600">${data.performance.length} metrics collected</p>
            </div>
        </div>

        <!-- Deprecations Panel -->
        <div data-panel="deprecations" class="${
        activePanel !== 'deprecations' ? 'hidden' : ''
    }">
            <div class="bg-white rounded-lg shadow overflow-hidden">
                <div class="p-6 border-b border-gray-200">
                    <h2 class="text-xl font-semibold">Deprecation Notices</h2>
                    <p class="text-sm text-gray-500 mt-1">Found ${data.deprecations.length} deprecations triggered by packages.</p>
                </div>
                <table class="w-full">
                    <thead class="bg-gray-50 border-b border-gray-200">
                        <tr>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Since</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Package</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Message</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stack</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-gray-200">
                        ${
        data.deprecations.map((dep: DeprecationEntry) => `
                            <tr class="hover:bg-gray-50 transition">
                                <td class="px-6 py-4 whitespace-nowrap text-sm font-mono text-blue-600">${dep.version}</td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${dep.pkg}</td>
                                <td class="px-6 py-4 text-sm text-gray-600">${dep.message}</td>
                                <td class="px-6 py-4 text-xs font-mono text-gray-400">
                                    <details class="cursor-pointer">
                                        <summary class="hover:text-blue-500">View Stack</summary>
                                        <pre class="mt-2 whitespace-pre-wrap max-w-lg overflow-auto">${
            dep.stack || 'No stack trace available'
        }</pre>
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
