export const BackToAppButton = () => {
    return (
        <a
            href='/'
            class='group relative flex items-center gap-2 px-4 py-2 bg-[#181a20] hover:bg-[#1f232b] border border-[#2d303a] hover:border-indigo-500/50 rounded-lg transition-all duration-300 shadow-sm hover:shadow-[0_0_15px_-3px_rgba(99,102,241,0.2)]'
        >
            <div class='absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-500/5 to-indigo-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-lg' />
            <svg
                class='w-4 h-4 text-gray-400 group-hover:text-indigo-400 transition-colors duration-300 group-hover:-translate-x-0.5 transform'
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
            <span class='text-sm font-medium text-gray-400 group-hover:text-indigo-100 transition-colors duration-300'>
                Back to App
            </span>
        </a>
    )
}
