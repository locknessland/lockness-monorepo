import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Utility function for merging class names with Tailwind CSS
 *
 * Combines clsx for conditional classes and tailwind-merge to properly
 * handle Tailwind class conflicts (e.g., 'px-2 px-4' -> 'px-4')
 *
 * @param inputs - Class values (strings, objects, arrays)
 * @returns Merged class string
 *
 * @example
 * ```typescript
 * cn('px-2 py-1', 'bg-blue-500')
 * // => 'px-2 py-1 bg-blue-500'
 *
 * cn('px-2', { 'px-4': true })
 * // => 'px-4' (tailwind-merge removes conflicting px-2)
 *
 * cn('text-base', isLarge && 'text-lg')
 * // => 'text-base' or 'text-lg'
 * ```
 */
export function cn(...inputs: ClassValue[]): string {
    return twMerge(clsx(inputs))
}
