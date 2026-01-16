import {
    borderRadius,
    colors,
    fontSize,
    fontWeight,
    spacing,
} from '../theme.ts'

export const PlaceholderPanel = (
    { title, count, label }: { title: string; count: number; label: string },
) => {
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

    const badgeStyles = {
        fontSize: fontSize.xs,
        color: colors.text.disabled,
        backgroundColor: colors.bg.primary,
        padding: `${spacing.xs} ${spacing.sm}`,
        borderRadius: borderRadius.full,
        border: `1px solid ${colors.border.dark}`,
    }

    const contentStyles = {
        padding: '48px',
        textAlign: 'center',
        color: colors.text.disabled,
        fontStyle: 'italic',
    }

    return (
        <div style={cardStyles as any}>
            <div style={headerStyles as any}>
                <h2 style={titleStyles as any}>
                    {title}
                </h2>
                <span style={badgeStyles as any}>
                    {count} {label}
                </span>
            </div>
            <div style={contentStyles as any}>
                {title.split(' ')[0]} viewer implementation coming soon...
            </div>
        </div>
    )
}
