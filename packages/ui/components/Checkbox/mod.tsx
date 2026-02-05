/**
 * @fileoverview Checkbox input component with custom styling.
 *
 * Native checkbox element with consistent theming using CSS variables.
 *
 * @module @lockness/ui/components/checkbox
 */

import type { FC } from '@lockness/hono'
import { cn } from '../../lib/utils.ts'

/**
 * Checkbox component props
 */
export interface CheckboxProps {
    /**
     * Checkbox name attribute
     */
    name?: string
    /**
     * Checkbox value
     */
    value?: string
    /**
     * Checked state
     */
    checked?: boolean
    /**
     * Disable checkbox
     */
    disabled?: boolean
    /**
     * Required field
     */
    required?: boolean
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
 * Checkbox Component
 *
 * Checkbox input component with custom styling using CSS variables.
 * Note: For better styling control, consider wrapping in a custom label.
 *
 * @example
 * ```tsx
 * // Basic checkbox
 * <Checkbox id="terms" name="terms" />
 *
 * // With label
 * <div class="flex items-center space-x-2">
 *   <Checkbox id="terms" />
 *   <Label for="terms">Accept terms and conditions</Label>
 * </div>
 *
 * // Checked by default
 * <Checkbox checked />
 *
 * // Disabled state
 * <Checkbox disabled />
 *
 * // With custom styling
 * <Checkbox class="custom-class" />
 * ```
 */
export const Checkbox: FC<CheckboxProps> = ({
    class: className,
    ...props
}) => {
    return (
        <input
            type='checkbox'
            class={cn(
                'peer h-(--checkbox-size) w-(--checkbox-size) shrink-0 rounded-(--checkbox-border-radius)',
                'border border-(--checkbox-border-color)',
                'ring-offset-(--background)',
                'focus-visible:outline-none focus-visible:ring-2',
                'focus-visible:ring-(--ring) focus-visible:ring-offset-(--ring-offset)',
                'disabled:cursor-not-allowed disabled:opacity-50',
                'accent-(--checkbox-accent-color)',
                className,
            )}
            {...props}
        />
    )
}
