import {
    borderRadius,
    colors,
    fontSize,
    fontWeight,
    spacing,
    transitions,
} from '../theme.ts'

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
export type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps {
    children: any
    onClick?: string
    variant?: ButtonVariant
    size?: ButtonSize
    type?: 'button' | 'submit' | 'reset'
    class?: string
}

export const Button = ({
    children,
    onClick,
    variant = 'secondary',
    size = 'md',
    type = 'button',
    class: className,
}: ButtonProps) => {
    const baseStyles: Record<string, string> = {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.sm,
        fontFamily: 'inherit',
        fontWeight: fontWeight.medium,
        borderRadius: borderRadius.lg,
        border: '1px solid',
        transition: `all ${transitions.base}`,
        cursor: 'pointer',
        outline: 'none',
    }

    const sizeStyles: Record<ButtonSize, Record<string, string>> = {
        sm: {
            padding: `${spacing.xs} ${spacing.md}`,
            fontSize: fontSize.xs,
        },
        md: {
            padding: `${spacing.sm} ${spacing.lg}`,
            fontSize: fontSize.sm,
        },
        lg: {
            padding: `${spacing.md} ${spacing.xl}`,
            fontSize: fontSize.base,
        },
    }

    const variantStyles: Record<ButtonVariant, Record<string, string>> = {
        primary: {
            backgroundColor: colors.brand.indigo[500],
            borderColor: colors.brand.indigo[600],
            color: colors.text.primary,
        },
        secondary: {
            backgroundColor: colors.bg.secondary,
            borderColor: colors.border.default,
            color: colors.text.muted,
        },
        danger: {
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            borderColor: 'rgba(239, 68, 68, 0.3)',
            color: colors.status.error,
        },
        ghost: {
            backgroundColor: 'transparent',
            borderColor: 'transparent',
            color: colors.text.muted,
        },
    }

    const combinedStyles = {
        ...baseStyles,
        ...sizeStyles[size],
        ...variantStyles[variant],
    }

    return (
        <button
            type={type}
            onclick={onClick}
            style={combinedStyles}
            class={className}
        >
            {children}
        </button>
    )
}
