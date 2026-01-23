/**
 * @fileoverview Progress bar component for completion status.
 *
 * Pure CSS implementation with multiple variants, sizes, and
 * label positioning options.
 *
 * @module @lockness/ui/components/progress
 */

import type { FC } from '@lockness/core'
import type { JSX } from '@lockness/core/jsx-runtime'
import { cn } from '../../lib/utils.ts'

/**
 * Progress component props
 */
export interface ProgressProps
    extends Omit<JSX.IntrinsicElements['div'], 'class' | 'id'> {
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
     * Show label at the end (right side) of the progress bar
     * @default false
     */
    endLabel?: boolean
    /**
     * Display progress bar vertically
     * @default false
     */
    vertical?: boolean
    /**
     * Display progress with diagonal stripes effect
     * @default false
     */
    striped?: boolean
    /**
     * Animate the stripes (requires striped=true)
     * @default false
     */
    animated?: boolean
    /**
     * Add an outlined wrapper around the progress bar
     * @default false
     */
    outlined?: boolean
    /**
     * Custom thickness in Tailwind spacing units (1 = 0.25rem)
     * Overrides the size prop. Examples: 1.5, 4, 6
     */
    thickness?: number
    /**
     * Additional CSS class names
     */
    class?: string
    /**
     * Element id attribute
     */
    id?: string
}

const sizeStyles = {
    sm: 'h-[var(--progress-height-sm,0.25rem)]',
    default: 'h-[var(--progress-height-default,0.5rem)]',
    lg: 'h-[var(--progress-height-lg,1rem)]',
}

const verticalSizeStyles = {
    sm: 'w-[var(--progress-height-sm,0.25rem)]',
    default: 'w-[var(--progress-height-default,0.5rem)]',
    lg: 'w-[var(--progress-height-lg,1rem)]',
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

const outlineVariantStyles = {
    default: 'border-primary/50 bg-primary/10',
    success: 'border-green-500/50 bg-green-500/10',
    warning: 'border-yellow-500/50 bg-yellow-500/10',
    destructive: 'border-destructive/50 bg-destructive/10',
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
 *
 * // End label (right side)
 * <Progress value={50} endLabel />
 *
 * // Vertical progress
 * <Progress value={50} vertical />
 *
 * // Custom thickness (in Tailwind spacing units)
 * <Progress value={50} thickness={6} />
 * <Progress value={50} vertical thickness={4} />
 *
 * // Striped progress (diagonal stripes)
 * <Progress value={50} striped />
 * <Progress value={70} striped animated variant="success" />
 *
 * // Outlined progress (with border wrapper)
 * <Progress value={50} outlined />
 * <Progress value={70} outlined striped animated variant="success" />
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
    endLabel = false,
    vertical = false,
    striped = false,
    animated = false,
    outlined = false,
    thickness,
    class: className,
    id,
    ...props
}) => {
    // Clamp value between 0 and max
    const clampedValue = Math.min(Math.max(0, value), max)
    const percentage = Math.round((clampedValue / max) * 100)

    // Convert thickness to rem (Tailwind spacing: 1 = 0.25rem)
    const thicknessStyle = thickness ? `${thickness * 0.25}rem` : undefined

    // Striped background style
    const stripedStyle = striped
        ? `background-image: linear-gradient(
            45deg,
            rgba(255, 255, 255, 0.15) 25%,
            transparent 25%,
            transparent 50%,
            rgba(255, 255, 255, 0.15) 50%,
            rgba(255, 255, 255, 0.15) 75%,
            transparent 75%,
            transparent
        ); background-size: var(--progress-stripe-size, 1rem) var(--progress-stripe-size, 1rem);`
        : ''

    // Vertical progress bar
    if (vertical) {
        return (
            <div
                id={id}
                role='progressbar'
                aria-valuenow={clampedValue}
                aria-valuemin={0}
                aria-valuemax={max}
                aria-orientation='vertical'
                class={cn(
                    'flex flex-col flex-nowrap justify-end h-32 overflow-hidden bg-(--progress-background,var(--secondary))',
                    !thickness && verticalSizeStyles[size],
                    className,
                )}
                style={`border-radius: var(--progress-border-radius, var(--radius))${
                    thicknessStyle ? `; width: ${thicknessStyle}` : ''
                }`}
                {...props}
            >
                <div
                    class={cn(
                        'overflow-hidden transition-all duration-300 ease-in-out',
                        variantStyles[variant],
                    )}
                    style={`height: ${percentage}%; border-radius: var(--progress-border-radius, var(--radius))`}
                />
            </div>
        )
    }

    const progressBar = (
        <div
            id={id}
            role='progressbar'
            aria-valuenow={clampedValue}
            aria-valuemin={0}
            aria-valuemax={max}
            class={cn(
                'flex w-full overflow-hidden',
                !outlined && 'bg-(--progress-background,var(--secondary))',
                outlined && 'bg-transparent',
                !thickness && !innerLabel && sizeStyles[size],
                innerLabel && !thickness && 'h-4',
            )}
            style={`border-radius: var(--progress-border-radius, var(--radius))${
                thicknessStyle ? `; height: ${thicknessStyle}` : ''
            }`}
        >
            <div
                class={cn(
                    'flex flex-col justify-center overflow-hidden transition-all duration-300 ease-in-out',
                    variantStyles[variant],
                    innerLabel &&
                        'text-xs text-white text-center whitespace-nowrap',
                    animated &&
                        'animate-[progress-stripes_var(--progress-animation-duration,1s)_linear_infinite]',
                )}
                style={`width: ${percentage}%; border-radius: var(--progress-border-radius, var(--radius)); ${stripedStyle}`}
            >
                {innerLabel && percentage > 5 && `${percentage}%`}
            </div>
        </div>
    )

    // Wrap in outline container if outlined
    const wrappedProgressBar = outlined
        ? (
            <div
                class={cn(
                    'border-(length:--progress-outline-border-width,2px)',
                    outlineVariantStyles[variant],
                )}
                style='padding: var(--progress-outline-padding, 0.25rem); border-radius: var(--progress-outline-border-radius, calc(var(--radius) + 4px))'
            >
                {progressBar}
            </div>
        )
        : progressBar

    // End label layout: flex container with progress bar and label
    if (endLabel) {
        return (
            <div
                class={cn(
                    'flex items-center gap-x-3 whitespace-nowrap',
                    className,
                )}
                {...props}
            >
                {wrappedProgressBar}
                <div class='w-10 text-end'>
                    <span class='text-sm text-muted-foreground'>
                        {percentage}%
                    </span>
                </div>
            </div>
        )
    }

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
            {wrappedProgressBar}
        </div>
    )
}
