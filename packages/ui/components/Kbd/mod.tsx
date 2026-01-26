/**
 * @fileoverview Keyboard key indicator component.
 *
 * Styled keyboard shortcut display element.
 *
 * @module @lockness/ui/components/kbd
 */

import type { FC } from '@lockness/hono'
import { cn } from '../../lib/utils.ts'

/**
 * Kbd component props
 */
export interface KbdProps {
    /**
     * Keyboard key content
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
 * Kbd Component
 *
 * Keyboard shortcut display component.
 * Uses CSS variables for theming.
 *
 * @example
 * ```tsx
 * // Single key
 * <Kbd>⌘</Kbd>
 *
 * // Keyboard shortcut
 * <div class="flex items-center gap-1">
 *   <Kbd>⌘</Kbd>
 *   <span>+</span>
 *   <Kbd>K</Kbd>
 * </div>
 *
 * // With text
 * <p>
 *   Press <Kbd>Ctrl</Kbd> + <Kbd>C</Kbd> to copy
 * </p>
 *
 * // Custom styling
 * <Kbd class="text-xs">Esc</Kbd>
 * ```
 */
export const Kbd: FC<KbdProps> = ({ class: className, children, ...props }) => {
    return (
        <kbd
            class={cn(
                'pointer-events-none inline-flex select-none items-center',
                'h-(--kbd-height) gap-1',
                'px-(--kbd-padding-x) py-(--kbd-padding-y)',
                'rounded-(--kbd-border-radius)',
                'border-[length:--kbd-border-width] border-(--kbd-border-color)',
                'bg-(--kbd-background) text-(--kbd-foreground)',
                'font-mono text-(length:--kbd-font-size) font-weight-(--kbd-font-weight)',
                className,
            )}
            {...props}
        >
            {children}
        </kbd>
    )
}
