export const Deprecations = ({ data }: { data: any }) => {
    return (
        <div class='card-bg rounded-lg shadow-sm overflow-hidden'>
            <div class='px-6 py-4 border-b border-[rgba(255,255,255,0.08)] bg-[#20232a] flex justify-between items-center'>
                <h2 class='text-sm font-semibold text-gray-300 uppercase tracking-wider'>
                    Deprecation Notices
                </h2>
                <span class='text-xs text-gray-500 bg-[#0f1115] px-2 py-1 rounded-full border border-gray-800'>
                    {data.deprecations.length} notices
                </span>
            </div>
            <table class='w-full'>
                <thead class='bg-[#1a1d23] border-b border-[rgba(255,255,255,0.08)]'>
                    <tr>
                        <th class='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
                            Since
                        </th>
                        <th class='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
                            Package
                        </th>
                        <th class='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
                            Message
                        </th>
                        <th class='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
                            Stack
                        </th>
                    </tr>
                </thead>
                <tbody class='divide-y divide-[rgba(255,255,255,0.05)]'>
                    {data.deprecations.map((dep: any) => (
                        <tr class='hover-row transition'>
                            <td class='px-6 py-4 whitespace-nowrap text-sm font-mono text-blue-400'>
                                {dep.version}
                            </td>
                            <td class='px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-300'>
                                {dep.pkg}
                            </td>
                            <td class='px-6 py-4 text-sm text-gray-400'>
                                {dep.message}
                            </td>
                            <td class='px-6 py-4 text-xs font-mono text-gray-500'>
                                <details class='cursor-pointer group'>
                                    <summary class='hover:text-blue-400 focus:outline-none transition'>
                                        View Stack
                                    </summary>
                                    <div class='mt-2 p-3 bg-[#0f1115] rounded border border-[rgba(255,255,255,0.08)] overflow-auto max-w-lg max-h-48 scrollbar-thin'>
                                        <pre class='whitespace-pre-wrap text-gray-500 leading-relaxed'>{dep.stack || 'No stack trace available'}</pre>
                                    </div>
                                </details>
                            </td>
                        </tr>
                    ))}
                    {data.deprecations.length === 0 && (
                        <tr>
                            <td
                                colspan={4}
                                class='px-6 py-12 text-center text-gray-500 italic'
                            >
                                No deprecation notices found. Your code is
                                clean! 🎉
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    )
}
