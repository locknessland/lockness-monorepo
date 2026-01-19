import type { FC } from '@lockness/core'
import { cn } from '../lib/utils.ts'

/**
 * Skeleton variant type
 */
export type SkeletonVariant =
    | 'default'
    | 'text'
    | 'heading'
    | 'avatar'
    | 'button'
    | 'image'
    | 'card'

/**
 * Skeleton component props
 */
export interface SkeletonProps {
    /**
     * Skeleton variant for common shapes
     * @default 'default'
     */
    variant?: SkeletonVariant
    /**
     * Number of lines (for text variant)
     * @default 1
     */
    lines?: number
    /**
     * Whether to animate the skeleton
     * @default true
     */
    animate?: boolean
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

/**
 * Skeleton Component
 *
 * Loading placeholder component with animated pulse effect.
 * Uses CSS variables for theming and supports multiple variants.
 *
 * @example Default skeleton
 * ```tsx
 * <Skeleton class="h-12 w-12" />
 * ```
 *
 * @example Text skeleton
 * ```tsx
 * <Skeleton variant="text" />
 * <Skeleton variant="text" lines={3} />
 * ```
 *
 * @example Heading skeleton
 * ```tsx
 * <Skeleton variant="heading" />
 * ```
 *
 * @example Avatar skeleton
 * ```tsx
 * <Skeleton variant="avatar" />
 * ```
 *
 * @example Button skeleton
 * ```tsx
 * <Skeleton variant="button" />
 * ```
 *
 * @example Image skeleton
 * ```tsx
 * <Skeleton variant="image" />
 * ```
 *
 * @example Card skeleton
 * ```tsx
 * <Skeleton variant="card" />
 * ```
 *
 * @example Without animation
 * ```tsx
 * <Skeleton variant="text" animate={false} />
 * ```
 */
export const Skeleton: FC<SkeletonProps> = ({
    variant = 'default',
    lines = 1,
    animate = true,
    class: className,
    ...props
}) => {
    const baseClasses = cn(
        animate && 'animate-pulse',
        'bg-(--skeleton-background)',
    )

    // Text variant - multiple lines
    if (variant === 'text') {
        return (
            <div class={cn('space-y-2', className)} {...props}>
                {Array.from({ length: lines }).map((_, i) => (
                    <div
                        key={i}
                        class={cn(
                            baseClasses,
                            'h-4 rounded-(--skeleton-border-radius)',
                            i === lines - 1 && lines > 1 ? 'w-4/5' : 'w-full',
                        )}
                    />
                ))}
            </div>
        )
    }

    // Heading variant
    if (variant === 'heading') {
        return (
            <div
                class={cn(
                    baseClasses,
                    'h-8 w-3/4 rounded-(--skeleton-border-radius)',
                    className,
                )}
                {...props}
            />
        )
    }

    // Avatar variant
    if (variant === 'avatar') {
        return (
            <div
                class={cn(
                    baseClasses,
                    'h-12 w-12 rounded-full',
                    className,
                )}
                {...props}
            />
        )
    }

    // Button variant
    if (variant === 'button') {
        return (
            <div
                class={cn(
                    baseClasses,
                    'h-10 w-24 rounded-(--skeleton-border-radius)',
                    className,
                )}
                {...props}
            />
        )
    }

    // Image variant
    if (variant === 'image') {
        return (
            <div
                class={cn(
                    baseClasses,
                    'h-48 w-full rounded-(--skeleton-border-radius)',
                    className,
                )}
                {...props}
            />
        )
    }

    // Card variant - complete card skeleton
    if (variant === 'card') {
        return (
            <div
                class={cn(
                    'rounded-(--skeleton-border-radius) border border-(--border) p-4 space-y-4',
                    className,
                )}
                {...props}
            >
                <div
                    class={cn(
                        baseClasses,
                        'h-48 w-full rounded-(--skeleton-border-radius)',
                    )}
                />
                <div class='space-y-2'>
                    <div
                        class={cn(
                            baseClasses,
                            'h-6 w-3/4 rounded-(--skeleton-border-radius)',
                        )}
                    />
                    <div
                        class={cn(
                            baseClasses,
                            'h-4 w-full rounded-(--skeleton-border-radius)',
                        )}
                    />
                    <div
                        class={cn(
                            baseClasses,
                            'h-4 w-5/6 rounded-(--skeleton-border-radius)',
                        )}
                    />
                </div>
                <div
                    class={cn(
                        baseClasses,
                        'h-10 w-full rounded-(--skeleton-border-radius)',
                    )}
                />
            </div>
        )
    }

    // Default variant - simple rectangular skeleton
    return (
        <div
            class={cn(
                baseClasses,
                'rounded-(--skeleton-border-radius)',
                className,
            )}
            {...props}
        />
    )
}

/**
 * SkeletonText Component
 *
 * Convenience component for text skeletons.
 *
 * @example
 * ```tsx
 * <SkeletonText lines={3} />
 * ```
 */
export const SkeletonText: FC<Omit<SkeletonProps, 'variant'>> = (props) => {
    return <Skeleton variant='text' {...props} />
}

/**
 * SkeletonAvatar Component
 *
 * Convenience component for avatar skeletons.
 *
 * @example
 * ```tsx
 * <SkeletonAvatar />
 * ```
 */
export const SkeletonAvatar: FC<Omit<SkeletonProps, 'variant'>> = (props) => {
    return <Skeleton variant='avatar' {...props} />
}

/**
 * SkeletonCard Component
 *
 * Convenience component for card skeletons.
 *
 * @example
 * ```tsx
 * <SkeletonCard />
 * ```
 */
export const SkeletonCard: FC<Omit<SkeletonProps, 'variant'>> = (props) => {
    return <Skeleton variant='card' {...props} />
}
