export const Badge = (
    { text, color = 'gray' }: { text: string; color?: string },
) => {
    const colors: Record<string, string> = {
        gray:
            'bg-[#181a20] text-gray-400 border border-[rgba(255,255,255,0.08)]',
        blue: 'bg-indigo-900/30 text-indigo-400 border border-indigo-500/20',
        green: 'bg-green-900/30 text-green-400 border border-green-500/20',
        yellow: 'bg-yellow-900/30 text-yellow-400 border border-yellow-500/20',
        red: 'bg-red-900/30 text-red-400 border border-red-500/20',
    }
    return (
        <span
            class={`inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold ${
                colors[color] || colors.gray
            }`}
        >
            {text}
        </span>
    )
}
