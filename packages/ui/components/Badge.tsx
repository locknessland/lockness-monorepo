import type { FC } from '@lockness/core'
import { cn } from '../lib/utils.ts'

/**
 * Badge component props
 */
export interface BadgeProps {
    /**
     * Visual style variant
     * @default 'default'
     */
    variant?: 'default' | 'secondary' | 'destructive' | 'outline'
    /**
     * Badge content
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
 * Badge Component
 *
 * Inline badge component for labels, tags, and status indicators.
 * Uses CSS variables for theming.
 *
 * @example
 * ```tsx
 * // Default badge
 * <Badge>New</Badge>
 *
 * // Secondary variant
 * <Badge variant="secondary">Beta</Badge>
 *
 * // Destructive variant
 * <Badge variant="destructive">Error</Badge>
 *
 * // Outline variant
 * <Badge variant="outline">Draft</Badge>
 *
 * // With custom styling
 * <Badge class="text-xs">Small</Badge>
 * ```
 */
export const Badge: FC<BadgeProps> = ({
    variant = 'default',
    class: className,
    children,
    ...props
}) => {
    return (
        <span
            class={cn(
                'inline-flex items-center rounded-[calc((--radius)*2)] px-2.5 py-0.5',
                'text-xs font-semibold transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-(--ring)',
                'focus:ring-offset-(--ring-offset)',
                variant === 'default' &&
                    'border-transparent bg-(--primary) text-(--primary-foreground)',
                variant === 'secondary' &&
                    'border-transparent bg-(--secondary) text-(--secondary-foreground)',
                variant === 'destructive' &&
                    'border-transparent bg-(--destructive) text-(--destructive-foreground)',
                variant === 'outline' &&
                    'border border-(--border) text-(--foreground)',
                className,
            )}
            {...props}
        >
            {children}
        </span>
    )
}
