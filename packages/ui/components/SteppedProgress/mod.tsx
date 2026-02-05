/**
 * @fileoverview Stepped progress indicator component.
 *
 * Multi-step progress bar for wizards and multi-stage processes.
 *
 * @module @lockness/ui/components/stepped-progress
 */

import type { FC } from '@lockness/hono'
import type { JSX } from '@lockness/hono/jsx-runtime'
import { cn } from '../../lib/utils.ts'

/**
 * SteppedProgress component props
 */
export interface SteppedProgressProps
    extends Omit<JSX.IntrinsicElements['div'], 'class' | 'id'> {
    /**
     * Current step (1-based index)
     * @default 0
     */
    value?: number
    /**
     * Total number of steps
     * @default 4
     */
    steps?: number
    /**
     * Visual style variant
     * @default 'default'
     */
    variant?: 'default' | 'success' | 'warning' | 'destructive'
    /**
     * Custom thickness in Tailwind spacing units (1 = 0.25rem)
     * @default 2.5 (h-2.5)
     * @deprecated Use CSS variable --stepped-progress-connector-height instead
     */
    thickness?: number
    /**
     * Show percentage label at the end (deprecated, use endLabel)
     * @default false
     * @deprecated Use endLabel instead
     */
    showLabel?: boolean
    /**
     * Show label inside the progress bar (step X of Y)
     * @default false
     */
    innerLabel?: boolean
    /**
     * Show percentage label at the end (right side)
     * @default false
     */
    endLabel?: boolean
    /**
     * Show checkmark icon when complete (100%)
     * @default false
     */
    showCheck?: boolean
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
     * Step labels (optional array of label strings)
     */
    labels?: string[]
    /**
     * Additional CSS class names
     */
    class?: string
    /**
     * Element id attribute
     */
    id?: string
}

const variantStyles = {
    default: {
        active: 'bg-(--stepped-progress-active-color)',
        inactive: 'bg-(--stepped-progress-inactive-color)',
        completed: 'bg-(--stepped-progress-completed-color)',
        label: 'text-foreground',
    },
    success: {
        active: 'bg-teal-500',
        inactive: 'bg-teal-100 dark:bg-teal-500/30',
        completed: 'bg-teal-500',
        label: 'text-foreground',
    },
    warning: {
        active: 'bg-yellow-500',
        inactive: 'bg-yellow-100 dark:bg-yellow-500/30',
        completed: 'bg-yellow-500',
        label: 'text-yellow-500',
    },
    destructive: {
        active: 'bg-red-600',
        inactive: 'bg-red-100 dark:bg-red-500/30',
        completed: 'bg-red-600',
        label: 'text-red-500',
    },
}

const outlineVariantStyles = {
    default: 'border-primary/50 bg-primary/10',
    success: 'border-teal-500/50 bg-teal-500/10',
    warning: 'border-yellow-500/50 bg-yellow-500/10',
    destructive: 'border-red-600/50 bg-red-600/10',
}

/**
 * SteppedProgress Component
 *
 * A segmented progress bar showing discrete steps.
 * Useful for multi-step forms, onboarding flows, or displaying progress in stages.
 *
 * @example
 * ```tsx
 * // Basic usage (2 of 4 steps completed)
 * <SteppedProgress value={2} steps={4} />
 *
 * // With step labels
 * <SteppedProgress value={2} steps={4} labels={['Account', 'Profile', 'Preferences', 'Complete']} />
 *
 * // With end label (percentage at the end)
 * <SteppedProgress value={2} steps={4} endLabel />
 *
 * // With inner label (step X of Y inside the bar)
 * <SteppedProgress value={2} steps={4} innerLabel thickness={6} />
 *
 * // With checkmark when complete
 * <SteppedProgress value={4} steps={4} showCheck />
 *
 * // Different variants
 * <SteppedProgress value={1} steps={4} variant="destructive" showLabel />
 * <SteppedProgress value={4} steps={4} variant="success" showCheck />
 *
 * // Custom thickness
 * <SteppedProgress value={3} steps={5} thickness={4} />
 *
 * // More steps (10 steps)
 * <SteppedProgress value={10} steps={10} variant="success" showCheck />
 *
 * // Striped progress
 * <SteppedProgress value={3} steps={5} striped />
 * <SteppedProgress value={3} steps={5} striped animated />
 *
 * // Outlined progress (with border wrapper)
 * <SteppedProgress value={3} steps={5} outlined />
 * <SteppedProgress value={3} steps={5} outlined striped animated variant="success" />
 * ```
 */
