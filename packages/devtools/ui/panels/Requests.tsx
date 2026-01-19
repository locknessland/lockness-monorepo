import { Badge } from '../components/Badge.tsx'
import { MetadataCard } from '../components/MetadataCard.tsx'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
} from '../atoms/Table.tsx'
import {
    borderRadius,
    colors,
    fontSize,
    fontWeight,
    spacing,
} from '../theme.ts'

export const Requests = (
    { data, selectedRequest }: { data: any; selectedRequest: any },
) => {
    if (selectedRequest) {
        const containerStyles = {
            display: 'flex',
            flexDirection: 'column',
            gap: spacing.xl,
        }

        const headerStyles = {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
        }

        const leftSectionStyles = {
            display: 'flex',
            alignItems: 'center',
            gap: spacing.lg,
        }

        const backButtonStyles = {
            padding: spacing.sm,
            backgroundColor: 'transparent',
            border: 'none',
            borderRadius: borderRadius.full,
            color: colors.text.muted,
            cursor: 'pointer',
            transition: 'background-color 200ms',
        }

        const titleWrapperStyles = {
            display: 'flex',
            flexDirection: 'column',
            gap: spacing.xs,
        }

        const titleStyles = {
            fontSize: fontSize.xl,
            fontWeight: fontWeight.bold,
            display: 'flex',
            alignItems: 'center',
            gap: spacing.sm,
            color: colors.text.primary,
        }

        const pathStyles = {
            fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            color: colors.text.secondary,
            borderBottom: `1px dashed ${colors.text.subtle}`,
            paddingBottom: '2px',
        }

        const metaInfoStyles = {
            marginTop: spacing.md,
            display: 'flex',
            alignItems: 'center',
            gap: spacing.md,
            flexWrap: 'wrap',
        }

        const metaPillStyles = {
            display: 'inline-flex',
            alignItems: 'center',
            gap: spacing.xs,
            padding: `${spacing.xs} ${spacing.md}`,
            backgroundColor: colors.bg.elevated,
            border: `1px solid ${colors.border.default}`,
            borderRadius: borderRadius.full,
            fontSize: fontSize.xs,
            color: colors.text.secondary,
            fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        }

        const metaIconStyles = {
            width: '14px',
            height: '14px',
            color: colors.text.muted,
        }

        const gridStyles = {
            display: 'grid',
            gap: spacing.xl,
        }

        const cardStyles = {
            backgroundColor: colors.bg.secondary,
            border: `1px solid ${colors.border.default}`,
            borderRadius: borderRadius.lg,
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
            overflow: 'hidden',
        }

        const cardHeaderStyles = {
            padding: `${spacing.lg} ${spacing.xl}`,
            borderBottom: `1px solid ${colors.border.default}`,
            backgroundColor: colors.bg.elevated,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
        }

        const cardTitleStyles = {
            fontWeight: fontWeight.medium,
            color: colors.text.secondary,
            fontSize: fontSize.sm,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
        }

        const tableContainerStyles = {}

        const headerKeyStyles = {
            fontWeight: fontWeight.medium,
            color: colors.text.disabled,
            width: '33%',
            wordBreak: 'break-all',
            fontSize: fontSize.xs,
            textTransform: 'uppercase',
        }

        const headerValueStyles = {
            color: colors.text.secondary,
            wordBreak: 'break-all',
            fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            fontSize: fontSize.xs,
        }

        const bodyCardStyles = {
            ...cardStyles,
            marginTop: spacing.xl,
        }

        const bodyContentStyles = {
            padding: spacing.xl,
            backgroundColor: colors.bg.primary,
            color: colors.text.secondary,
            overflow: 'auto',
            borderTop: `1px solid ${colors.border.default}`,
        }

        const preStyles = {
            fontSize: fontSize.xs,
            fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            lineHeight: '1.625',
            color: '#34d399',
        }

        const hoverStyles = `
            .back-btn:hover { background-color: ${colors.bg.hover}; }
            .headers-table tbody tr { border-bottom: 1px solid ${colors.border.light}; transition: background-color 200ms; }
            .headers-table tbody tr:hover { background-color: rgba(255, 255, 255, 0.03); }
            .requests-grid { grid-template-columns: 1fr; }
            @media (min-width: 1024px) {
                .requests-grid { grid-template-columns: 1fr 1fr; }
            }
        `

        return (
            <>
                <style dangerouslySetInnerHTML={{ __html: hoverStyles }} />
                <div style={containerStyles as any}>
                    <div style={headerStyles as any}>
                        <div style={leftSectionStyles as any}>
                            <button
                                type='button'
                                onclick="showPanel('requests'); window.history.back()"
                                style={backButtonStyles as any}
                                class='back-btn'
                            >
                                <svg
                                    style={{
                                        width: '20px',
                                        height: '20px',
                                    } as any}
                                    fill='none'
                                    stroke='currentColor'
                                    viewBox='0 0 24 24'
                                >
                                    <path
                                        stroke-linecap='round'
                                        stroke-linejoin='round'
                                        stroke-width='2'
                                        d='M10 19l-7-7m0 0l7-7m-7 7h18'
                                    />
                                </svg>
                            </button>
                            <div style={titleWrapperStyles as any}>
                                <h2 style={titleStyles as any}>
                                    <Badge
                                        text={selectedRequest.method}
                                        color={selectedRequest.method === 'GET'
                                            ? 'blue'
                                            : 'green'}
                                    />
                                    <span style={pathStyles as any}>
                                        {selectedRequest.path}
                                    </span>
                                </h2>
                                <p style={metaInfoStyles as any}>
                                    <span style={metaPillStyles as any}>
                                        <svg
                                            style={metaIconStyles as any}
                                            fill='none'
                                            stroke='currentColor'
                                            viewBox='0 0 24 24'
                                        >
                                            <path
                                                stroke-linecap='round'
                                                stroke-linejoin='round'
                                                stroke-width='2'
                                                d='M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z'
                                            />
                                        </svg>
                                        {new Date(selectedRequest.timestamp)
                                            .toLocaleString()}
                                    </span>
                                    <span style={metaPillStyles as any}>
                                        <svg
                                            style={metaIconStyles as any}
                                            fill='none'
                                            stroke='currentColor'
                                            viewBox='0 0 24 24'
                                        >
                                            <path
                                                stroke-linecap='round'
                                                stroke-linejoin='round'
                                                stroke-width='2'
                                                d='M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z'
                                            />
                                        </svg>
                                        {selectedRequest.duration?.toFixed(2)}ms
                                    </span>
                                    <span
                                        style={{
                                            ...metaPillStyles,
                                            backgroundColor:
                                                selectedRequest.statusCode >=
                                                        400
                                                    ? 'rgba(239, 68, 68, 0.1)'
                                                    : 'rgba(34, 197, 94, 0.1)',
                                            borderColor:
                                                selectedRequest.statusCode >=
                                                        400
                                                    ? 'rgba(239, 68, 68, 0.3)'
                                                    : 'rgba(34, 197, 94, 0.3)',
                                            color: selectedRequest.statusCode >=
                                                    400
                                                ? '#ef4444'
                                                : '#22c55e',
                                        } as any}
                                    >
                                        <svg
                                            style={{
                                                ...metaIconStyles,
                                                color: 'currentColor',
                                            } as any}
                                            fill='none'
                                            stroke='currentColor'
                                            viewBox='0 0 24 24'
                                        >
                                            {selectedRequest.statusCode >= 400
                                                ? (
                                                    <path
                                                        stroke-linecap='round'
                                                        stroke-linejoin='round'
                                                        stroke-width='2'
                                                        d='M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
                                                    />
                                                )
                                                : (
                                                    <path
                                                        stroke-linecap='round'
                                                        stroke-linejoin='round'
                                                        stroke-width='2'
                                                        d='M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'
                                                    />
                                                )}
                                        </svg>
                                        {selectedRequest.statusCode || '-'}
                                    </span>
                                </p>
                            </div>
                        </div>
                    </div>

                    <div style={gridStyles as any} class='requests-grid'>
                        <MetadataCard selectedRequest={selectedRequest} />

                        <div style={cardStyles as any}>
                            <div style={cardHeaderStyles as any}>
                                <h3 style={cardTitleStyles as any}>
                                    Headers
                                </h3>
                            </div>
                            <div style={tableContainerStyles as any}>
                                <table
                                    style={{ width: '100%' } as any}
                                    class='headers-table'
                                >
                                    <tbody>
                                        {Object.entries(
                                            selectedRequest.headers || {},
                                        ).map(([k, v]) => (
                                            <tr>
                                                <td
                                                    style={{
                                                        padding:
                                                            `${spacing.sm} ${spacing.lg}`,
                                                        ...headerKeyStyles,
                                                    } as any}
                                                >
                                                    {k}
                                                </td>
                                                <td
                                                    style={{
                                                        padding:
                                                            `${spacing.sm} ${spacing.lg}`,
                                                        ...headerValueStyles,
                                                    } as any}
                                                >
                                                    {v as any}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    {selectedRequest.body && (
                        <div style={bodyCardStyles as any}>
                            <div style={cardHeaderStyles as any}>
                                <h3 style={cardTitleStyles as any}>
                                    Body Payload
                                </h3>
                            </div>
                            <div style={bodyContentStyles as any}>
                                <pre style={preStyles as any}>
                                    {JSON.stringify(selectedRequest.body, null, 2)}
                                </pre>
                            </div>
                        </div>
                    )}
                </div>
            </>
        )
    }

    const cursorPointerStyles = `
        .request-row { cursor: pointer; }
    `

    return (
        <>
            <style dangerouslySetInnerHTML={{ __html: cursorPointerStyles }} />
            <Table title='Request History' count={data.requests.length}>
                <TableHead>
                    <tr>
                        <TableHeaderCell>Status</TableHeaderCell>
                        <TableHeaderCell>Method</TableHeaderCell>
                        <TableHeaderCell>Path</TableHeaderCell>
                        <TableHeaderCell>Duration</TableHeaderCell>
                        <TableHeaderCell>Time</TableHeaderCell>
                        <TableHeaderCell>Action</TableHeaderCell>
                    </tr>
                </TableHead>
                <TableBody>
                    {data.requests.slice().reverse().map((req: any) => (
                        <tr
                            class='request-row'
                            onclick={`window.location.href='?panel=requests&requestId=${req.id}'`}
                        >
                            <TableCell style={{ whiteSpace: 'nowrap' }}>
                                <Badge
                                    text={(req.statusCode || '?').toString()}
                                    color={!req.statusCode
                                        ? 'gray'
                                        : req.statusCode >= 500
                                        ? 'red'
                                        : req.statusCode >= 400
                                        ? 'yellow'
                                        : 'green'}
                                />
                            </TableCell>
                            <TableCell style={{ whiteSpace: 'nowrap' }}>
                                <Badge
                                    text={req.method}
                                    color={req.method === 'GET'
                                        ? 'blue'
                                        : 'green'}
                                />
                            </TableCell>
                            <TableCell
                                style={{
                                    fontFamily:
                                        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                                    maxWidth: '300px',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                <span title={req.path}>{req.path}</span>
                            </TableCell>
                            <TableCell
                                style={{
                                    whiteSpace: 'nowrap',
                                    color: colors.text.disabled,
                                    fontFamily:
                                        'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                                }}
                            >
                                {req.duration?.toFixed(0) || '-'}ms
                            </TableCell>
                            <TableCell
                                style={{
                                    whiteSpace: 'nowrap',
                                    color: colors.text.disabled,
                                }}
                            >
                                {new Date(req.timestamp).toLocaleTimeString(
                                    [],
                                    {
                                        hour12: false,
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        second: '2-digit',
                                    },
                                )}
                            </TableCell>
                            <TableCell
                                style={{
                                    whiteSpace: 'nowrap',
                                    textAlign: 'right',
                                    color: colors.brand.indigo[400],
                                    fontWeight: fontWeight.medium,
                                }}
                            >
                                View &rarr;
                            </TableCell>
                        </tr>
                    ))}
                </TableBody>
            </Table>
        </>
    )
}
