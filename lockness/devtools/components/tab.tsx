/** @jsx jsx */
/** @jsxImportSource hono */

interface TabProps {
    name: string
    active: boolean
    count?: number
}

export function Tab({ name, active, count }: TabProps) {
    return (
        <a
            href={`?panel=${name.toLowerCase()}`}
            class={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                active
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
            }`}
        >
            {name}
            {count !== undefined && (
                <span class='ml-2 px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded-full'>
                    {count}
                </span>
            )}
        </a>
    )
}
