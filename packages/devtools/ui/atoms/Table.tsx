import {
    borderRadius,
    colors,
    fontSize,
    fontWeight,
    spacing,
} from '../theme.ts'

interface TableProps {
    title: string
    count?: number
    children: any
}

export const Table = ({ title, count, children }: TableProps) => {
    const containerStyles = {
        backgroundColor: colors.bg.secondary,
        border: `1px solid ${colors.border.default}`,
        borderRadius: borderRadius.lg,
        overflow: 'hidden',
        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
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

    const countBadgeStyles = {
        fontSize: fontSize.xs,
        color: colors.text.disabled,
        backgroundColor: colors.bg.primary,
        padding: `${spacing.xs} ${spacing.sm}`,
        borderRadius: borderRadius.full,
        border: `1px solid ${colors.border.dark}`,
    }

    const tableStyles = {
        width: '100%',
        borderCollapse: 'collapse',
    }

    return (
        <div style={containerStyles as any}>
            {(title || count !== undefined) && (
                <div style={headerStyles as any}>
                    <h2 style={titleStyles as any}>{title}</h2>
                    {count !== undefined && (
                        <span style={countBadgeStyles as any}>
                            {count} total
                        </span>
                    )}
                </div>
            )}
            <table style={tableStyles as any}>
                {children}
            </table>
        </div>
    )
}

export const TableHead = ({ children }: { children: any }) => {
    const theadStyles = {
        backgroundColor: '#1a1d23',
        borderBottom: `1px solid ${colors.border.default}`,
    }

    return <thead style={theadStyles as any}>{children}</thead>
}

export const TableHeaderCell = ({ children }: { children: any }) => {
    const thStyles = {
        padding: `${spacing.md} ${spacing.xl}`,
        textAlign: 'left',
        fontSize: fontSize.xs,
        fontWeight: fontWeight.medium,
        color: colors.text.disabled,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
    }

    return <th style={thStyles as any}>{children}</th>
}

export const TableBody = ({ children }: { children: any }) => {
    const tbodyStyles = {
        borderTop: `1px solid ${colors.border.light}`,
    }

    const hoverStyles = `
        tbody tr { border-bottom: 1px solid ${colors.border.light}; transition: background-color 200ms; }
        tbody tr:hover { background-color: rgba(255, 255, 255, 0.03); }
    `

    return (
        <>
            <style dangerouslySetInnerHTML={{ __html: hoverStyles }} />
            <tbody style={tbodyStyles as any}>{children}</tbody>
        </>
    )
}

export const TableCell = (
    { children, style }: { children: any; style?: Record<string, string> },
) => {
    const tdStyles = {
        padding: `${spacing.lg} ${spacing.xl}`,
        fontSize: fontSize.sm,
        color: colors.text.secondary,
        ...style,
    }

    return <td style={tdStyles as any}>{children}</td>
}
