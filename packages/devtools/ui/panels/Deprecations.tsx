import { borderRadius, colors, fontSize, spacing } from '../theme.ts'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeaderCell,
} from '../atoms/Table.tsx'

export const Deprecations = ({ data }: { data: any }) => {
    const versionStyles = {
        fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        color: colors.brand.indigo[400],
    }

    const pkgStyles = {
        fontWeight: '500',
        color: colors.text.secondary,
    }

    const messageStyles = {
        color: colors.text.muted,
    }

    const detailsStyles = {
        cursor: 'pointer',
    }

    const summaryStyles = {
        fontSize: fontSize.xs,
        fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        color: colors.text.disabled,
        outline: 'none',
        transition: 'color 200ms',
    }

    const stackContainerStyles = {
        marginTop: spacing.sm,
        padding: spacing.md,
        backgroundColor: colors.bg.primary,
        borderRadius: borderRadius.md,
        border: `1px solid ${colors.border.default}`,
        overflow: 'auto',
        maxWidth: '32rem',
        maxHeight: '12rem',
    }

    const stackTextStyles = {
        whiteSpace: 'pre-wrap',
        color: colors.text.disabled,
        lineHeight: '1.625',
        fontSize: fontSize.xs,
    }

    const emptyStateStyles = {
        padding: `${spacing.xl} ${spacing.xl}`,
        textAlign: 'center',
        color: colors.text.disabled,
        fontStyle: 'italic',
    }

    const hoverStyles = `
        details summary:hover { color: ${colors.brand.indigo[400]}; }
    `

    return (
        <>
            <style dangerouslySetInnerHTML={{ __html: hoverStyles }} />
            <Table title='Deprecation Notices' count={data.deprecations.length}>
                <TableHead>
                    <tr>
                        <TableHeaderCell>Since</TableHeaderCell>
                        <TableHeaderCell>Package</TableHeaderCell>
                        <TableHeaderCell>Message</TableHeaderCell>
                        <TableHeaderCell>Stack</TableHeaderCell>
                    </tr>
                </TableHead>
                <TableBody>
                    {data.deprecations.map((dep: any) => (
                        <tr>
                            <TableCell style={{ whiteSpace: 'nowrap' }}>
                                <span style={versionStyles as any}>
                                    {dep.version}
                                </span>
                            </TableCell>
                            <TableCell style={{ whiteSpace: 'nowrap' }}>
                                <span style={pkgStyles as any}>{dep.pkg}</span>
                            </TableCell>
                            <TableCell>
                                <span style={messageStyles as any}>
                                    {dep.message}
                                </span>
                            </TableCell>
                            <TableCell>
                                <details style={detailsStyles as any}>
                                    <summary style={summaryStyles as any}>
                                        View Stack
                                    </summary>
                                    <div style={stackContainerStyles as any}>
                                        <pre style={stackTextStyles as any}>
                                            {dep.stack || 'No stack trace available'}
                                        </pre>
                                    </div>
                                </details>
                            </TableCell>
                        </tr>
                    ))}
                    {data.deprecations.length === 0 && (
                        <tr>
                            <td colspan={4} style={emptyStateStyles as any}>
                                No deprecation notices found. Your code is
                                clean! 🎉
                            </td>
                        </tr>
                    )}
                </TableBody>
            </Table>
        </>
    )
}
