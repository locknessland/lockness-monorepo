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
     * Show percentage label above the bar (left-right layout)
     * @default false
     */
    showLabel?: boolean
    /**
     * Show floating label that follows the progress
     * @default false
     */
    floatingLabel?: boolean
    /**
     * Show label inside the progress bar
     * @default false
     */
    innerLabel?: boolean
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

const floatingLabelVariantStyles = {
    default: 'bg-primary/10 border-primary/20 text-primary',
    success:
        'bg-green-50 border-green-200 text-green-600 dark:bg-green-500/10 dark:border-green-500/20 dark:text-green-400',
    warning:
        'bg-yellow-50 border-yellow-200 text-yellow-600 dark:bg-yellow-500/10 dark:border-yellow-500/20 dark:text-yellow-400',
    destructive: 'bg-destructive/10 border-destructive/20 text-destructive',
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
 *
 * // Floating label
 * <Progress value={50} floatingLabel />
 *
 * // Inner label (inside the bar)
 * <Progress value={50} innerLabel size="lg" />
 * ```
 */
export const Progress: FC<ProgressProps> = ({
    value = 0,
    max = 100,
    variant = 'default',
    size = 'default',
    showLabel = false,
    floatingLabel = false,
    innerLabel = false,
    class: className,
    id,
    ...props
}) => {
    // Clamp value between 0 and max
    const clampedValue = Math.min(Math.max(0, value), max)
    const percentage = Math.round((clampedValue / max) * 100)

    return (
        <div
            class={cn(
                'w-full',
                (showLabel || floatingLabel) && 'space-y-1',
                className,
            )}
            {...props}
        >
            {showLabel && !floatingLabel && (
                <div class='flex justify-between text-sm text-muted-foreground'>
                    <span>Progress</span>
                    <span>{percentage}%</span>
                </div>
            )}
            {floatingLabel && (
                <div
                    class={cn(
                        'inline-block py-0.5 px-1.5 border text-xs font-medium',
                        floatingLabelVariantStyles[variant],
                    )}
                    style={`margin-left: calc(${percentage}% - 20px); border-radius: var(--radius)`}
                >
                    {percentage}%
                </div>
            )}
            <div
                id={id}
                role='progressbar'
                aria-valuenow={clampedValue}
                aria-valuemin={0}
                aria-valuemax={max}
                class={cn(
                    'flex w-full overflow-hidden bg-secondary',
                    innerLabel ? 'h-4' : sizeStyles[size],
                )}
                style='border-radius: var(--radius)'
            >
                <div
                    class={cn(
                        'flex flex-col justify-center overflow-hidden transition-all duration-300 ease-in-out',
                        variantStyles[variant],
                        innerLabel &&
                            'text-xs text-white text-center whitespace-nowrap',
                    )}
                    style={`width: ${percentage}%; border-radius: var(--radius)`}
                >
                    {innerLabel && percentage > 5 && `${percentage}%`}
                </div>
            </div>
        </div>
    )
}
