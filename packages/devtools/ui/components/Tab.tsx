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
                class={`px-2.5 py-1 text-xs font-bold rounded-full transition-all duration-300 ${
                    active
                        ? 'bg-indigo-500/20 text-indigo-300 shadow-[0_0_10px_-3px_rgba(99,102,241,0.3)]'
                        : 'bg-[#1a1d23] border border-[rgba(255,255,255,0.08)] text-gray-500 group-hover:bg-[#20232a] group-hover:text-gray-300'
                }`}
            >
                {count}
            </span>
        )
        : null

    const icon = iconPath
        ? (
            <svg
                class={`w-4 h-4 transition-colors duration-300 ${
                    active
                        ? 'text-indigo-400'
                        : 'text-gray-500 group-hover:text-gray-300'
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
            class={`group flex w-full md:w-auto items-center gap-4 px-3 py-4 text-sm font-medium transition-all duration-300 whitespace-nowrap outline-none ${
                active
                    ? 'border-l-[3px] md:border-l-0 md:border-b-[3px] border-indigo-500 text-white bg-indigo-500/5 md:bg-transparent'
                    : 'border-l-[3px] md:border-l-0 md:border-b-[3px] border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-700 hover:bg-[#181a20]'
            }`}
        >
            {icon}
            {name}
            {countBadge}
        </button>
    )
}
