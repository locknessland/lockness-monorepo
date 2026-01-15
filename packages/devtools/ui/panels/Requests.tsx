import { Badge } from '../components/Badge.tsx'

export const Requests = (
    { data, selectedRequest }: { data: any; selectedRequest: any },
) => {
    if (selectedRequest) {
        return (
            <div class='space-y-6'>
                <div class='flex items-center justify-between'>
                    <div class='flex items-center gap-4'>
                        <button
                            type='button'
                            onclick="showPanel('requests'); window.history.back()"
                            class='p-2 hover:bg-[#2a2d35] rounded-full transition text-gray-400'
                        >
                            <svg
                                class='w-5 h-5'
                                fill='none'
                                stroke='currentColor'
                                viewBox='0 0 24 24'
                            >
                                <path
                                    stroke-linecap='round'
                                    stroke-linejoin='round'
                                    stroke-width='2'
                                    d='M10 19l-7-7m0 0l7-7m-7 7h18'
                                />
                            </svg>
                        </button>
                        <div>
                            <h2 class='text-xl font-bold flex items-center gap-2 text-white'>
                                <Badge
                                    text={selectedRequest.method}
                                    color={selectedRequest.method === 'GET'
                                        ? 'blue'
                                        : 'green'}
                                />
                                <span class='font-mono text-gray-300 border-b border-gray-700 border-dashed pb-0.5'>
                                    {selectedRequest.path}
                                </span>
                            </h2>
                            <p class='text-sm text-gray-500 mt-1 flex items-center gap-2'>
                                <span class='w-2 h-2 rounded-full bg-gray-600'>
                                </span>{' '}
                                {new Date(selectedRequest.timestamp)
                                    .toLocaleString()}
                                <span class='w-2 h-2 rounded-full bg-gray-600 ml-2'>
                                </span>{' '}
                                {selectedRequest.duration?.toFixed(2)}ms
                                <span class='w-2 h-2 rounded-full bg-gray-600 ml-2'>
                                </span>{' '}
                                Status {selectedRequest.statusCode || '-'}
                            </p>
                        </div>
                    </div>
                    {selectedRequest.statusCode
                        ? (
                            <Badge
                                text={selectedRequest.statusCode.toString()}
                                color={selectedRequest.statusCode >= 400
                                    ? 'red'
                                    : 'green'}
                            />
                        )
                        : null}
                </div>

                <div class='grid grid-cols-1 md:grid-cols-2 gap-6'>
                    <div class='card-bg rounded-lg shadow-sm overflow-hidden'>
                        <div class='px-6 py-4 border-b border-[rgba(255,255,255,0.08)] bg-[#20232a] flex justify-between items-center'>
                            <h3 class='font-medium text-gray-300 text-sm uppercase tracking-wider'>
                                Headers
                            </h3>
                        </div>
                        <div class='max-h-96 overflow-auto'>
                            <table class='w-full text-sm'>
                                <tbody class='divide-y divide-[rgba(255,255,255,0.05)]'>
                                    {Object.entries(
                                        selectedRequest.headers || {},
                                    ).map(([k, v]) => (
                                        <tr class='hover-row transition'>
                                            <td class='px-4 py-2 font-medium text-gray-500 w-1/3 break-all text-xs uppercase'>
                                                {k}
                                            </td>
                                            <td class='px-4 py-2 text-gray-300 break-all font-mono text-xs'>
                                                {v as any}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div class='card-bg rounded-lg shadow-sm overflow-hidden'>
                        <div class='px-6 py-4 border-b border-[rgba(255,255,255,0.08)] bg-[#20232a]'>
                            <h3 class='font-medium text-gray-300 text-sm uppercase tracking-wider'>
                                Metadata
                            </h3>
                        </div>
                        <div class='p-6 space-y-4'>
                            <div>
                                <span class='text-[10px] font-bold text-gray-600 uppercase tracking-widest'>
                                    Controller
                                </span>
                                <p class='text-sm font-mono text-indigo-300 mt-1'>
                                    {selectedRequest.controller || '-'}
                                </p>
                            </div>
                            <div>
                                <span class='text-[10px] font-bold text-gray-600 uppercase tracking-widest'>
                                    Action
                                </span>
                                <p class='text-sm font-mono text-indigo-300 mt-1'>
                                    {selectedRequest.action || '-'}
                                </p>
                            </div>
                            <div>
                                <span class='text-[10px] font-bold text-gray-600 uppercase tracking-widest'>
                                    Route Name
                                </span>
                                <p class='text-sm font-mono text-gray-400 mt-1'>
                                    {selectedRequest.routeName || '-'}
                                </p>
                            </div>
                            <div>
                                <span class='text-[10px] font-bold text-gray-600 uppercase tracking-widest'>
                                    Component
                                </span>
                                <p class='text-sm font-mono text-purple-300 mt-1'>
                                    {selectedRequest.component || '-'}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {selectedRequest.body
                    ? (
                        <div class='card-bg rounded-lg shadow-sm overflow-hidden'>
                            <div class='px-6 py-4 border-b border-[rgba(255,255,255,0.08)] bg-[#20232a]'>
                                <h3 class='font-medium text-gray-300 text-sm uppercase tracking-wider'>
                                    Body Payload
                                </h3>
                            </div>
                            <div class='p-6 bg-[#0f1115] text-gray-300 overflow-auto border-t border-[rgba(255,255,255,0.08)]'>
                                <pre class='text-xs font-mono leading-relaxed text-green-400'>{JSON.stringify(selectedRequest.body, null, 2)}</pre>
                            </div>
                        </div>
                    )
                    : null}
            </div>
        )
    }

    return (
        <div class='card-bg rounded-lg shadow-sm overflow-hidden'>
            <div class='px-6 py-4 border-b border-[rgba(255,255,255,0.08)] flex justify-between items-center bg-[#20232a]'>
                <h2 class='text-sm font-semibold text-gray-300 uppercase tracking-wider'>
                    Request History
                </h2>
                <span class='text-xs text-gray-500 bg-[#0f1115] px-2 py-1 rounded-full border border-gray-800'>
                    {data.requests.length} total
                </span>
            </div>
            <table class='w-full'>
                <thead class='bg-[#1a1d23] border-b border-[rgba(255,255,255,0.08)]'>
                    <tr>
                        <th class='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
                            Status
                        </th>
                        <th class='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
                            Method
                        </th>
                        <th class='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
                            Path
                        </th>
                        <th class='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
                            Duration
                        </th>
                        <th class='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
                            Time
                        </th>
                        <th class='px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider'>
                            Action
                        </th>
                    </tr>
                </thead>
                <tbody class='divide-y divide-[rgba(255,255,255,0.05)]'>
                    {data.requests.slice().reverse().map((req: any) => (
                        <tr
                            class='hover-row cursor-pointer transition'
                            onclick={`window.location.href='?panel=requests&requestId=${req.id}'`}
                        >
                            <td class='px-6 py-4 whitespace-nowrap'>
                                <Badge
                                    text={(req.statusCode || '?').toString()}
                                    color={!req.statusCode
                                        ? 'gray'
                                        : req.statusCode >= 500
                                        ? 'red'
                                        : req.statusCode >= 400
                                        ? 'yellow'
                                        : 'green'}
                                />
                            </td>
                            <td class='px-6 py-4 whitespace-nowrap'>
                                <Badge
                                    text={req.method}
                                    color={req.method === 'GET'
                                        ? 'blue'
                                        : 'green'}
                                />
                            </td>
                            <td
                                class='px-6 py-4 text-sm font-mono text-gray-300 max-w-xs truncate'
                                title={req.path}
                            >
                                {req.path}
                            </td>
                            <td class='px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono'>
                                {req.duration?.toFixed(0) || '-'}ms
                            </td>
                            <td class='px-6 py-4 whitespace-nowrap text-sm text-gray-500'>
                                {new Date(req.timestamp).toLocaleTimeString(
                                    [],
                                    {
                                        hour12: false,
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        second: '2-digit',
                                    },
                                )}
                            </td>
                            <td class='px-6 py-4 whitespace-nowrap text-right text-sm text-indigo-400 font-medium'>
                                View &rarr;
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
