import {
    borderRadius,
    colors,
    fontSize,
    fontWeight,
    spacing,
} from '../theme.ts'

export type BadgeColor = 'gray' | 'blue' | 'green' | 'yellow' | 'red'

interface BadgeProps {
    text: string
    color?: BadgeColor
}

export const Badge = ({ text, color = 'gray' }: BadgeProps) => {
    const colorStyles: Record<BadgeColor, Record<string, string>> = {
        gray: {
            backgroundColor: colors.bg.secondary,
            color: colors.text.muted,
            borderColor: colors.border.default,
        },
        blue: {
            backgroundColor: 'rgba(30, 27, 75, 0.3)',
            color: colors.brand.indigo[400],
            borderColor: 'rgba(99, 102, 241, 0.2)',
        },
        green: {
            backgroundColor: 'rgba(4, 120, 87, 0.3)',
            color: '#34d399',
            borderColor: 'rgba(16, 185, 129, 0.2)',
        },
        yellow: {
            backgroundColor: 'rgba(120, 53, 15, 0.3)',
            color: '#facc15',
            borderColor: 'rgba(245, 158, 11, 0.2)',
        },
        red: {
            backgroundColor: 'rgba(127, 29, 29, 0.3)',
            color: '#f87171',
            borderColor: 'rgba(239, 68, 68, 0.2)',
        },
    }

    const baseStyles = {
        display: 'inline-flex',
        alignItems: 'center',
        padding: `${spacing.xs} ${spacing.sm}`,
        borderRadius: borderRadius.md,
        fontSize: fontSize.xs,
        fontWeight: fontWeight.semibold,
        border: '1px solid',
        whiteSpace: 'nowrap',
    }

    const combinedStyles = {
        ...baseStyles,
        ...colorStyles[color],
    }

    return <span style={combinedStyles as any}>{text}</span>
}
