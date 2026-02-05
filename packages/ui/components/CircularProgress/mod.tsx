/**
 * @fileoverview Circular progress indicator component.
 *
 * SVG-based circular progress bar with label and multiple sizes.
 *
 * @module @lockness/ui/components/circular-progress
 */

import type { FC } from '@lockness/hono'
import type { JSX } from '@lockness/hono/jsx-runtime'
import { cn } from '../../lib/utils.ts'

/**
 * CircularProgress component props
 */
export interface CircularProgressProps
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
     * Size of the circular progress
     * @default 'default'
     */
    size?: 'sm' | 'default' | 'lg' | 'xl'
    /**
     * Stroke width of the progress circle
     * If not provided, uses size-specific CSS variables
     */
    strokeWidth?: number
    /**
     * Show percentage label in the center
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
}

const sizeStyles = {
    sm: 'size-(--circular-progress-size-sm)',
    default: 'size-(--circular-progress-size-md)',
    lg: 'size-(--circular-progress-size-lg)',
    xl: 'size-(--circular-progress-size-xl)',
}

const labelSizeStyles = {
    sm: 'text-[length:--circular-progress-text-font-size-sm]',
    default: 'text-[length:--circular-progress-text-font-size-md]',
    lg: 'text-[length:--circular-progress-text-font-size-lg]',
    xl: 'text-[length:--circular-progress-text-font-size-xl]',
}

const variantStyles = {
    default: 'text-(--circular-progress-indicator-color)',
    success: 'text-green-500',
    warning: 'text-yellow-500',
    destructive: 'text-destructive',
}

const strokeWidthStyles = {
    sm: 'var(--circular-progress-stroke-width-sm)',
    default: 'var(--circular-progress-stroke-width-md)',
    lg: 'var(--circular-progress-stroke-width-lg)',
    xl: 'var(--circular-progress-stroke-width-xl)',
}

/**
 * CircularProgress Component
 *
 * A circular progress indicator using SVG.
 * Pure CSS implementation with smooth animations.
 *
 * @example
 * ```tsx
 * // Basic usage
 * <CircularProgress value={50} />
 *
 * // With label
 * <CircularProgress value={75} showLabel />
 *
 * // Success variant
 * <CircularProgress value={100} variant="success" showLabel />
 *
 * // Different sizes
 * <CircularProgress value={30} size="sm" />
 * <CircularProgress value={60} size="xl" showLabel />
 * ```
 */
export const CircularProgress: FC<CircularProgressProps> = ({
    value = 0,
    max = 100,
    variant = 'default',
    size = 'default',
    strokeWidth,
    showLabel = false,
    class: className,
    id,
    ...props
}) => {
    // Clamp value between 0 and max
    const clampedValue = Math.min(Math.max(0, value), max)
    const percentage = Math.round((clampedValue / max) * 100)

    // Calculate stroke-dashoffset (100 - percentage for counter-clockwise fill)
    const strokeDashoffset = 100 - percentage

    // Use size-specific CSS variable for stroke width if not explicitly provided
    const computedStrokeWidth = strokeWidth ?? strokeWidthStyles[size]

    return (
        <div
            id={id}
            role='progressbar'
            aria-valuenow={clampedValue}
            aria-valuemin={0}
            aria-valuemax={max}
            class={cn('relative', sizeStyles[size], className)}
            {...props}
        >
            <svg
                class='size-full -rotate-90'
                viewBox='0 0 36 36'
                xmlns='http://www.w3.org/2000/svg'
            >
                {/* Background Circle */}
                <circle
                    cx='18'
                    cy='18'
                    r='16'
                    fill='none'
                    class='stroke-current text-(--circular-progress-track-color)'
                    stroke-width={computedStrokeWidth}
                />
                {/* Progress Circle */}
                <circle
                    cx='18'
                    cy='18'
                    r='16'
                    fill='none'
                    class={cn('stroke-current', variantStyles[variant])}
                    stroke-width={computedStrokeWidth}
                    stroke-dasharray='100'
                    stroke-dashoffset={strokeDashoffset}
                    stroke-linecap='round'
                    style='transition: stroke-dashoffset 0.3s ease-in-out'
                />
            </svg>

            {showLabel && (
                <div class='absolute top-1/2 start-1/2 transform -translate-y-1/2 -translate-x-1/2'>
                    <span
                        class={cn(
                            'text-center font-bold',
                            variantStyles[variant],
                            labelSizeStyles[size],
                        )}
                    >
                        {percentage}%
                    </span>
                </div>
            )}
        </div>
    )
}
