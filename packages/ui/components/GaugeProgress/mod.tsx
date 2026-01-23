/**
 * @fileoverview Gauge-style progress indicator component.
 *
 * Circular gauge with SVG-based rendering and multiple arc types.
 *
 * @module @lockness/ui/components/gauge-progress
 */

import type { FC } from '@lockness/core'
import type { JSX } from '@lockness/core/jsx-runtime'
import { cn } from '../../lib/utils.ts'

/**
 * GaugeProgress component props
 */
export interface GaugeProgressProps
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
     * Gauge type: 'gauge' (270°) or 'half' (180°)
     * @default 'gauge'
     */
    type?: 'gauge' | 'half'
    /**
     * Visual style variant
     * @default 'default'
     */
    variant?: 'default' | 'success' | 'warning' | 'destructive'
    /**
     * Size of the gauge
     * @default 'default'
     */
    size?: 'sm' | 'default' | 'lg' | 'xl'
    /**
     * Stroke width of the progress arc
     * @default 1.5
     */
    strokeWidth?: number
    /**
     * Stroke width of the background track (defaults to strokeWidth if not set)
     */
    trackStrokeWidth?: number
    /**
     * Shape of the stroke ends: 'round' for rounded, 'butt' for flat/square
     * @default 'round'
     */
    strokeLinecap?: 'round' | 'butt' | 'square'
    /**
     * Custom color class for the progress arc (overrides variant)
     * Use Tailwind text color classes, e.g., 'text-purple-600 dark:text-purple-500'
     */
    progressColor?: string
    /**
     * Custom color class for the background track
     * Use Tailwind text color classes, e.g., 'text-purple-200 dark:text-neutral-700'
     */
    trackColor?: string
    /**
     * Show the value label in the center
     * @default true
     */
    showLabel?: boolean
    /**
     * Custom label to display below the value (e.g., "Score", "Progress")
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
}

const sizeStyles = {
    sm: 'size-20',
    default: 'size-32',
    lg: 'size-40',
    xl: 'size-48',
}

const valueSizeStyles = {
    sm: 'text-lg',
    default: 'text-2xl',
    lg: 'text-4xl',
    xl: 'text-5xl',
}

const labelSizeStyles = {
    sm: 'text-xs',
    default: 'text-sm',
    lg: 'text-base',
    xl: 'text-lg',
}

const variantStyles = {
    default: 'text-primary',
    success: 'text-teal-500',
    warning: 'text-yellow-500',
    destructive: 'text-red-500',
}

const trackStyles = 'text-gray-200 dark:text-neutral-700'

/**
 * GaugeProgress Component
 *
 * A gauge/dial progress component for displaying metrics like scores,
 * performance indicators, or completion status.
 *
 * @example
 * ```tsx
 * // Basic gauge (270°)
 * <GaugeProgress value={50} />
 *
 * // Half circle gauge (180°)
 * <GaugeProgress value={75} type="half" />
 *
 * // With custom label
 * <GaugeProgress value={85} label="Score" />
 *
 * // Different variants
 * <GaugeProgress value={90} variant="success" label="Health" />
 * <GaugeProgress value={30} variant="destructive" label="Risk" />
 *
 * // Different sizes
 * <GaugeProgress value={60} size="sm" />
 * <GaugeProgress value={60} size="xl" />
 *
 * // Custom stroke width
 * <GaugeProgress value={70} strokeWidth={3} />
 *
 * // Custom track stroke width (thicker track)
 * <GaugeProgress value={50} strokeWidth={1} trackStrokeWidth={3} />
 *
 * // Flat stroke ends (no rounded caps)
 * <GaugeProgress value={25} strokeLinecap="butt" />
 *
 * // Custom colors (overrides variant)
 * <GaugeProgress value={75} progressColor="text-purple-600 dark:text-purple-500" trackColor="text-purple-200 dark:text-neutral-700" />
 *
 * // Without label
 * <GaugeProgress value={50} showLabel={false} />
 * ```
 */
export const GaugeProgress: FC<GaugeProgressProps> = ({
    value = 0,
    max = 100,
    type = 'gauge',
    variant = 'default',
    size = 'default',
    strokeWidth = 1.5,
    trackStrokeWidth,
    strokeLinecap = 'round',
    progressColor,
    trackColor,
    showLabel = true,
    label,
    class: className,
    id,
    ...props
}) => {
    // Clamp value between 0 and max
    const clampedValue = Math.min(Math.max(0, value), max)
    const percentage = Math.round((clampedValue / max) * 100)

    // For gauge (270°), max dasharray is 75; for half (180°), max is 50
    const maxDasharray = type === 'gauge' ? 75 : 50
    const progressDasharray = (percentage / 100) * maxDasharray

    // Rotation: gauge rotates 135deg, half rotates 180deg
    const rotation = type === 'gauge' ? 'rotate-[135deg]' : 'rotate-180'

    // Value text positioning
    const valuePosition = type === 'gauge'
        ? 'top-1/2 start-1/2 -translate-x-1/2 -translate-y-1/2'
        : 'top-1/2 start-1/2 -translate-x-1/2 -translate-y-1/4'

    // Determine track stroke width (defaults to strokeWidth if not specified)
    const effectiveTrackStrokeWidth = trackStrokeWidth ?? strokeWidth

    // Determine colors (custom colors override variant)
    const effectiveProgressColor = progressColor || variantStyles[variant]
    const effectiveTrackColor = trackColor || trackStyles

    return (
        <div
            id={id}
            class={cn('relative', sizeStyles[size], className)}
            style='border-radius: var(--radius)'
            role='meter'
            aria-valuenow={clampedValue}
            aria-valuemin={0}
            aria-valuemax={max}
            aria-label={label || 'Gauge progress'}
            {...props}
        >
            <svg
                class={cn('size-full', rotation)}
                viewBox='0 0 36 36'
                xmlns='http://www.w3.org/2000/svg'
            >
                {/* Background Track */}
                <circle
                    cx='18'
                    cy='18'
                    r='16'
                    fill='none'
                    class={cn('stroke-current', effectiveTrackColor)}
                    stroke-width={effectiveTrackStrokeWidth}
                    stroke-dasharray={`${maxDasharray} 100`}
                    stroke-linecap={strokeLinecap}
                />

                {/* Progress Arc */}
                <circle
                    cx='18'
                    cy='18'
                    r='16'
                    fill='none'
                    class={cn('stroke-current', effectiveProgressColor)}
                    stroke-width={strokeWidth}
                    stroke-dasharray={`${progressDasharray} 100`}
                    stroke-linecap={strokeLinecap}
                />
            </svg>

            {/* Value Text */}
            {showLabel && (
                <div
                    class={cn(
                        'absolute transform text-center',
                        valuePosition,
                    )}
                >
                    <span
                        class={cn(
                            'font-bold',
                            valueSizeStyles[size],
                            effectiveProgressColor,
                        )}
                    >
                        {percentage}
                    </span>
                    {label && (
                        <span
                            class={cn(
                                'block',
                                labelSizeStyles[size],
                                effectiveProgressColor,
                            )}
                        >
                            {label}
                        </span>
                    )}
                </div>
            )}
        </div>
    )
}
