import { Card } from '../components/Card.tsx'
import { Badge } from '../components/Badge.tsx'

export const Overview = ({ data }: { data: any }) => {
    return (
        <div class='space-y-6'>
            <div class='grid grid-cols-1 md:grid-cols-4 gap-4 mb-6'>
                <Card
                    title='Uptime'
                    value={`${data.system.uptime.toFixed(0)}s`}
                    subtitle='Running'
                    color='green'
                />
                <Card
                    title='Requests'
                    value={data.requests.length}
                    subtitle='Total'
                    color='blue'
                />
                <Card
                    title='Memory'
                    value={`${
                        (data.system.memory.heapUsed / 1024 / 1024).toFixed(1)
                    } MB`}
                    subtitle='Heap'
                    color='yellow'
                />
                <Card
                    title='Routes'
                    value={data.routes.length}
                    subtitle='Registered'
                    color='gray'
                />
            </div>

            <div class='grid grid-cols-1 md:grid-cols-2 gap-6'>
                <div class='card-bg rounded-lg shadow-sm overflow-hidden min-h-[300px]'>
                    <div class='px-6 py-4 border-b border-[rgba(255,255,255,0.08)] bg-[#20232a] flex justify-between items-center'>
                        <h2 class='text-sm font-semibold text-gray-300 uppercase tracking-wider'>
                            Recent Requests
                        </h2>
                        <a
                            href='?panel=requests'
                            class='text-xs text-indigo-400 hover:text-indigo-300'
                        >
                            View All &rarr;
                        </a>
                    </div>
                    <div class='divide-y divide-[rgba(255,255,255,0.05)]'>
                        {data.requests.slice().reverse().slice(0, 5).map((
                            req: any,
                        ) => (
                            <div class='p-4 hover-row flex items-center justify-between group'>
                                <div class='flex items-center gap-3 overflow-hidden'>
                                    <Badge
                                        text={req.method}
                                        color={req.method === 'GET'
                                            ? 'blue'
                                            : 'green'}
                                    />
                                    <div class='flex flex-col min-w-0'>
                                        <span class='text-sm font-mono text-gray-300 truncate'>
                                            {req.path}
                                        </span>
                                        <span class='text-xs text-gray-500'>
                                            {new Date(req.timestamp)
                                                .toLocaleTimeString()}
                                        </span>
                                    </div>
                                </div>
                                <div class='flex items-center gap-3'>
                                    <span class='text-xs font-mono text-gray-500'>
                                        {req.duration.toFixed(1)}ms
                                    </span>
                                    <Badge
                                        text={`${req.statusCode}`}
                                        color={req.statusCode >= 400
                                            ? 'red'
                                            : 'green'}
                                    />
                                </div>
                            </div>
                        ))}
                        {data.requests.length === 0 && (
                            <div class='p-6 text-center text-gray-500 text-sm italic'>
                                No requests recorded yet
                            </div>
                        )}
                    </div>
                </div>

                <div class='card-bg rounded-lg shadow-sm overflow-hidden min-h-[300px] flex flex-col'>
                    <div class='px-6 py-4 border-b border-[rgba(255,255,255,0.08)] bg-[#20232a] flex justify-between items-center'>
                        <h2 class='text-sm font-semibold text-gray-300 uppercase tracking-wider'>
                            Recent Logs
                        </h2>
                        <a
                            href='?panel=logs'
                            class='text-xs text-indigo-400 hover:text-indigo-300'
                        >
                            View All &rarr;
                        </a>
                    </div>
                    <div class='divide-y divide-[rgba(255,255,255,0.05)] flex-1'>
                        {data.logs.slice().reverse().slice(0, 5).map(
                            (log: any) => {
                                const colors: Record<string, string> = {
                                    debug: 'gray',
                                    info: 'blue',
                                    warn: 'yellow',
                                    error: 'red',
                                }
                                return (
                                    <div class='p-4 hover-row flex items-start gap-3'>
                                        <Badge
                                            text={log.level.toUpperCase()}
                                            color={colors[log.level] || 'gray'}
                                        />
                                        <p class='text-sm text-gray-400 flex-1 font-mono tracking-tight'>
                                            {log.message}
                                        </p>
                                    </div>
                                )
                            },
                        )}
                        {data.logs.length === 0 && (
                            <div class='p-6 text-center text-gray-500 text-sm italic'>
                                No logs recorded yet
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
