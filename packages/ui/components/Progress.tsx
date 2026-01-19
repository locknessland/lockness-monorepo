import type { FC } from '@lockness/core'
import type { JSX } from '@lockness/core/jsx-runtime'
import { cn } from '../lib/utils.ts'

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
    sm: 'h-1',
    default: 'h-2',
    lg: 'h-4',
}

const verticalSizeStyles = {
    sm: 'w-1',
    default: 'w-2',
    lg: 'w-4',
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
                    'flex flex-col flex-nowrap justify-end h-32 overflow-hidden bg-secondary',
                    !thickness && verticalSizeStyles[size],
                    className,
                )}
                style={`border-radius: var(--radius)${
                    thicknessStyle ? `; width: ${thicknessStyle}` : ''
                }`}
                {...props}
            >
                <div
                    class={cn(
                        'overflow-hidden transition-all duration-300 ease-in-out',
                        variantStyles[variant],
                    )}
                    style={`height: ${percentage}%; border-radius: var(--radius)`}
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
                'flex w-full overflow-hidden bg-secondary',
                !thickness && !innerLabel && sizeStyles[size],
                innerLabel && !thickness && 'h-4',
            )}
            style={`border-radius: var(--radius)${
                thicknessStyle ? `; height: ${thicknessStyle}` : ''
            }`}
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
    )

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
                {progressBar}
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
            {progressBar}
        </div>
    )
}
