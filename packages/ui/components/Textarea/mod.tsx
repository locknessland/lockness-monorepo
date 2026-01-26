/**
 * @fileoverview Multi-line text input component.
 *
 * Textarea element with consistent styling and focus states.
 *
 * @module @lockness/ui/components/textarea
 */

import type { FC } from '@lockness/hono'
import { cn } from '../../lib/utils.ts'

/**
 * Textarea component props
 */
export interface TextareaProps {
    /**
     * Textarea name attribute
     */
    name?: string
    /**
     * Textarea value
     */
    value?: string
    /**
     * Placeholder text
     */
    placeholder?: string
    /**
     * Disable textarea
     */
    disabled?: boolean
    /**
     * Read-only textarea
     */
    readonly?: boolean
    /**
     * Required field
     */
    required?: boolean
    /**
     * Number of visible text rows
     */
    rows?: number
    /**
     * Number of visible text columns
     */
    cols?: number
    /**
     * Maximum length
     */
    maxlength?: number
    /**
     * Text wrapping mode
     */
    wrap?: 'soft' | 'hard' | 'off'
    /**
     * Additional CSS class names
     */
    class?: string
    /**
     * Element id attribute
     */
    id?: string
    /**
     * Textarea content
     */
    children?: unknown
    /**
     * Additional HTML attributes
     */
    [key: string]: unknown
}

/**
 * Textarea Component
 *
 * Multi-line text input component with consistent styling using CSS variables.
 *
 * @example
 * ```tsx
 * // Basic textarea
 * <Textarea placeholder="Enter your message" />
 *
 * // With label and rows
 * <div>
 *   <Label for="message">Message</Label>
 *   <Textarea id="message" rows={5} placeholder="Your message here..." />
 * </div>
 *
 * // With character limit
 * <Textarea maxlength={500} placeholder="Max 500 characters" />
 *
 * // With custom styling
 * <Textarea class="min-h-[200px]" placeholder="Large textarea" />
 * ```
 */
export const Textarea: FC<TextareaProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <textarea
            class={cn(
                'flex min-h-20 w-full rounded-(--radius)',
                'border border-(--input) bg-(--background)',
                'px-3 py-2 text-sm',
                'ring-offset-(--background)',
                'placeholder:text-(--muted-foreground)',
                'focus-visible:outline-none focus-visible:ring-2',
                'focus-visible:ring-(--ring) focus-visible:ring-offset-(--ring-offset)',
                'disabled:cursor-not-allowed disabled:opacity-50',
                className,
            )}
            {...props}
        >
            {children}
        </textarea>
    )
}
