export const PlaceholderPanel = (
    { title, count, label }: { title: string; count: number; label: string },
) => {
    return (
        <div class='card-bg rounded-lg shadow-sm overflow-hidden'>
            <div class='px-6 py-4 border-b border-[rgba(255,255,255,0.08)] bg-[#20232a] flex justify-between items-center'>
                <h2 class='text-sm font-semibold text-gray-300 uppercase tracking-wider'>
                    {title}
                </h2>
                <span class='text-xs text-gray-500 bg-[#0f1115] px-2 py-1 rounded-full border border-gray-800'>
                    {count} {label}
                </span>
            </div>
            <div class='p-12 text-center text-gray-500 italic'>
                {title.split(' ')[0]} viewer implementation coming soon...
            </div>
        </div>
    )
}
