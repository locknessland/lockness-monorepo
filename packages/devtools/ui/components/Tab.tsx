export const Tab = ({
    name,
    active,
    count,
    iconPath,
}: {
    name: string
    active: boolean
    count?: number
    iconPath?: string
}) => {
    const countBadge = count !== undefined
        ? (
            <span
                class={`ml-2.5 px-2 py-0.5 text-[10px] rounded-md font-mono transition-colors ${
                    active
                        ? 'bg-indigo-500/20 text-indigo-300'
                        : 'bg-[#0f1115] border border-[rgba(255,255,255,0.08)] text-gray-500 group-hover:bg-[#181a20] group-hover:text-gray-400'
                }`}
            >
                {count}
            </span>
        )
        : null

    const icon = iconPath
        ? (
            <svg
                class={`w-4 h-4 mr-2.5 ${
                    active
                        ? 'text-indigo-400'
                        : 'text-gray-500 group-hover:text-gray-400'
                }`}
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
            >
                <path
                    stroke-linecap='round'
                    stroke-linejoin='round'
                    stroke-width='2'
                    d={iconPath}
                />
            </svg>
        )
        : null

    return (
        <button
            type='button'
            onclick={`showPanel('${name.toLowerCase()}')`}
            class={`group flex items-center px-5 py-3.5 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                active
                    ? 'border-indigo-500 text-white bg-[#181a20]/50'
                    : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-[rgba(255,255,255,0.08)] hover:bg-[#181a20]/30'
            }`}
        >
            {icon}
            {name}
            {countBadge}
        </button>
    )
}
