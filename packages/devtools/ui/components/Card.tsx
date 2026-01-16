import { Badge } from './Badge.tsx'
import {
    borderRadius,
    colors,
    fontSize,
    fontWeight,
    shadows,
    spacing,
} from '../theme.ts'

interface CardProps {
    title: string
    value: number | string
    subtitle: string
    color?: 'blue' | 'green' | 'yellow' | 'red' | 'gray'
}

export const Card = ({
    title,
    value,
    subtitle,
    color = 'blue',
}: CardProps) => {
    const cardStyles = {
        backgroundColor: colors.bg.secondary,
        border: `1px solid ${colors.border.default}`,
        borderRadius: borderRadius.lg,
        padding: spacing.xl,
        boxShadow: shadows.sm,
    }

    const headerStyles = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: spacing.sm,
    }

    const titleStyles = {
        fontSize: fontSize.xs,
        fontWeight: fontWeight.semibold,
        color: colors.text.disabled,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
    }

    const valueStyles = {
        fontSize: fontSize['3xl'],
        fontWeight: fontWeight.bold,
        color: colors.text.primary,
        fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    }

    return (
        <div style={cardStyles as any}>
            <div style={headerStyles as any}>
                <h3 style={titleStyles as any}>{title}</h3>
                <Badge text={subtitle} color={color} />
            </div>
            <div style={valueStyles as any}>{value}</div>
        </div>
    )
}
