import type { FC } from '@lockness/core'
import { cn } from '../lib/utils.ts'

/**
 * Switch component props
 */
export interface SwitchProps {
    /**
     * Switch name attribute
     */
    name?: string
    /**
     * Switch value
     */
    value?: string
    /**
     * Checked state
     */
    checked?: boolean
    /**
     * Disable switch
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
 * Switch Component
 *
 * Toggle switch component styled as a modern switch control.
 * Uses CSS variables for theming.
 *
 * Note: This is a styled checkbox input. For full custom switch behavior,
 * consider using Unpoly or custom JavaScript.
 *
 * @example
 * ```tsx
 * // Basic switch
 * <Switch id="notifications" name="notifications" />
 *
 * // With label
 * <div class="flex items-center space-x-2">
 *   <Switch id="notifications" />
 *   <Label for="notifications">Enable notifications</Label>
 * </div>
 *
 * // Checked by default
 * <Switch checked />
 *
 * // Disabled state
 * <Switch disabled />
 * ```
 */
export const Switch: FC<SwitchProps> = ({ class: className, ...props }) => {
    return (
        <label
            class={cn(
                'relative inline-flex h-6 w-11 shrink-0 cursor-pointer',
                'items-center rounded-full transition-colors',
                'focus-within:outline-none focus-within:ring-2',
                'focus-within:ring-(--ring) focus-within:ring-offset-(--ring-offset)',
                'focus-within:ring-offset-(--background)',
                'bg-(--input)',
                'has-checked:bg-(--primary)',
                'has-disabled:cursor-not-allowed has-disabled:opacity-50',
                className,
            )}
        >
            <input
                type='checkbox'
                class='peer sr-only'
                role='switch'
                {...props}
            />
            <span
                class={cn(
                    'pointer-events-none block h-5 w-5 rounded-full',
                    'bg-(--background) shadow-lg ring-0',
                    'transition-transform',
                    'translate-x-0.5',
                    'peer-checked:translate-x-5.5',
                )}
            />
        </label>
    )
}
