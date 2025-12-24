/** @jsx jsx */
/** @jsxImportSource hono/jsx */

interface CardProps {
    title: string
    value: number
    subtitle: string
    color?: 'gray' | 'red' | 'yellow' | 'green' | 'blue' | 'purple'
}

export function Card({ title, value, subtitle, color = 'blue' }: CardProps) {
    const colors = {
        gray: 'border-gray-200',
        red: 'border-red-200',
        yellow: 'border-yellow-200',
        green: 'border-green-200',
        blue: 'border-blue-200',
        purple: 'border-purple-200',
    }

    return (
        <div
            class={`bg-white border-l-4 ${
                colors[color]
            } rounded-lg shadow-sm p-6`}
        >
            <div class='text-sm font-medium text-gray-600'>{title}</div>
            <div class='mt-2 flex items-baseline'>
                <div class='text-3xl font-semibold text-gray-900'>{value}</div>
                <div class='ml-2 text-sm text-gray-500'>{subtitle}</div>
            </div>
        </div>
    )
}
