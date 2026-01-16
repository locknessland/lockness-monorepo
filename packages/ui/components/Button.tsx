import type { FC } from 'hono/jsx'
import { cn } from '../lib/utils.ts'

/**
 * Button component props
 */
export interface ButtonProps {
    /**
     * Visual style variant
     * @default 'primary'
     */
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
    /**
     * Button size
     * @default 'md'
     */
    size?: 'sm' | 'md' | 'lg'
    /**
     * Disable button interactions
     * @default false
     */
    disabled?: boolean
    /**
     * Button content
     */
    children?: unknown
    /**
     * Additional CSS class names
     */
    class?: string
    /**
     * Button type attribute
     */
    type?: 'button' | 'submit' | 'reset'
    /**
     * Button id attribute
     */
    id?: string
    /**
     * Additional HTML attributes (for Unpoly, etc.)
     */
    [key: string]: unknown
}

const variantClasses = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 ' +
        'disabled:bg-blue-300',
    secondary: 'bg-gray-600 text-white hover:bg-gray-700 active:bg-gray-800 ' +
        'disabled:bg-gray-300',
    outline: 'border-2 border-gray-300 text-gray-700 hover:bg-gray-100 ' +
        'active:bg-gray-200 disabled:border-gray-200 disabled:text-gray-400',
    ghost: 'text-gray-700 hover:bg-gray-100 active:bg-gray-200 ' +
        'disabled:text-gray-400',
    danger: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 ' +
        'disabled:bg-red-300',
}

const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
}

/**
 * Button Component
 *
 * A flexible button component with multiple variants and sizes.
 * Supports all standard HTML button attributes and Unpoly directives.
 *
 * @example
 * ```tsx
 * // Primary button
 * <Button>Click me</Button>
 *
 * // Outline variant
 * <Button variant="outline">Cancel</Button>
 *
 * // With Unpoly navigation
 * <Button up-target=".main" up-href="/users">Load Users</Button>
 *
 * // Small danger button
 * <Button variant="danger" size="sm">Delete</Button>
 * ```
 */
export const Button: FC<ButtonProps> = ({
    variant = 'primary',
    size = 'md',
    disabled = false,
    class: className,
    children,
    ...props
}) => {
    const classes = cn(
        // Base styles
        'inline-flex items-center justify-center',
        'font-medium rounded-lg',
        'transition-colors duration-150',
        'focus:outline-none focus:ring-2 focus:ring-offset-2 ' +
            'focus:ring-blue-500',
        'disabled:cursor-not-allowed disabled:opacity-60',
        // Variant styles
        variantClasses[variant],
        // Size styles
        sizeClasses[size],
        // Custom classes
        className,
    )

    return (
        <button class={classes} disabled={disabled} {...props}>
            {children}
        </button>
    )
}