export const SteppedProgress: FC<SteppedProgressProps> = ({
    value = 0,
    steps = 4,
    variant = 'default',
    thickness: _thickness = 2.5,
    showLabel = false,
    innerLabel = false,
    endLabel = false,
    showCheck = false,
    striped: _striped = false,
    animated: _animated = false,
    outlined = false,
    labels,
    class: className,
    id,
    ...props
}) => {
    // Clamp value between 0 and steps
    const clampedValue = Math.min(Math.max(0, value), steps)
    const percentage = Math.round((clampedValue / steps) * 100)
    const isComplete = clampedValue === steps

    const styles = variantStyles[variant]

    // Determine if we should show end label (endLabel or deprecated showLabel)
    const shouldShowEndLabel = endLabel || showLabel

    const stepsBar = (
        <div
            class={cn(
                'flex items-center gap-x-2 w-full',
                outlined && 'bg-transparent',
            )}
            role='group'
            aria-label={`Progress: ${clampedValue} of ${steps} steps (${percentage}%)`}
        >
            {Array.from({ length: steps }, (_, index) => {
                const stepNumber = index + 1
                const isCompleted = stepNumber < clampedValue
                const isActive = stepNumber === clampedValue
                const isVisited = stepNumber <= clampedValue
                const hasLabel = labels && labels[index]

                return (
                    <div
                        key={index}
                        class='flex items-center flex-1'
                    >
                        {/* Step Circle */}
                        <div class='flex flex-col items-center'>
                            <div
                                role='progressbar'
                                aria-valuenow={isVisited ? 100 : 0}
                                aria-valuemin={0}
                                aria-valuemax={100}
                                aria-label={`Step ${stepNumber} of ${steps}`}
                                class={cn(
                                    'size-(--stepped-progress-step-size) rounded-full flex items-center justify-center transition-colors duration-300',
                                    'text-[length:--stepped-progress-step-font-size] font-(--stepped-progress-step-font-weight)',
                                    isCompleted && styles.completed,
                                    isActive && !isCompleted && styles.active,
                                    !isVisited && styles.inactive,
                                    isVisited && 'text-white',
                                    !isVisited && 'text-muted-foreground',
                                )}
                            >
                                {isCompleted
                                    ? (
                                        <svg
                                            class='size-4'
                                            xmlns='http://www.w3.org/2000/svg'
                                            width='24'
                                            height='24'
                                            viewBox='0 0 24 24'
                                            fill='none'
                                            stroke='currentColor'
                                            stroke-width='2'
                                            stroke-linecap='round'
                                            stroke-linejoin='round'
                                        >
                                            <polyline points='20 6 9 17 4 12' />
                                        </svg>
                                    )
                                    : stepNumber}
                            </div>

                            {/* Step Label */}
                            {hasLabel && (
                                <span
                                    class={cn(
                                        'text-[length:--stepped-progress-label-font-size] mt-(--stepped-progress-label-margin-top)',
                                        'text-center',
                                        isVisited
                                            ? styles.label
                                            : 'text-muted-foreground',
                                    )}
                                >
                                    {labels[index]}
                                </span>
                            )}
                        </div>

                        {/* Connector Line (not shown after last step) */}
                        {index < steps - 1 && (
                            <div
                                class={cn(
                                    'flex-1 h-(--stepped-progress-connector-height) mx-2 transition-colors duration-300',
                                    isCompleted
                                        ? 'bg-(--stepped-progress-completed-color)'
                                        : 'bg-(--stepped-progress-connector-color)',
                                )}
                            />
                        )}
                    </div>
                )
            })}
        </div>
    )

    // Wrap in outline container if outlined
    const wrappedStepsBar = outlined
        ? (
            <div
                class={cn(
                    'w-full border-(length:--progress-outline-border-width,2px)',
                    outlineVariantStyles[variant],
                )}
                style='padding: var(--progress-outline-padding, 0.25rem); border-radius: var(--progress-outline-border-radius, calc(var(--radius) + 4px))'
            >
                {stepsBar}
            </div>
        )
        : stepsBar

    return (
        <div
            id={id}
            class={cn('flex items-center gap-x-2', className)}
            {...props}
        >
            {wrappedStepsBar}

            {shouldShowEndLabel && !showCheck && !innerLabel && (
                <div class='w-10 text-end'>
                    <span
                        class={cn(
                            'text-[length:--stepped-progress-label-font-size]',
                            styles.label,
                        )}
                    >
                        {percentage}%
                    </span>
                </div>
            )}

            {showCheck && isComplete && (
                <div class='ms-1'>
                    <span
                        class={cn(
                            'shrink-0 size-4 flex justify-center items-center rounded-full text-white',
                            styles.completed,
                        )}
                    >
                        <svg
                            class='shrink-0 size-3'
                            xmlns='http://www.w3.org/2000/svg'
                            width='24'
                            height='24'
                            viewBox='0 0 24 24'
                            fill='none'
                            stroke='currentColor'
                            stroke-width='2'
                            stroke-linecap='round'
                            stroke-linejoin='round'
                        >
                            <polyline points='20 6 9 17 4 12' />
                        </svg>
                    </span>
                </div>
            )}

            {showCheck && !isComplete && shouldShowEndLabel && !innerLabel && (
                <div class='w-10 text-end'>
                    <span
                        class={cn(
                            'text-[length:--stepped-progress-label-font-size]',
                            styles.label,
                        )}
                    >
                        {percentage}%
                    </span>
                </div>
            )}
        </div>
    )
}
