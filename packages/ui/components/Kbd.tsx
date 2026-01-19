import type { FC } from '@lockness/core'
import { cn } from '../lib/utils.ts'

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
                'pointer-events-none inline-flex h-5 select-none items-center',
                'gap-1 rounded-[calc((--radius)-2px)] border border-(--border)',
                'bg-(--muted) px-1.5 font-mono text-[10px] font-medium',
                'text-(--muted-foreground)',
                'opacity-100',
                className,
            )}
            {...props}
        >
            {children}
        </kbd>
    )
}
