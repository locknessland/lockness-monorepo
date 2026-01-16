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
            fontSize: fontSize.sm,
            color: colors.text.disabled,
            marginTop: spacing.xs,
            display: 'flex',
            alignItems: 'center',
            gap: spacing.sm,
        }

        const dotStyles = {
            width: '8px',
            height: '8px',
            borderRadius: borderRadius.full,
            backgroundColor: colors.text.subtle,
        }

        const gridStyles = {
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

        const tableContainerStyles = {
            maxHeight: '384px',
            overflowY: 'auto',
        }

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
            @media (min-width: 1024px) {
                .requests-grid { grid-template-columns: 2fr 1fr; }
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
                                    <span style={dotStyles as any}></span>
                                    {new Date(selectedRequest.timestamp)
                                        .toLocaleString()}
                                    <span style={dotStyles as any}></span>
                                    {selectedRequest.duration?.toFixed(2)}ms
                                    <span style={dotStyles as any}></span>
                                    Status {selectedRequest.statusCode || '-'}
                                </p>
                            </div>
                        </div>
                        {selectedRequest.statusCode
                            ? (
                                <Badge
                                    text={selectedRequest.statusCode.toString()}
                                    color={selectedRequest.statusCode >= 400
                                        ? 'red'
                                        : 'green'}
                                />
                            )
                            : null}
                    </div>

                    <div style={gridStyles as any} class='requests-grid'>
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

                        <MetadataCard selectedRequest={selectedRequest} />
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
