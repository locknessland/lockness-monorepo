import {
    borderRadius,
    colors,
    fontSize,
    fontWeight,
    spacing,
} from '../theme.ts'
import { CopyButton } from './CopyButton.tsx'

export const MetadataCard = ({ selectedRequest }: { selectedRequest: any }) => {
    // Parse component info
    let componentName = selectedRequest.component
    let componentFile = ''

    if (componentName) {
        const sourceMatch = componentName.match(/_source="([^"]+)"/)
        if (sourceMatch) {
            componentFile = sourceMatch[1]
            componentName = componentName.replace(
                ` _source="${componentFile}"`,
                '',
            )
        }
    }

    // Format action with parentheses if not already present
    const formattedAction =
        selectedRequest.action && !selectedRequest.action.includes('(')
            ? `${selectedRequest.action}()`
            : selectedRequest.action

    const cardStyles = {
        backgroundColor: colors.bg.secondary,
        border: `1px solid ${colors.border.default}`,
        borderRadius: borderRadius.lg,
        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        overflow: 'hidden',
    }

    const headerStyles = {
        padding: `${spacing.lg} ${spacing.xl}`,
        borderBottom: `1px solid ${colors.border.default}`,
        backgroundColor: colors.bg.elevated,
    }

    const headerTitleStyles = {
        fontWeight: fontWeight.medium,
        color: colors.text.secondary,
        fontSize: fontSize.sm,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
    }

    const contentStyles = {
        padding: spacing.xl,
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.lg,
    }

    return (
        <div style={cardStyles as any}>
            <div style={headerStyles as any}>
                <h3 style={headerTitleStyles as any}>
                    Metadata
                </h3>
            </div>
            <div style={contentStyles as any}>
                <MetadataItem
                    label='Controller'
                    value={selectedRequest.controller}
                    color={colors.brand.indigo[300]}
                />
                <MetadataItem
                    label='Action'
                    value={formattedAction}
                    color={colors.brand.indigo[300]}
                />
                <MetadataItem
                    label='Route Name'
                    value={selectedRequest.routeName}
                    color={colors.text.muted}
                    italic
                />
                <MetadataItem
                    label='Component'
                    value={componentName}
                    color={colors.brand.purple[300]}
                />
                {componentFile && (
                    <MetadataItem
                        label='File'
                        value={componentFile}
                        color={colors.text.muted}
                    />
                )}
            </div>
        </div>
    )
}

const MetadataItem = (
    { label, value, color, italic }: {
        label: string
        value?: string
        color: string
        italic?: boolean
    },
) => {
    const displayValue = value || '-'

    const labelStyles = {
        fontSize: '10px',
        fontWeight: fontWeight.bold,
        color: colors.text.subtle,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
    }

    const containerStyles = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: spacing.xs,
    }

    const valueStyles = {
        fontSize: fontSize.sm,
        fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        color,
        ...(italic && { fontStyle: 'italic' }),
    }

    return (
        <div>
            <span style={labelStyles as any}>
                {label}
            </span>
            <div style={containerStyles as any}>
                <p style={valueStyles as any}>
                    {displayValue}
                </p>
                {value && <CopyButton value={value} label={label} />}
            </div>
        </div>
    )
}
