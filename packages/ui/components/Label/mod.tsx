/**
 * @fileoverview Form label component with consistent styling.
 *
 * Accessible label element that works with peer-disabled states.
 *
 * @module @lockness/ui/components/label
 */

import type { FC } from '@lockness/hono'
import { cn } from '../../lib/utils.ts'

/**
 * Label component props
 */
export interface LabelProps {
    /**
     * The HTML for attribute (links label to form control)
     */
    for?: string
    /**
     * Label content
     */
    children?: unknown
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
 * Label Component
 *
 * Form label component with consistent styling.
 * Uses CSS variables for theming.
 *
 * @example
 * ```tsx
 * // Basic label
 * <Label for="email">Email</Label>
 *
 * // With custom styling
 * <Label for="email" class="text-lg">Email Address</Label>
 * ```
 */
export const Label: FC<LabelProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <label
            class={cn(
                'text-sm font-medium leading-none',
                'text-(--foreground)',
                'peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
                className,
            )}
            {...props}
        >
            {children}
        </label>
    )
}
