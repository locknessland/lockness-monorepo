export const ClearDataButton = () => {
    return (
        <button
            type='button'
            onclick='clearData()'
            class='group relative flex items-center gap-2 px-4 py-2 bg-[#181a20] hover:bg-red-900/10 border border-[#2d303a] hover:border-red-500/30 rounded-lg transition-all duration-300 shadow-sm hover:shadow-[0_0_15px_-3px_rgba(239,68,68,0.2)]'
        >
            <div class='absolute inset-0 bg-gradient-to-r from-red-500/0 via-red-500/5 to-red-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-lg' />
            <svg
                class='w-4 h-4 text-gray-400 group-hover:text-red-400 transition-colors duration-300 group-hover:rotate-12 transform'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
            >
                <path
                    stroke-linecap='round'
                    stroke-linejoin='round'
                    stroke-width='2'
                    d='M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16'
                />
            </svg>
            <span class='text-sm font-medium text-gray-400 group-hover:text-red-100 transition-colors duration-300'>
                Clear Data
            </span>
        </button>
    )
}
