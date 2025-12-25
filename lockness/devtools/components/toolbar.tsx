import { collector } from '../collector.ts'
import type { LogEntry, RequestInfo } from '../types.ts'

interface DebugToolbarProps {
    requestId?: string
}

// Heroicons SVG (outline style)
const icons = {
    wrench:
        '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75a4.5 4.5 0 0 1-4.884 4.484c-1.076-.091-2.264.071-2.95.904l-7.152 8.684a2.548 2.548 0 1 1-3.586-3.586l8.684-7.152c.833-.686.995-1.874.904-2.95a4.5 4.5 0 0 1 6.336-4.486l-3.276 3.276a3.004 3.004 0 0 0 2.25 2.25l3.276-3.276c.256.565.398 1.192.398 1.852Z" /></svg>',
    globe:
        '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" /></svg>',
    chart:
        '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /></svg>',
    bolt:
        '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" /></svg>',
    document:
        '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>',
    database:
        '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" /></svg>',
    queue:
        '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" /></svg>',
    envelope:
        '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>',
    close:
        '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>',
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
                boxShadow: '0 -4px 6px -1px rgba(0, 0, 0, 0.1), 0 -2px 4px -1px rgba(0, 0, 0, 0.06)',
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
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
                                style={{ width: '20px', height: '20px', color: '#6366f1' }}
                                dangerouslySetInnerHTML={{ __html: icons.wrench }}
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
                                    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
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
                                <span style={{ fontSize: '13px', color: '#a5b4fc', fontWeight: '500' }}>
                                    {currentRequest.controller}
                                </span>
                                {currentRequest.action && (
                                    <>
                                        <span style={{ fontSize: '13px', color: '#6366f1' }}>@</span>
                                        <span style={{ fontSize: '13px', color: '#818cf8', fontWeight: '600' }}>
                                            {currentRequest.action}
                                        </span>
                                    </>
                                )}
                                {currentRequest.component && (
                                    <>
                                        <span style={{ fontSize: '13px', color: '#6366f1' }}>→</span>
                                        <span style={{ fontSize: '13px', color: '#c4b5fd', fontWeight: '600', fontStyle: 'italic' }}>
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
                                value={`${currentRequest.duration?.toFixed(2) || '0'}ms`}
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
                            badge={data.logs.filter((l: LogEntry) => l.level === 'error')
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
                                dangerouslySetInnerHTML={{ __html: icons.close }}
                            />
                        </button>
                    </div>
                </div>
            </div>
        </nav>
    )
}

interface ToolbarItemProps {
    icon: string
    label: string
    value: string | number
    href?: string
    color?: string
    badge?: boolean
}

function ToolbarItem(
    { icon, label, value, href, color, badge }: ToolbarItemProps,
) {
    const content = (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 16px',
                borderRadius: '0',
                transition: 'all 0.2s',
                position: 'relative',
            }}
        >
            <div
                style={{
                    width: '18px',
                    height: '18px',
                    flexShrink: '0',
                    color: color || '#9ca3af',
                }}
                dangerouslySetInnerHTML={{ __html: icon }}
            />
            <div
                style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}
            >
                <span
                    style={{
                        fontSize: '11px',
                        color: '#9ca3af',
                        fontWeight: '500',
                        letterSpacing: '0.025em',
                    }}
                >
                    {label}
                </span>
                <span
                    style={{
                        fontWeight: '700',
                        fontSize: '15px',
                        color: color || '#e5e7eb',
                    }}
                >
                    {value}
                </span>
            </div>
            {badge && (
                <div
                    style={{
                        position: 'absolute',
                        top: '6px',
                        right: '6px',
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: '#ef4444',
                        border: '2px solid #111827',
                    }}
                />
            )}
        </div>
    )

    if (href) {
        return (
            <a
                href={href}
                style={{
                    textDecoration: 'none',
                    borderRadius: '0',
                    transition: 'background-color 0.2s',
                }}
                onmouseover="this.style.backgroundColor='rgba(255,255,255,0.05)'"
                onmouseout="this.style.backgroundColor='transparent'"
            >
                {content}
            </a>
        )
    }

    return content
}
