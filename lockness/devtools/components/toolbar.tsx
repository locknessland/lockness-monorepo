/** @jsx jsx */
/** @jsxImportSource hono/jsx */

import { collector } from '../collector.ts'
import type { RequestInfo, LogEntry } from '../types.ts'

interface DebugToolbarProps {
    requestId?: string
}

export function DebugToolbar({ requestId }: DebugToolbarProps) {
    const data = collector.getAllData()
    const currentRequest = requestId
        ? data.requests.find((r: RequestInfo) => r.id === requestId)
        : data.requests[data.requests.length - 1]

    return (
        <div
            id='lockness-debug-toolbar'
            style={{
                position: 'fixed',
                bottom: '0',
                left: '0',
                right: '0',
                height: '48px',
                backgroundColor: '#1f2937',
                color: 'white',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                fontSize: '13px',
                zIndex: '999999',
                boxShadow: '0 -2px 10px rgba(0,0,0,0.3)',
                display: 'flex',
                alignItems: 'center',
                padding: '0 16px',
                gap: '24px',
            }}
        >
            {/* Logo */}
            <a
                href='/_devtools'
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: 'white',
                    textDecoration: 'none',
                    fontWeight: '600',
                }}
            >
                <span style={{ fontSize: '18px' }}>🔧</span>
                <span>Lockness</span>
            </a>

            {/* Divider */}
            <div
                style={{
                    width: '1px',
                    height: '24px',
                    backgroundColor: '#4b5563',
                }}
            >
            </div>

            {/* Stats */}
            <ToolbarItem
                icon='🌐'
                label='Routes'
                value={data.routes.length}
                href='/_devtools?panel=routes'
            />

            <ToolbarItem
                icon='📊'
                label='Requests'
                value={data.requests.length}
                href='/_devtools?panel=requests'
            />

            {currentRequest && (
                <ToolbarItem
                    icon='⚡'
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
                icon='📝'
                label='Logs'
                value={data.logs.length}
                href='/_devtools?panel=logs'
                badge={data.logs.filter((l: LogEntry) => l.level === 'error').length > 0}
                badgeColor='#ef4444'
            />

            <ToolbarItem
                icon='🗄️'
                label='SQL'
                value={data.queries.length}
                href='/_devtools?panel=sql'
            />

            <ToolbarItem
                icon='📬'
                label='Queue'
                value={data.queue.length}
                href='/_devtools?panel=queue'
            />

            <ToolbarItem
                icon='✉️'
                label='Mail'
                value={data.mails.length}
                href='/_devtools?panel=mail'
            />

            {/* Spacer */}
            <div style={{ flex: '1' }}></div>

            {/* Actions */}
            <button
                type='button'
                onclick="document.getElementById('lockness-debug-toolbar').style.display='none'"
                style={{
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: '#9ca3af',
                    cursor: 'pointer',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '18px',
                }}
                title='Hide toolbar'
            >
                ✕
            </button>
        </div>
    )
}

interface ToolbarItemProps {
    icon: string
    label: string
    value: string | number
    href?: string
    color?: string
    badge?: boolean
    badgeColor?: string
}

function ToolbarItem(
    { icon, label, value, href, color = '#9ca3af', badge, badgeColor }:
        ToolbarItemProps,
) {
    const content = (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                position: 'relative',
            }}
        >
            <span style={{ fontSize: '16px' }}>{icon}</span>
            <div
                style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}
            >
                <span
                    style={{
                        fontSize: '10px',
                        color: '#9ca3af',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                    }}
                >
                    {label}
                </span>
                <span style={{ fontWeight: '600', color }}>{value}</span>
            </div>
            {badge && (
                <span
                    style={{
                        position: 'absolute',
                        top: '-4px',
                        right: '-4px',
                        width: '8px',
                        height: '8px',
                        backgroundColor: badgeColor || '#ef4444',
                        borderRadius: '50%',
                        border: '2px solid #1f2937',
                    }}
                >
                </span>
            )}
        </div>
    )

    if (href) {
        return (
            <a
                href={href}
                style={{
                    color: 'white',
                    textDecoration: 'none',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    transition: 'background-color 0.2s',
                }}
                onmouseover="this.style.backgroundColor='#374151'"
                onmouseout="this.style.backgroundColor='transparent'"
            >
                {content}
            </a>
        )
    }

    return <div style={{ padding: '8px 12px' }}>{content}</div>
}
