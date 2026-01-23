/**
 * @fileoverview Styled anchor link component.
 *
 * Link variants with button-like styling options and icon support.
 *
 * @module @lockness/ui/components/link
 */

import type { FC } from '@lockness/core'
import { cn } from '../../lib/utils.ts'

/**
 * Link component props
 */
export interface LinkProps {
    /**
     * URL to navigate to
     */
    href: string
    /**
     * Visual style variant
     * @default 'default'
     */
    variant?:
        | 'default'
        | 'primary'
        | 'secondary'
        | 'outline'
        | 'ghost'
        | 'danger'
    /**
     * Link size
     * @default 'md'
     */
    size?: 'sm' | 'md' | 'lg'
    /**
     * Unpoly target selector
     * @default 'body'
     */
    target?: string
    /**
     * Link content
     */
    children?: unknown
    /**
     * Additional CSS class names
     */
    class?: string
    /**
     * Additional HTML/Unpoly attributes
     */
    [key: string]: unknown
}

const variantClasses = {
    default: 'text-blue-600 hover:text-blue-800 hover:underline',
    primary:
        'inline-flex items-center justify-center font-medium rounded-(--radius) bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 transition-colors duration-150',
    secondary:
        'inline-flex items-center justify-center font-medium rounded-(--radius) bg-gray-600 text-white hover:bg-gray-700 active:bg-gray-800 transition-colors duration-150',
    outline:
        'inline-flex items-center justify-center font-medium rounded-(--radius) border-2 border-gray-300 text-gray-700 hover:bg-gray-100 active:bg-gray-200 transition-colors duration-150',
    ghost:
        'inline-flex items-center justify-center font-medium rounded-(--radius) text-gray-700 hover:bg-gray-100 active:bg-gray-200 transition-colors duration-150',
    danger:
        'inline-flex items-center justify-center font-medium rounded-(--radius) bg-red-600 text-white hover:bg-red-700 active:bg-red-800 transition-colors duration-150',
}

const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
}

/**
 * Link Component
 *
 * A navigation link component with Unpoly integration.
 * Automatically uses up-follow for progressive enhancement.
 *
 * @example
 * ```tsx
 * // Default text link
 * <Link href="/users">View Users</Link>
 *
 * // Button-style link
 * <Link href="/settings" variant="primary">Settings</Link>
 *
 * // Outline variant with custom target
 * <Link href="/profile" variant="outline" target=".content">
 *   My Profile
 * </Link>
 *
 * // Small ghost link
 * <Link href="/help" variant="ghost" size="sm">Help</Link>
 * ```
 */
export const Link: FC<LinkProps> = ({
    href,
    variant = 'default',
    size = 'md',
    target = 'body',
    class: className,
    children,
    ...props
}) => {
    // For button-style variants, apply size classes
    const needsSizeClasses = variant !== 'default'

    const classes = cn(
        // Variant styles
        variantClasses[variant],
        // Size styles (only for button-style variants)
        needsSizeClasses && sizeClasses[size],
        // Focus ring for button-style variants
        needsSizeClasses &&
            'focus:outline-none focus:ring-2 focus:ring-offset-(--ring-offset) focus:ring-(--ring)',
        // Custom classes
        className,
    )

    // For external links (target="_blank"), don't use Unpoly
    const isExternalLink = target === '_blank'

    return (
        <a
            href={href}
            target={isExternalLink ? '_blank' : undefined}
            rel={isExternalLink ? 'noopener noreferrer' : undefined}
            up-follow={isExternalLink ? undefined : ''}
            up-target={isExternalLink ? undefined : target}
            class={classes}
            {...props}
        >
            {children}
        </a>
    )
}
