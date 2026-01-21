/**
 * @fileoverview Utility functions for Lockness UI components.
 *
 * Provides class name merging with Tailwind CSS conflict resolution.
 *
 * @module @lockness/ui/lib/utils
 */

import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Utility function for merging class names with Tailwind CSS.
 *
 * Combines clsx for conditional classes and tailwind-merge to properly
 * handle Tailwind class conflicts (e.g., 'px-2 px-4' → 'px-4').
 *
 * @param inputs - Class values (strings, objects, arrays, or conditional expressions)
 * @returns Merged class string with conflicts resolved
 *
 * @example Basic usage
 * ```typescript
 * cn('px-2 py-1', 'bg-blue-500')
 * // => 'px-2 py-1 bg-blue-500'
 * ```
 *
 * @example Conflict resolution
 * ```typescript
 * cn('px-2', 'px-4')
 * // => 'px-4' (tailwind-merge removes conflicting px-2)
 * ```
 *
 * @example Conditional classes
 * ```typescript
 * cn('text-base', isLarge && 'text-lg')
 * // => 'text-lg' when isLarge is true
 *
 * cn('text-base', { 'text-lg': isLarge })
 * // => Object syntax for conditionals
 * ```
 *
 * @example Component usage
 * ```tsx
 * const Button: FC<{ class?: string }> = ({ class: className }) => (
 *     <button class={cn('px-4 py-2 bg-primary', className)}>
 *         Click me
 *     </button>
 * )
 * ```
 */
export function cn(...inputs: ClassValue[]): string {
    return twMerge(clsx(inputs))
}
