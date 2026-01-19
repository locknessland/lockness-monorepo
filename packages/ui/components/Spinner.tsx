import type { FC } from '@lockness/core'
import { cn } from '../lib/utils.ts'

/**
 * Spinner component props
 */
export interface SpinnerProps {
    /**
     * Size of the spinner
     * @default 'md'
     */
    size?: 'sm' | 'md' | 'lg' | 'xl'
    /**
     * Color variant
     * @default 'primary'
     */
    variant?:
        | 'primary'
        | 'secondary'
        | 'muted'
        | 'destructive'
        | 'success'
        | 'warning'
        | 'info'
    /**
     * Screen reader label
     * @default 'Loading'
     */
    label?: string
    /**
     * Additional CSS class names
     */
    class?: string
    /**
     * Element id attribute
     */
    id?: string
    /**
     * Additional HTML attributes
     */
    [key: string]: unknown
}

const sizeClasses = {
    sm: 'size-4 border-2',
    md: 'size-6 border-3',
    lg: 'size-8 border-3',
    xl: 'size-12 border-4',
}

const variantColors = {
    primary: 'var(--primary)',
    secondary: 'var(--secondary-foreground)',
    muted: 'var(--muted-foreground)',
    destructive: 'var(--destructive)',
    success: '#16a34a',
    warning: '#ca8a04',
    info: '#2563eb',
}

/**
 * Spinner Component
 *
 * A loading spinner indicator using CSS animations.
 * Uses a rotating circle with a transparent segment.
 *
 * @example
 * ```tsx
 * // Default spinner
 * <Spinner />
 *
 * // Different sizes
 * <Spinner size="sm" />
 * <Spinner size="lg" />
 *
 * // Color variants
 * <Spinner variant="primary" />
 * <Spinner variant="destructive" />
 *
 * // With custom label
 * <Spinner label="Processing..." />
 * ```
 */
export const Spinner: FC<SpinnerProps> = ({
    size = 'md',
    variant = 'primary',
    label = 'Loading',
    class: className,
    ...props
}) => {
    const color = variantColors[variant]

    return (
        <div
            class={cn(
                'inline-block border-solid border-t-transparent rounded-full',
                sizeClasses[size],
                className,
            )}
            style={{
                borderColor: color,
                borderTopColor: 'transparent',
                animation: 'spin 1s linear infinite',
            }}
            role='status'
            aria-label={label}
            {...props}
        >
            <span class='sr-only'>{label}...</span>
            <style>
                {`@keyframes spin { to { transform: rotate(360deg); } }`}
            </style>
        </div>
    )
}
