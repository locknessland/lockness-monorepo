interface RequestInfoProps {
    method: string
    statusCode?: number
    controller?: string
    action?: string
    component?: string
}

function getStatusColor(statusCode?: number): string {
    if (!statusCode) return '#1e293b'
    if (statusCode >= 500) return '#dc2626' // red-600
    if (statusCode >= 400) return '#ea580c' // orange-600
    if (statusCode >= 300) return '#0891b2' // cyan-600
    if (statusCode >= 200) return '#16a34a' // green-600
    return '#64748b' // slate-500
}

export function RequestInfoItem(
    { method, statusCode, controller, action, component }: RequestInfoProps,
) {
    if (!controller) return null

    const statusColor = getStatusColor(statusCode)

    return (
        <div className='ln-request-info'>
            <span
                className='ln-method'
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
                {method}
                {statusCode && (
                    <span
                        style={{
                            backgroundColor: statusColor,
                            color: 'white',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            lineHeight: 1,
                        }}
                    >
                        {statusCode}
                    </span>
                )}
            </span>
            <span className='ln-action'>
                <span style={{ opacity: 0.7 }}>
                    {controller}
                </span>
                {action && (
                    <>
                        <span style={{ opacity: 0.4, margin: '0 1px' }}>
                            @
                        </span>
                        <span style={{ color: '#fff', fontWeight: 600 }}>
                            {action}
                        </span>
                    </>
                )}
                {component && (
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            marginLeft: '8px',
                            paddingLeft: '8px',
                            borderLeft: '1px solid rgba(255,255,255,0.1)',
                            height: '14px',
                        }}
                    >
                        <span
                            style={{
                                color: '#a78bfa', // violet-400
                                fontWeight: 600,
                                fontFamily: 'monospace',
                                fontSize: '12px',
                                letterSpacing: '-0.3px',
                            }}
                        >
                            {`<${component} />`}
                        </span>
                    </div>
                )}
            </span>
        </div>
    )
}
