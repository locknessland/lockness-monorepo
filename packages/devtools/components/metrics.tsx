import type { LogEntry, RequestInfo } from '../types.ts'
import { icons } from './icons.ts'
import { ToolbarItem } from './toolbar-item.tsx'

interface MetricsProps {
    data: any
    currentRequest?: RequestInfo
    mobile?: boolean
}

export function Metrics({ data, currentRequest, mobile }: MetricsProps) {
    const items = [
        {
            id: 'time',
            condition: !!currentRequest,
            icon: icons.bolt,
            label: mobile ? 'Time' : 'TIME',
            value: `${currentRequest?.duration?.toFixed(0) || '0'}ms`,
            color: !currentRequest?.duration
                ? '#9ca3af'
                : currentRequest.duration < 100
                ? '#10b981'
                : currentRequest.duration < 500
                ? '#f59e0b'
                : '#ef4444',
            primary: true,
            // Skip in mobile menu if desired, or keep it.
            // Original code didn't have TIME in mobile menu.
            // But user asked to include "time" in the list of reusable items.
            // Let's include it but maybe hidden or visible?
            // The mobile menu is an overlay, so specific context like "current request time" is less relevant than global stats?
            // But if user asked for it, I'll add it.
        },
        {
            id: 'requests',
            icon: icons.chart,
            label: mobile ? 'Total Requests' : 'REQUESTS',
            value: data.requests.length,
            href: '/_devtools?panel=requests',
            primary: true,
        },
        {
            id: 'routes',
            icon: icons.globe,
            label: mobile ? 'Registered Routes' : 'ROUTES',
            value: data.routes.length,
            href: '/_devtools?panel=routes',
        },
        {
            id: 'logs',
            icon: icons.document,
            label: mobile ? 'System Logs' : 'LOGS',
            value: data.logs.length,
            href: '/_devtools?panel=logs',
            badge: data.logs.some((l: LogEntry) => l.level === 'error'),
        },
        {
            id: 'sql',
            icon: icons.database,
            label: mobile ? 'Database Queries' : 'SQL',
            value: data.queries.length,
            href: '/_devtools?panel=sql',
        },
        {
            id: 'jobs',
            icon: icons.queue,
            label: mobile ? 'Queue Jobs' : 'JOBS',
            value: data.queue.length,
            href: '/_devtools?panel=queue',
        },
        {
            id: 'mail',
            icon: icons.envelope,
            label: mobile ? 'Emails Sent' : 'MAIL',
            value: data.mails.length,
            href: '/_devtools?panel=mail',
        },
    ]

    const renderItem = (item: any) => (
        <ToolbarItem
            key={item.id}
            icon={item.icon}
            label={item.label}
            value={item.value}
            href={item.href}
            color={item.color}
            badge={item.badge}
            className={mobile ? 'ln-mobile-item' : ''}
        />
    )

    const visibleItems = items.filter((i) => i.condition !== false)

    if (mobile) {
        return <>{visibleItems.map(renderItem)}</>
    }

    const primaryItems = visibleItems.filter((i) => i.primary)
    const secondaryItems = visibleItems.filter((i) => !i.primary)

    return (
        <>
            {primaryItems.map(renderItem)}
            <div
                className='ln-metrics-secondary'
                style={{ display: 'contents' }}
            >
                {secondaryItems.map(renderItem)}
            </div>
        </>
    )
}
