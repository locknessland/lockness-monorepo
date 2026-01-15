interface StatusBadgeProps {
    statusCode?: number
}

function getStatusColor(statusCode?: number): string {
    if (!statusCode) return '#1e293b'
    if (statusCode >= 500) return '#dc2626' // red-600
    if (statusCode >= 400) return '#ea580c' // orange-600
    if (statusCode >= 300) return '#0891b2' // cyan-600
    if (statusCode >= 200) return '#16a34a' // green-600
    return '#64748b' // slate-500
}

export function StatusBadge({ statusCode }: StatusBadgeProps) {
    if (!statusCode) return null

    const statusBgColor = getStatusColor(statusCode)

    return (
        <div
            className='ln-status-badge'
            style={{
                backgroundColor: statusBgColor,
                border: `1px solid ${statusBgColor}`,
            }}
        >
            {statusCode}
        </div>
    )
}
