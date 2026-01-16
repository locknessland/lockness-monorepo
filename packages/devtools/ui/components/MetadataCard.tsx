export const MetadataCard = ({ selectedRequest }: { selectedRequest: any }) => {
    // Parse component info
    let componentName = selectedRequest.component
    let componentFile = ''

    if (componentName) {
        const sourceMatch = componentName.match(/_source="([^"]+)"/)
        if (sourceMatch) {
            componentFile = sourceMatch[1]
            componentName = componentName.replace(
                ` _source="${componentFile}"`,
                '',
            )
        }
    }

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
                    value={componentName}
                    color='text-purple-300'
                />
                {componentFile && (
                    <MetadataItem
                        label='File'
                        value={componentFile}
                        color='text-gray-400'
                    />
                )}
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
    }').then(() => { const el = document.getElementById('copy-${
        label.replace(/\s+/g, '-')
    }'); if(el) { el.classList.remove('text-gray-400', 'hover:text-white'); el.classList.add('text-green-400'); setTimeout(() => { el.classList.remove('text-green-400'); el.classList.add('text-gray-400', 'hover:text-white'); }, 1000) } })`

    return (
        <div>
            <span class='text-[10px] font-bold text-gray-600 uppercase tracking-widest'>
                {label}
            </span>
            <div class='flex items-center justify-between mt-1'>
                <p class={`text-sm font-mono ${color}`}>
                    {displayValue}
                </p>
                {value && (
                    <button
                        type='button'
                        onclick={copyToClipboard}
                        class='p-1.5 hover:bg-[#2a2d35] rounded-md transition-colors cursor-pointer group'
                        title='Copy to clipboard'
                    >
                        <svg
                            id={`copy-${label.replace(/\s+/g, '-')}`}
                            class='w-4 h-4 text-gray-400 group-hover:text-white transition-colors'
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
