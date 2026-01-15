import { Badge } from './Badge.tsx'

export const Card = (
    { title, value, subtitle, color = 'blue' }: {
        title: string
        value: number | string
        subtitle: string
        color?: string
    },
) => (
    <div class='card-bg rounded-lg p-6 shadow-sm'>
        <div class='flex items-center justify-between mb-2'>
            <h3 class='text-xs font-semibold text-gray-500 uppercase tracking-wider'>
                {title}
            </h3>
            <Badge text={subtitle} color={color} />
        </div>
        <div class='text-3xl font-bold text-white font-mono'>{value}</div>
    </div>
)
