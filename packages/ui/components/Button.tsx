import type { FC } from '@lockness/core'
import { cn } from '../lib/utils.ts'

/**
 * Unpoly built-in transition animations
 * @see https://unpoly.com/up-transition
 */
export type UnpolyTransition =
    | 'move-left'
    | 'move-right'
    | 'move-up'
    | 'move-down'
    | 'cross-fade'
    | 'none'
    // Allow custom transitions while keeping autocomplete
    // deno-lint-ignore ban-types
    | (string & {})

/**
 * Unpoly target selectors
 * @see https://unpoly.com/up-target
 */
export type UnpolyTarget =
    | ':main'
    | ':layer'
    | ':origin'
    | ':none'
    | 'body'
    // Allow custom selectors while keeping autocomplete
    // deno-lint-ignore ban-types
    | (string & {})

/**
 * CSS easing functions for Unpoly transitions
 * @see https://unpoly.com/up-easing
 */
export type UnpolyEasing =
    | 'linear'
    | 'ease'
    | 'ease-in'
    | 'ease-out'
    | 'ease-in-out'
    // Allow custom cubic-bezier while keeping autocomplete
    // deno-lint-ignore ban-types
    | (string & {})

/**
 * Button component props
 */
export interface ButtonProps {
    /**
     * Render as a different element (e.g., 'a' for links)
     * @default 'button'
     */
    as?: 'button' | 'a'
    /**
     * Visual style variant
     * @default 'primary'
     */
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
    /**
     * Button size
     * @default 'md'
     */
    size?: 'sm' | 'md' | 'lg' | 'xl'
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
     * Button type attribute (only for button element)
     */
    type?: 'button' | 'submit' | 'reset'
    /**
     * Link href (only for anchor element)
     */
    href?: string
    /**
     * Button id attribute
     */
    id?: string
    /**
     * Enable Unpoly preload on hover (only for links)
     * @default false
     */
    preload?: boolean
    /**
     * Unpoly transition animation (only for links)
     * @see https://unpoly.com/up-transition
     */
    transition?: UnpolyTransition
    /**
     * Unpoly target selector (only for links)
     * @see https://unpoly.com/up-target
     * @example '.content', ':main', ':layer'
     */
    target?: UnpolyTarget
    /**
     * Transition duration in milliseconds (only for links)
     * @see https://unpoly.com/up-duration
     */
    duration?: number
    /**
     * Transition timing function (only for links)
     * @see https://unpoly.com/up-easing
     */
    easing?: UnpolyEasing
    /**
     * Transition to use when server responds with error (only for links)
     * @see https://unpoly.com/up-fail-transition
     */
    failTransition?: UnpolyTransition
    /**
     * Additional HTML attributes (for Unpoly, etc.)
     */
    [key: string]: unknown
}

const variantClasses = {
    primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
    outline:
        'border-(length:--button-border-width-outline) border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
    danger:
        'bg-destructive text-destructive-foreground hover:bg-destructive/90',
}

const sizeClasses = {
    sm: 'px-(--button-padding-x-sm) py-(--button-padding-y-sm) text-(length:--button-font-size-sm)',
    md: 'px-(--button-padding-x-md) py-(--button-padding-y-md) text-(length:--button-font-size-md)',
    lg: 'px-(--button-padding-x-lg) py-(--button-padding-y-lg) text-(length:--button-font-size-lg)',
    xl: 'px-(--button-padding-x-xl) py-(--button-padding-y-xl) text-(length:--button-font-size-xl)',
}

/**
 * Button Component
 *
 * A flexible button component with multiple variants and sizes.
 * Supports all standard HTML button attributes and Unpoly directives.
 * Automatically renders as a link when `href` prop is provided.
 *
 * @example
 * ```tsx
 * // Primary button
 * <Button>Click me</Button>
 *
 * // Outline variant
 * <Button variant="outline">Cancel</Button>
 *
 * // As a link (auto-detected from href, uses up-follow)
 * <Button href="/dashboard">Go to Dashboard</Button>
 *
 * // With Unpoly preload
 * <Button href="/users" preload>Load Users</Button>
 *
 * // With transition animation
 * <Button href="/next" transition="move-left">Next Page</Button>
 *
 * // With custom Unpoly target
 * <Button href="/users" target=".content">Load Users</Button>
 *
 * // Small danger button
 * <Button variant="danger" size="sm">Delete</Button>
 * ```
 */
export const Button: FC<ButtonProps> = ({
    as,
    variant = 'primary',
    size = 'md',
    disabled = false,
    class: className,
    children,
    href,
    preload = false,
    transition,
    target,
    duration,
    easing,
    failTransition,
    ...props
}) => {
    // Auto-detect: if href is provided, render as anchor
    const isAnchor = as === 'a' || (href !== undefined && as !== 'button')

    const classes = cn(
        // Base styles
        'inline-flex items-center justify-center',
        'font-(--button-font-weight) rounded-(--button-border-radius)',
        'border-(length:--button-border-width)',
        'shadow-(--button-shadow) hover:shadow-(--button-shadow-hover)',
        'transition-all duration-(--button-transition-duration)',
        'focus:outline-none focus:shadow-(--button-shadow-focus)',
        'disabled:cursor-not-allowed disabled:opacity-(--button-disabled-opacity)',
        // Variant styles
        variantClasses[variant],
        // Size styles
        sizeClasses[size],
        // Disabled styles for links
        disabled && 'pointer-events-none opacity-(--button-disabled-opacity)',
        // Custom classes
        className,
    )

    if (isAnchor) {
        return (
            <a
                href={disabled ? undefined : href}
                class={classes}
                aria-disabled={disabled}
                up-follow
                up-preload={preload ? '' : undefined}
                up-transition={transition}
                up-target={target}
                up-duration={duration}
                up-easing={easing}
                up-fail-transition={failTransition}
                {...props}
            >
                {children}
            </a>
        )
    }

    return (
        <button class={classes} disabled={disabled} {...props}>
            {children}
        </button>
    )
}
