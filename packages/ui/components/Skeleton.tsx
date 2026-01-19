import type { FC } from '@lockness/core'
import { cn } from '../lib/utils.ts'

/**
 * Skeleton component props
 */
export interface SkeletonProps {
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
 * Uses CSS variables for theming.
 *
 * @example
 * ```tsx
 * // Basic skeleton
 * <Skeleton class="h-12 w-12 rounded-full" />
 *
 * // Text line skeleton
 * <Skeleton class="h-4 w-[250px]" />
 *
 * // Card skeleton
 * <div class="flex flex-col space-y-3">
 *   <Skeleton class="h-[125px] w-[250px] rounded-xl" />
 *   <div class="space-y-2">
 *     <Skeleton class="h-4 w-[250px]" />
 *     <Skeleton class="h-4 w-[200px]" />
 *   </div>
 * </div>
 *
 * // Avatar skeleton
 * <div class="flex items-center space-x-4">
 *   <Skeleton class="h-12 w-12 rounded-full" />
 *   <div class="space-y-2">
 *     <Skeleton class="h-4 w-[250px]" />
 *     <Skeleton class="h-4 w-[200px]" />
 *   </div>
 * </div>
 * ```
 */
export const Skeleton: FC<SkeletonProps> = ({
    class: className,
    ...props
}) => {
    return (
        <div
            class={cn(
                'animate-pulse rounded-(--radius)',
                'bg-(--muted)',
                className,
            )}
            {...props}
        />
    )
}
