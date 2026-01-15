import { Badge } from '../components/Badge.tsx'

export const Routes = ({ data }: { data: any }) => {
    return (
        <div class='card-bg rounded-lg overflow-hidden'>
            <table class='w-full'>
                <thead class='bg-[#20232a] border-b border-[rgba(255,255,255,0.08)]'>
                    <tr>
                        <th class='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
                            Method
                        </th>
                        <th class='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
                            Path
                        </th>
                        <th class='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
                            Name
                        </th>
                        <th class='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
                            Controller
                        </th>
                        <th class='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
                            Middlewares
                        </th>
                    </tr>
                </thead>
                <tbody class='divide-y divide-[rgba(255,255,255,0.05)]'>
                    {data.routes.map((route: any) => (
                        <tr class='hover-row transition'>
                            <td class='px-6 py-4 whitespace-nowrap'>
                                <Badge
                                    text={route.method}
                                    color={route.method === 'GET'
                                        ? 'blue'
                                        : 'green'}
                                />
                            </td>
                            <td class='px-6 py-4 font-mono text-sm text-gray-300'>
                                {route.path}
                            </td>
                            <td class='px-6 py-4 text-sm text-indigo-400 font-medium'>
                                {route.name || '-'}
                            </td>
                            <td class='px-6 py-4 text-sm text-gray-500 font-mono text-xs'>
                                {route.controller || '-'}
                            </td>
                            <td class='px-6 py-4 text-sm'>
                                {route.middlewares.map((m: string) => (
                                    <span key={m} class='mr-1'>
                                        <Badge text={m} color='gray' />
                                    </span>
                                ))}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
