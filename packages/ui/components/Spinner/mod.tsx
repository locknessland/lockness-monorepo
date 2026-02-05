/**
 * @fileoverview Loading spinner component.
 *
 * Animated spinner indicator with multiple sizes and color variants.
 *
 * @module @lockness/ui/components/spinner
 */

import type { FC } from '@lockness/hono'
import { cn } from '../../lib/utils.ts'

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
    sm: 'h-4 w-4 border-2',
    md: 'h-6 w-6 border-2',
    lg: 'h-8 w-8 border-3',
    xl: 'h-12 w-12 border-4',
}

const variantColors = {
    primary: 'var(--spinner-default-color)',
    secondary: 'var(--secondary-foreground)',
    muted: 'var(--muted-foreground)',
    destructive: 'var(--destructive)',
    success: 'var(--spinner-success-color)',
    warning: 'var(--spinner-warning-color)',
    info: 'var(--spinner-info-color)',
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
                animation:
                    'spin var(--spinner-animation-duration) linear infinite',
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
