/** @jsx jsx */
/** @jsxImportSource hono/jsx */

import type { Context } from 'hono'
import { collector } from './collector.ts'
import { Layout } from './components/layout.tsx'
import { Badge } from './components/badge.tsx'
import { Card } from './components/card.tsx'
import { Tab } from './components/tab.tsx'

export function renderDashboard(c: Context) {
    const data = collector.getAllData()
    const activePanel = c.req.query('panel') || 'overview'

    return c.html(
        <Layout title="Lockness Devtools">
            {/* Header */}
            <div class="bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg">
                <div class="max-w-7xl mx-auto px-6 py-8">
                    <div class="flex items-center justify-between">
                        <div>
                            <h1 class="text-3xl font-bold">🔧 Lockness Devtools</h1>
                            <p class="mt-2 text-blue-100">Development Dashboard & Debugging Tools</p>
                        </div>
                        <div class="flex items-center gap-4">
                            <Badge color="green">Development</Badge>
                            <button
                                onclick="fetch('/_devtools/clear', { method: 'POST' }).then(() => location.reload())"
                                class="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium transition-colors"
                            >
                                Clear Data
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div class="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
                <div class="max-w-7xl mx-auto px-6">
                    <nav class="flex space-x-2 overflow-x-auto">
                        <Tab name="Overview" active={activePanel === 'overview'} />
                        <Tab name="Routes" active={activePanel === 'routes'} count={data.routes.length} />
                        <Tab name="Requests" active={activePanel === 'requests'} count={data.requests.length} />
                        <Tab name="Logs" active={activePanel === 'logs'} count={data.logs.length} />
                        <Tab name="SQL" active={activePanel === 'sql'} count={data.queries.length} />
                        <Tab name="Queue" active={activePanel === 'queue'} count={data.queue.length} />
                        <Tab name="Mail" active={activePanel === 'mail'} count={data.mails.length} />
                        <Tab name="Performance" active={activePanel === 'performance'} count={data.performance.length} />
                    </nav>
                </div>
            </div>

            {/* Content */}
            <div class="max-w-7xl mx-auto px-6 py-8">
                {/* Overview Panel */}
                <div data-panel="overview" class={activePanel === 'overview' ? 'active' : ''}>
                    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                        <Card title="Total Routes" value={data.routes.length} subtitle="Registered" color="blue" />
                        <Card title="Requests" value={data.requests.length} subtitle="Captured" color="green" />
                        <Card title="SQL Queries" value={data.queries.length} subtitle="Logged" color="yellow" />
                        <Card title="Log Entries" value={data.logs.length} subtitle="Stored" color="red" />
                    </div>

                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Recent Requests */}
                        <div class="bg-white rounded-lg shadow-sm p-6">
                            <h3 class="text-lg font-semibold mb-4">Recent Requests</h3>
                            <div class="space-y-2">
                                {data.requests.slice(0, 5).map((req) => (
                                    <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                        <div class="flex items-center gap-3">
                                            <Badge color={req.method === 'GET' ? 'blue' : 'green'}>{req.method}</Badge>
                                            <span class="text-sm font-medium">{req.path}</span>
                                        </div>
                                        <span class="text-xs text-gray-500">{req.duration?.toFixed(2) || '-'}ms</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Recent Logs */}
                        <div class="bg-white rounded-lg shadow-sm p-6">
                            <h3 class="text-lg font-semibold mb-4">Recent Logs</h3>
                            <div class="space-y-2">
                                {data.logs.slice(0, 5).map((log) => {
                                    const levelColors: Record<string, any> = {
                                        info: 'blue',
                                        warn: 'yellow',
                                        error: 'red',
                                        debug: 'gray',
                                    }
                                    return (
                                        <div class="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                                            <Badge color={levelColors[log.level]}>{log.level.toUpperCase()}</Badge>
                                            <p class="text-sm text-gray-700 flex-1">{log.message}</p>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Routes Panel */}
                <div data-panel="routes" class={activePanel === 'routes' ? 'active' : ''}>
                    <div class="bg-white rounded-lg shadow-sm overflow-hidden">
                        <table class="min-w-full divide-y divide-gray-200">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Path</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Controller</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Middlewares</th>
                                </tr>
                            </thead>
                            <tbody class="bg-white divide-y divide-gray-200">
                                {data.routes.map((route) => (
                                    <tr class="hover:bg-gray-50">
                                        <td class="px-6 py-4 whitespace-nowrap">
                                            <Badge color={route.method === 'GET' ? 'blue' : 'green'}>{route.method}</Badge>
                                        </td>
                                        <td class="px-6 py-4 font-mono text-sm">{route.path}</td>
                                        <td class="px-6 py-4 text-sm text-gray-600">{route.controller || '-'}</td>
                                        <td class="px-6 py-4 text-sm">
                                            {route.middlewares.map((m) => <Badge color="gray">{m}</Badge>)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Requests Panel */}
                <div data-panel="requests" class={activePanel === 'requests' ? 'active' : ''}>
                    <div class="space-y-4">
                        {data.requests.map((req) => (
                            <div class="bg-white rounded-lg shadow-sm p-6">
                                <div class="flex items-center justify-between mb-4">
                                    <div class="flex items-center gap-3">
                                        <Badge color={req.method === 'GET' ? 'blue' : 'green'}>{req.method}</Badge>
                                        <span class="font-mono text-sm">{req.path}</span>
                                        {req.statusCode && (
                                            <Badge color={req.statusCode < 400 ? 'green' : 'red'}>{req.statusCode}</Badge>
                                        )}
                                    </div>
                                    <span class="text-sm text-gray-500">{req.duration?.toFixed(2)}ms</span>
                                </div>
                                <div class="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <span class="font-medium text-gray-600">Headers:</span>
                                        <pre class="mt-1 p-2 bg-gray-50 rounded text-xs overflow-x-auto">
                                            {JSON.stringify(req.headers, null, 2)}
                                        </pre>
                                    </div>
                                    <div>
                                        <span class="font-medium text-gray-600">Query:</span>
                                        <pre class="mt-1 p-2 bg-gray-50 rounded text-xs overflow-x-auto">
                                            {JSON.stringify(req.query, null, 2)}
                                        </pre>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Logs Panel */}
                <div data-panel="logs" class={activePanel === 'logs' ? 'active' : ''}>
                    <div class="space-y-2">
                        {data.logs.map((log) => {
                            const levelColors: Record<string, any> = {
                                info: 'blue',
                                warn: 'yellow',
                                error: 'red',
                                debug: 'gray',
                            }
                            return (
                                <div class="bg-white rounded-lg shadow-sm p-4">
                                    <div class="flex items-start gap-3">
                                        <Badge color={levelColors[log.level]}>{log.level.toUpperCase()}</Badge>
                                        <div class="flex-1">
                                            <p class="text-sm text-gray-900">{log.message}</p>
                                            <p class="text-xs text-gray-500 mt-1">
                                                {new Date(log.timestamp).toLocaleString()}
                                            </p>
                                            {log.context && (
                                                <pre class="mt-2 p-2 bg-gray-50 rounded text-xs overflow-x-auto">
                                                    {JSON.stringify(log.context, null, 2)}
                                                </pre>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>

                {/* SQL Panel */}
                <div data-panel="sql" class={activePanel === 'sql' ? 'active' : ''}>
                    <div class="space-y-4">
                        {data.queries.map((query) => (
                            <div class="bg-white rounded-lg shadow-sm p-6">
                                <div class="flex items-center justify-between mb-2">
                                    <Badge color="yellow">SQL</Badge>
                                    <span class="text-sm text-gray-500">{query.duration.toFixed(2)}ms</span>
                                </div>
                                <pre class="p-3 bg-gray-900 text-green-400 rounded text-sm overflow-x-auto font-mono">
                                    {query.query}
                                </pre>
                                {query.bindings && (
                                    <div class="mt-2">
                                        <span class="text-xs text-gray-600">Bindings:</span>
                                        <pre class="mt-1 p-2 bg-gray-50 rounded text-xs">
                                            {JSON.stringify(query.bindings, null, 2)}
                                        </pre>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Queue Panel */}
                <div data-panel="queue" class={activePanel === 'queue' ? 'active' : ''}>
                    <div class="bg-white rounded-lg shadow-sm overflow-hidden">
                        <table class="min-w-full divide-y divide-gray-200">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Job Name</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Attempts</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Timestamp</th>
                                </tr>
                            </thead>
                            <tbody class="bg-white divide-y divide-gray-200">
                                {data.queue.map((job) => (
                                    <tr class="hover:bg-gray-50">
                                        <td class="px-6 py-4 text-sm font-medium">{job.name}</td>
                                        <td class="px-6 py-4 whitespace-nowrap">
                                            <Badge
                                                color={
                                                    job.status === 'completed' ? 'green' :
                                                    job.status === 'failed' ? 'red' :
                                                    job.status === 'processing' ? 'yellow' : 'gray'
                                                }
                                            >
                                                {job.status}
                                            </Badge>
                                        </td>
                                        <td class="px-6 py-4 text-sm">{job.attempts}</td>
                                        <td class="px-6 py-4 text-sm text-gray-500">
                                            {new Date(job.timestamp).toLocaleString()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Mail Panel */}
                <div data-panel="mail" class={activePanel === 'mail' ? 'active' : ''}>
                    <div class="space-y-4">
                        {data.mails.map((mail) => (
                            <div class="bg-white rounded-lg shadow-sm p-6">
                                <div class="flex items-center justify-between mb-2">
                                    <div class="flex items-center gap-3">
                                        <Badge color={mail.status === 'sent' ? 'green' : 'red'}>
                                            {mail.status}
                                        </Badge>
                                        <span class="text-sm font-medium">{mail.subject}</span>
                                    </div>
                                    <span class="text-xs text-gray-500">
                                        {new Date(mail.timestamp).toLocaleString()}
                                    </span>
                                </div>
                                <div class="text-sm text-gray-600">
                                    <span class="font-medium">To:</span> {mail.to}
                                </div>
                                <div class="text-sm text-gray-600">
                                    <span class="font-medium">Driver:</span> {mail.driver}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Performance Panel */}
                <div data-panel="performance" class={activePanel === 'performance' ? 'active' : ''}>
                    <div class="bg-white rounded-lg shadow-sm overflow-hidden">
                        <table class="min-w-full divide-y divide-gray-200">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Timestamp</th>
                                </tr>
                            </thead>
                            <tbody class="bg-white divide-y divide-gray-200">
                                {data.performance.map((metric) => (
                                    <tr class="hover:bg-gray-50">
                                        <td class="px-6 py-4 whitespace-nowrap">
                                            <Badge
                                                color={
                                                    metric.type === 'route' ? 'blue' :
                                                    metric.type === 'database' ? 'yellow' :
                                                    metric.type === 'middleware' ? 'green' : 'gray'
                                                }
                                            >
                                                {metric.type}
                                            </Badge>
                                        </td>
                                        <td class="px-6 py-4 text-sm font-medium">{metric.name}</td>
                                        <td class="px-6 py-4 text-sm">{metric.duration.toFixed(2)}ms</td>
                                        <td class="px-6 py-4 text-sm text-gray-500">
                                            {new Date(metric.timestamp).toLocaleString()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Auto-refresh script */}
            <script
                dangerouslySetInnerHTML={{
                    __html: `
                        setInterval(() => {
                            fetch('/_devtools/api/data')
                                .then(r => r.json())
                                .then(() => location.reload())
                        }, 5000)
                    `,
                }}
            />
        </Layout>,
    )
}
