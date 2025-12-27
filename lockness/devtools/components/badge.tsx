/** @jsx jsx */
/** @jsxImportSource @lockness/core */

interface BadgeProps {
    children: unknown
    color?: 'gray' | 'red' | 'yellow' | 'green' | 'blue' | 'purple'
}

export function Badge({ children, color = 'gray' }: BadgeProps) {
    const colors = {
        gray: 'bg-gray-100 text-gray-800',
        red: 'bg-red-100 text-red-800',
        yellow: 'bg-yellow-100 text-yellow-800',
        green: 'bg-green-100 text-green-800',
        blue: 'bg-blue-100 text-blue-800',
        purple: 'bg-purple-100 text-purple-800',
    }

    return (
        <span
            class={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                colors[color]
            }`}
        >
            {children}
        </span>
    )
}
