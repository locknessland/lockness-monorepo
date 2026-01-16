export const MetadataCard = ({ selectedRequest }: { selectedRequest: any }) => {
    return (
        <div class='card-bg rounded-lg shadow-sm overflow-hidden'>
            <div class='px-6 py-4 border-b border-[rgba(255,255,255,0.08)] bg-[#20232a]'>
                <h3 class='font-medium text-gray-300 text-sm uppercase tracking-wider'>
                    Metadata
                </h3>
            </div>
            <div class='p-6 space-y-4'>
                <MetadataItem
                    label='Controller'
                    value={selectedRequest.controller}
                    color='text-indigo-300'
                />
                <MetadataItem
                    label='Action'
                    value={selectedRequest.action}
                    color='text-indigo-300'
                />
                <MetadataItem
                    label='Route Name'
                    value={selectedRequest.routeName}
                    color='text-gray-400'
                />
                <MetadataItem
                    label='Component'
                    value={selectedRequest.component}
                    color='text-purple-300'
                />
            </div>
        </div>
    )
}

const MetadataItem = (
    { label, value, color }: { label: string; value?: string; color: string },
) => {
    const displayValue = value || '-'
    const copyToClipboard = `navigator.clipboard.writeText('${
        value || ''
    }').then(() => { const el = document.getElementById('copy-${label}'); el.classList.add('text-green-400'); setTimeout(() => el.classList.remove('text-green-400'), 1000) })`

    return (
        <div>
            <span class='text-[10px] font-bold text-gray-600 uppercase tracking-widest'>
                {label}
            </span>
            <div class='flex items-center justify-between mt-1 group'>
                <p class={`text-sm font-mono ${color}`}>
                    {displayValue}
                </p>
                {value && (
                    <button
                        type='button'
                        onclick={copyToClipboard}
                        class='opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-[#2a2d35] rounded'
                        title='Copy to clipboard'
                    >
                        <svg
                            id={`copy-${label}`}
                            class='w-3.5 h-3.5 text-gray-500 hover:text-white transition-colors'
                            fill='none'
                            stroke='currentColor'
                            viewBox='0 0 24 24'
                        >
                            <path
                                stroke-linecap='round'
                                stroke-linejoin='round'
                                stroke-width='2'
                                d='M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z'
                            />
                        </svg>
                    </button>
                )}
            </div>
        </div>
    )
}
