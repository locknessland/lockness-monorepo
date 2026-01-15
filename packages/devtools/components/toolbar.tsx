import { collector } from '../collector.ts'
import type { LogEntry, RequestInfo } from '../types.ts'
import { icons } from './icons.ts'
import { ToolbarItem } from './toolbar-item.tsx'

interface DebugToolbarProps {
    requestId?: string
}

function getStatusColor(statusCode?: number): string {
    if (!statusCode) return '#1e293b'
    if (statusCode >= 500) return '#dc2626' // red-600
    if (statusCode >= 400) return '#ea580c' // orange-600
    if (statusCode >= 300) return '#0891b2' // cyan-600
    if (statusCode >= 200) return '#16a34a' // green-600
    return '#64748b' // slate-500
}

export function DebugToolbar({ requestId }: DebugToolbarProps) {
    const data = collector.getAllData()
    const currentRequest = requestId
        ? data.requests.find((r: RequestInfo) => r.id === requestId)
        : data.requests[data.requests.length - 1]

    const statusCode = currentRequest?.statusCode
    const statusBgColor = getStatusColor(statusCode)

    return (
        <nav
            id='lockness-debug-toolbar'
            style={{
                position: 'fixed',
                bottom: '0',
                left: '0',
                right: '0',
                height: '64px',
                backgroundColor: '#16171c',
                borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                boxShadow:
                    '0 -4px 6px -1px rgba(0, 0, 0, 0.1), 0 -2px 4px -1px rgba(0, 0, 0, 0.06)',
                zIndex: '999999',
                fontFamily: 'system-ui, -apple-system, sans-serif',
            }}
        >
            <div
                style={{
                    maxWidth: '1600px',
                    margin: '0 auto',
                    height: '100%',
                    padding: '0 15px',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        height: '100%',
                        gap: '32px',
                    }}
                >
                    {/* Left section - Logo + Status */}
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '20px',
                        }}
                    >
                        <a
                            href='/_devtools'
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                color: 'white',
                                textDecoration: 'none',
                                fontWeight: '600',
                                fontSize: '15px',
                                padding: '8px 12px',
                                borderRadius: '8px',
                                transition: 'background-color 0.2s',
                            }}
                            onmouseover="this.style.backgroundColor='rgba(255,255,255,0.05)'"
                            onmouseout="this.style.backgroundColor='transparent'"
                        >
                            <div
                                style={{
                                    width: '20px',
                                    height: '20px',
                                    color: '#6366f1',
                                }}
                                dangerouslySetInnerHTML={{
                                    __html: icons.wrench,
                                }}
                            />
                        </a>

                        {/* HTTP Status Badge */}
                        {statusCode && (
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    backgroundColor: statusBgColor,
                                    padding: '6px 14px',
                                    borderRadius: '6px',
                                    fontWeight: '700',
                                    fontSize: '13px',
                                    color: 'white',
                                    border: `1px solid ${statusBgColor}`,
                                    boxShadow:
                                        '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                                }}
                            >
                                {statusCode}
                            </div>
                        )}

                        {/* Vertical Divider */}
                        <div
                            style={{
                                width: '1px',
                                height: '32px',
                                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                            }}
                        />

                        {/* Controller Info */}
                        {currentRequest?.controller && (
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '8px 16px',
                                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                                    borderRadius: '6px',
                                    border: '1px solid rgba(99, 102, 241, 0.2)',
                                }}
                            >
                                <span
                                    style={{
                                        fontSize: '13px',
                                        color: '#a5b4fc',
                                        fontWeight: '500',
                                    }}
                                >
                                    {currentRequest.controller}
                                </span>
                                {currentRequest.action && (
                                    <>
                                        <span
                                            style={{
                                                fontSize: '13px',
                                                color: '#6366f1',
                                            }}
                                        >
                                            @
                                        </span>
                                        <span
                                            style={{
                                                fontSize: '13px',
                                                color: '#818cf8',
                                                fontWeight: '600',
                                            }}
                                        >
                                            {currentRequest.action}
                                        </span>
                                    </>
                                )}
                                {currentRequest.component && (
                                    <>
                                        <span
                                            style={{
                                                fontSize: '13px',
                                                color: '#6366f1',
                                            }}
                                        >
                                            →
                                        </span>
                                        <span
                                            style={{
                                                fontSize: '13px',
                                                color: '#c4b5fd',
                                                fontWeight: '600',
                                                fontStyle: 'italic',
                                            }}
                                        >
                                            {currentRequest.component}
                                        </span>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Center section - Stats */}
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            flex: '1',
                        }}
                    >
                        <ToolbarItem
                            icon={icons.globe}
                            label='Routes'
                            value={data.routes.length}
                            href='/_devtools?panel=routes'
                        />

                        <ToolbarItem
                            icon={icons.chart}
                            label='Requests'
                            value={data.requests.length}
                            href='/_devtools?panel=requests'
                        />

                        {currentRequest && (
                            <ToolbarItem
                                icon={icons.bolt}
                                label='Duration'
                                value={`${
                                    currentRequest.duration?.toFixed(2) || '0'
                                }ms`}
                                color={!currentRequest.duration
                                    ? '#9ca3af'
                                    : currentRequest.duration < 100
                                    ? '#10b981'
                                    : currentRequest.duration < 500
                                    ? '#f59e0b'
                                    : '#ef4444'}
                            />
                        )}

                        <ToolbarItem
                            icon={icons.document}
                            label='Logs'
                            value={data.logs.length}
                            href='/_devtools?panel=logs'
                            badge={data.logs.filter((l: LogEntry) =>
                                l.level === 'error'
                            )
                                .length > 0}
                        />

                        <ToolbarItem
                            icon={icons.database}
                            label='SQL'
                            value={data.queries.length}
                            href='/_devtools?panel=sql'
                        />

                        <ToolbarItem
                            icon={icons.queue}
                            label='Queue'
                            value={data.queue.length}
                            href='/_devtools?panel=queue'
                        />

                        <ToolbarItem
                            icon={icons.envelope}
                            label='Mail'
                            value={data.mails.length}
                            href='/_devtools?panel=mail'
                        />
                    </div>

                    {/* Right section - Close button */}
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <button
                            type='button'
                            onclick="document.getElementById('lockness-debug-toolbar').style.display='none'"
                            style={{
                                backgroundColor: 'transparent',
                                border: 'none',
                                color: '#9ca3af',
                                cursor: 'pointer',
                                padding: '8px',
                                borderRadius: '6px',
                                width: '32px',
                                height: '32px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                transition: 'all 0.2s',
                            }}
                            onmouseover="this.style.backgroundColor='rgba(255,255,255,0.05)'; this.style.color='#e5e7eb'"
                            onmouseout="this.style.backgroundColor='transparent'; this.style.color='#9ca3af'"
                            title='Hide toolbar'
                        >
                            <div
                                style={{ width: '18px', height: '18px' }}
                                dangerouslySetInnerHTML={{
                                    __html: icons.close,
                                }}
                            />
                        </button>
                    </div>
                </div>
            </div>
        </nav>
    )
}
