/**
 * @fileoverview Text input component with consistent styling.
 *
 * Supports all standard HTML input types with focus states
 * and accessibility features.
 *
 * @module @lockness/ui/components/input
 */

import type { FC } from '@lockness/core'
import { cn } from '../../lib/utils.ts'

/**
 * Input component props
 */
export interface InputProps {
    /**
     * Input type
     * @default 'text'
     */
    type?:
        | 'text'
        | 'email'
        | 'password'
        | 'number'
        | 'tel'
        | 'url'
        | 'search'
        | 'date'
        | 'time'
        | 'datetime-local'
        | 'month'
        | 'week'
        | 'file'
        | 'hidden'
    /**
     * Input name attribute
     */
    name?: string
    /**
     * Input value
     */
    value?: string | number
    /**
     * Placeholder text
     */
    placeholder?: string
    /**
     * Disable input
     */
    disabled?: boolean
    /**
     * Read-only input
     */
    readonly?: boolean
    /**
     * Required field
     */
    required?: boolean
    /**
     * Autocomplete attribute
     */
    autocomplete?: string
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
 * Input Component
 *
 * Text input component with consistent styling using CSS variables.
 * Supports all standard HTML input types.
 *
 * @example
 * ```tsx
 * // Basic text input
 * <Input type="text" placeholder="Enter your name" />
 *
 * // Email input with label
 * <div>
 *   <Label for="email">Email</Label>
 *   <Input id="email" type="email" placeholder="you@example.com" />
 * </div>
 *
 * // Password input
 * <Input type="password" placeholder="Enter password" />
 *
 * // With custom styling
 * <Input class="max-w-sm" placeholder="Custom styled" />
 * ```
 */
export const Input: FC<InputProps> = ({
    type = 'text',
    class: className,
    ...props
}) => {
    return (
        <input
            type={type}
            class={cn(
                'flex h-10 w-full rounded-(--radius) border border-(--input)',
                'bg-(--background) px-3 py-2 text-sm',
                'ring-offset-(--background)',
                'file:border-0 file:bg-transparent file:text-sm file:font-medium',
                'placeholder:text-(--muted-foreground)',
                'focus-visible:outline-none focus-visible:ring-2',
                'focus-visible:ring-(--ring) focus-visible:ring-offset-(--ring-offset)',
                'disabled:cursor-not-allowed disabled:opacity-50',
                className,
            )}
            {...props}
        />
    )
}
