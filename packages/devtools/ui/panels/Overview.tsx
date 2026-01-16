import { Card } from '../components/Card.tsx'
import { Badge } from '../components/Badge.tsx'
import {
    borderRadius,
    colors,
    fontSize,
    fontWeight,
    spacing,
} from '../theme.ts'

export const Overview = ({ data }: { data: any }) => {
    const containerStyles = {
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.xl,
    }

    const gridStyles = {
        display: 'grid',
        gridTemplateColumns: '1fr',
        gap: spacing.lg,
        marginBottom: spacing.xl,
    }

    const twoColGridStyles = {
        display: 'grid',
        gridTemplateColumns: '1fr',
        gap: spacing.xl,
    }

    const cardStyles = {
        backgroundColor: colors.bg.secondary,
        border: `1px solid ${colors.border.default}`,
        borderRadius: borderRadius.lg,
        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        overflow: 'hidden',
        minHeight: '300px',
    }

    const headerStyles = {
        padding: `${spacing.lg} ${spacing.xl}`,
        borderBottom: `1px solid ${colors.border.default}`,
        backgroundColor: colors.bg.elevated,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
    }

    const titleStyles = {
        fontSize: fontSize.sm,
        fontWeight: fontWeight.semibold,
        color: colors.text.secondary,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
    }

    const linkStyles = {
        fontSize: fontSize.xs,
        color: colors.brand.indigo[400],
        textDecoration: 'none',
        transition: 'color 200ms',
    }

    const rowStyles = {
        padding: spacing.lg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: `1px solid ${colors.border.light}`,
        transition: 'background-color 200ms',
    }

    const leftSectionStyles = {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.md,
        overflow: 'hidden',
        flex: '1',
    }

    const infoColumnStyles = {
        display: 'flex',
        flexDirection: 'column',
        minWidth: '0',
    }

    const pathStyles = {
        fontSize: fontSize.sm,
        fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        color: colors.text.secondary,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
    }

    const timeStyles = {
        fontSize: fontSize.xs,
        color: colors.text.disabled,
    }

    const rightSectionStyles = {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.md,
    }

    const durationStyles = {
        fontSize: fontSize.xs,
        fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        color: colors.text.disabled,
    }

    const emptyStateStyles = {
        padding: spacing.xl,
        textAlign: 'center',
        color: colors.text.disabled,
        fontSize: fontSize.sm,
        fontStyle: 'italic',
    }

    const mediaStyles = `
        @media (min-width: 768px) {
            .overview-grid { grid-template-columns: repeat(4, 1fr); }
            .overview-two-col { grid-template-columns: repeat(2, 1fr); }
        }
        .hover-row:hover { background-color: rgba(255, 255, 255, 0.03); cursor: pointer; }
        .link-hover:hover { color: ${colors.brand.indigo[300]}; }
    `

    return (
        <>
            <style dangerouslySetInnerHTML={{ __html: mediaStyles }} />
            <div style={containerStyles as any}>
                <div style={gridStyles as any} class='overview-grid'>
                    <Card
                        title='Uptime'
                        value={`${data.system.uptime.toFixed(0)}s`}
                        subtitle='Running'
                        color='green'
                    />
                    <Card
                        title='Requests'
                        value={data.requests.length}
                        subtitle='Total'
                        color='blue'
                    />
                    <Card
                        title='Memory'
                        value={`${
                            (data.system.memory.heapUsed / 1024 / 1024).toFixed(
                                1,
                            )
                        } MB`}
                        subtitle='Heap'
                        color='yellow'
                    />
                    <Card
                        title='Routes'
                        value={data.routes.length}
                        subtitle='Registered'
                        color='gray'
                    />
                </div>

                <div style={twoColGridStyles as any} class='overview-two-col'>
                    <div style={cardStyles as any}>
                        <div style={headerStyles as any}>
                            <h2 style={titleStyles as any}>
                                Recent Requests
                            </h2>
                            <a
                                href='?panel=requests'
                                style={linkStyles as any}
                                class='link-hover'
                            >
                                View All &rarr;
                            </a>
                        </div>
                        <div>
                            {data.requests.slice().reverse().slice(0, 5).map((
                                req: any,
                            ) => (
                                <div style={rowStyles as any} class='hover-row'>
                                    <div style={leftSectionStyles as any}>
                                        <Badge
                                            text={req.method}
                                            color={req.method === 'GET'
                                                ? 'blue'
                                                : 'green'}
                                        />
                                        <div style={infoColumnStyles as any}>
                                            <span style={pathStyles as any}>
                                                {req.path}
                                            </span>
                                            <span style={timeStyles as any}>
                                                {new Date(req.timestamp)
                                                    .toLocaleTimeString()}
                                            </span>
                                        </div>
                                    </div>
                                    <div style={rightSectionStyles as any}>
                                        <span style={durationStyles as any}>
                                            {req.duration?.toFixed(1) || '-'}ms
                                        </span>
                                        <Badge
                                            text={`${req.statusCode}`}
                                            color={req.statusCode >= 400
                                                ? 'red'
                                                : 'green'}
                                        />
                                    </div>
                                </div>
                            ))}
                            {data.requests.length === 0 && (
                                <div style={emptyStateStyles as any}>
                                    No requests recorded yet
                                </div>
                            )}
                        </div>
                    </div>

                    <div
                        style={{
                            ...cardStyles,
                            display: 'flex',
                            flexDirection: 'column',
                        } as any}
                    >
                        <div style={headerStyles as any}>
                            <h2 style={titleStyles as any}>
                                Recent Logs
                            </h2>
                            <a
                                href='?panel=logs'
                                style={linkStyles as any}
                                class='link-hover'
                            >
                                View All &rarr;
                            </a>
                        </div>
                        <div style={{ flex: '1' } as any}>
                            {data.logs.slice().reverse().slice(0, 5).map(
                                (log: any) => {
                                    const logColors: Record<string, any> = {
                                        debug: 'gray',
                                        info: 'blue',
                                        warn: 'yellow',
                                        error: 'red',
                                    }

                                    const logRowStyles = {
                                        ...rowStyles,
                                        alignItems: 'flex-start',
                                        gap: spacing.md,
                                    }

                                    const logTextStyles = {
                                        fontSize: fontSize.sm,
                                        color: colors.text.muted,
                                        flex: '1',
                                        fontFamily:
                                            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                                        letterSpacing: '-0.025em',
                                    }

                                    return (
                                        <div
                                            style={logRowStyles as any}
                                            class='hover-row'
                                        >
                                            <Badge
                                                text={log.level.toUpperCase()}
                                                color={logColors[log.level] ||
                                                    'gray'}
                                            />
                                            <p style={logTextStyles as any}>
                                                {log.message}
                                            </p>
                                        </div>
                                    )
                                },
                            )}
                            {data.logs.length === 0 && (
                                <div style={emptyStateStyles as any}>
                                    No logs recorded yet
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}
