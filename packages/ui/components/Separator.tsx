import type { FC } from '@lockness/core'
import { cn } from '../lib/utils.ts'

/**
 * Separator component props
 */
export interface SeparatorProps {
    /**
     * Separator orientation
     * @default 'horizontal'
     */
    orientation?: 'horizontal' | 'vertical'
    /**
     * Whether the separator is decorative (for accessibility)
     * @default true
     */
    decorative?: boolean
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
 * Separator Component
 *
 * Visual divider component for separating content.
 * Uses CSS variables for theming.
 *
 * @example
 * ```tsx
 * // Horizontal separator (default)
 * <Separator />
 *
 * // Vertical separator
 * <div class="flex h-5 items-center">
 *   <span>Item 1</span>
 *   <Separator orientation="vertical" class="mx-2" />
 *   <span>Item 2</span>
 * </div>
 *
 * // Semantic separator (not decorative)
 * <Separator decorative={false} />
 *
 * // With custom styling
 * <Separator class="my-8" />
 * ```
 */
export const Separator: FC<SeparatorProps> = ({
    orientation = 'horizontal',
    decorative = true,
    class: className,
    ...props
}) => {
    return (
        <div
            role={decorative ? 'none' : 'separator'}
            aria-orientation={orientation}
            class={cn(
                'shrink-0 bg-(--separator-color)',
                orientation === 'horizontal'
                    ? 'h-(--separator-thickness) w-full'
                    : 'h-full w-(--separator-thickness)',
                className,
            )}
            {...props}
        />
    )
}
