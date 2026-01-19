import type { FC } from '@lockness/core'
import { cn } from '../lib/utils.ts'

/**
 * Progress component props
 */
export interface ProgressProps {
    /**
     * Current progress value (0-100)
     * @default 0
     */
    value?: number
    /**
     * Maximum value
     * @default 100
     */
    max?: number
    /**
     * Visual style variant
     * @default 'default'
     */
    variant?: 'default' | 'success' | 'warning' | 'destructive'
    /**
     * Size of the progress bar
     * @default 'default'
     */
    size?: 'sm' | 'default' | 'lg'
    /**
     * Show percentage label
     * @default false
     */
    showLabel?: boolean
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

const sizeStyles = {
    sm: 'h-1',
    default: 'h-2',
    lg: 'h-4',
}

const variantStyles = {
    default: 'bg-primary',
    success: 'bg-green-500',
    warning: 'bg-yellow-500',
    destructive: 'bg-destructive',
}

/**
 * Progress Component
 *
 * A progress bar component for displaying completion status.
 * Pure CSS implementation with smooth animations.
 *
 * @example
 * ```tsx
 * // Basic usage
 * <Progress value={50} />
 *
 * // With label
 * <Progress value={75} showLabel />
 *
 * // Success variant
 * <Progress value={100} variant="success" />
 *
 * // Different sizes
 * <Progress value={30} size="sm" />
 * <Progress value={60} size="lg" />
 * ```
 */
export const Progress: FC<ProgressProps> = ({
    value = 0,
    max = 100,
    variant = 'default',
    size = 'default',
    showLabel = false,
    class: className,
    id,
    ...props
}) => {
    // Clamp value between 0 and max
    const clampedValue = Math.min(Math.max(0, value), max)
    const percentage = Math.round((clampedValue / max) * 100)

    return (
        <div
            class={cn('w-full', showLabel && 'space-y-1', className)}
            {...props}
        >
            {showLabel && (
                <div class='flex justify-between text-sm text-muted-foreground'>
                    <span>Progress</span>
                    <span>{percentage}%</span>
                </div>
            )}
            <div
                id={id}
                role='progressbar'
                aria-valuenow={clampedValue}
                aria-valuemin={0}
                aria-valuemax={max}
                class={cn(
                    'w-full overflow-hidden rounded-full bg-secondary',
                    sizeStyles[size],
                )}
            >
                <div
                    class={cn(
                        'h-full rounded-full transition-all duration-300 ease-in-out',
                        variantStyles[variant],
                    )}
                    style={`width: ${percentage}%`}
                />
            </div>
        </div>
    )
}
