/**
 * @fileoverview Search bar component with multiple variants and sizes.
 *
 * Supports customizable styling, icons, keyboard shortcuts,
 * and Unpoly integration for AJAX search.
 *
 * @module @lockness/ui/components/searchbar
 */

import type { FC } from '@lockness/hono'
import { cn } from '../../lib/utils.ts'
import { LoaderIcon, SearchIcon, XIcon } from '../../icons.tsx'

/**
 * SearchBar variant styles
 */
export type SearchBarVariant = 'default' | 'ghost' | 'outline' | 'filled'

/**
 * SearchBar size options
 */
export type SearchBarSize = 'sm' | 'md' | 'lg' | 'xl'

/**
 * Icon position within the search bar
 */
export type IconPosition = 'left' | 'right'

/**
 * SearchBar component props
 */
export interface SearchBarProps {
    /**
     * Visual style variant
     * @default 'default'
     */
    variant?: SearchBarVariant
    /**
     * Component size
     * @default 'md'
     */
    size?: SearchBarSize
    /**
     * Placeholder text
     * @default 'Search...'
     */
    placeholder?: string
    /**
     * Input name attribute
     */
    name?: string
    /**
     * Input value
     */
    value?: string
    /**
     * Show search icon
     * @default true
     */
    showIcon?: boolean
    /**
     * Icon position
     * @default 'left'
     */
    iconPosition?: IconPosition
    /**
     * Show clear button when input has value
     * @default false
     */
    showClear?: boolean
    /**
     * Keyboard shortcut to display
     * @example '⌘K' or 'Ctrl+K'
     */
    shortcut?: string
    /**
     * Show keyboard shortcut badge
     * @default false
     */
    showShortcut?: boolean
    /**
     * Loading state
     * @default false
     */
    loading?: boolean
    /**
     * Disable input
     * @default false
     */
    disabled?: boolean
    /**
     * Full width mode
     * @default false
     */
    fullWidth?: boolean
    /**
     * Additional CSS class names
     */
    class?: string
    /**
     * Container class names
     */
    containerClass?: string
    /**
     * Element id attribute
     */
    id?: string
    /**
     * Autocomplete attribute
     * @default 'off'
     */
    autocomplete?: string
    /**
     * Additional HTML attributes
     */
    [key: string]: unknown
}

const variantStyles: Record<SearchBarVariant, string> = {
    default: `
        border border-(--searchbar-border-color) bg-(--searchbar-background)
        focus-within:ring-2 focus-within:ring-(--ring) focus-within:ring-offset-2
    `,
    ghost: `
        bg-transparent
        focus-within:bg-(--muted)
    `,
    outline: `
        border-2 border-(--border) bg-transparent
        focus-within:border-(--ring)
    `,
    filled: `
        bg-(--muted) border-transparent
        focus-within:bg-(--background) focus-within:ring-2 focus-within:ring-(--ring)
    `,
}

const sizeStyles: Record<
    SearchBarSize,
    { container: string; input: string; icon: number }
> = {
    sm: {
        container: 'h-8 px-2 gap-1.5',
        input: 'text-xs',
        icon: 14,
    },
    md: {
        container:
            'h-(--searchbar-height) px-(--searchbar-padding-x) py-(--searchbar-padding-y) gap-2',
        input: 'text-[length:--searchbar-font-size]',
        icon: 16,
    },
    lg: {
        container: 'h-12 px-4 gap-2.5',
        input: 'text-base',
        icon: 18,
    },
    xl: {
        container: 'h-14 px-5 gap-3',
        input: 'text-lg',
        icon: 20,
    },
}

/**
 * SearchBar Component
 *
 * A customizable search input with icons, clear button, keyboard shortcuts,
 * and Unpoly integration for AJAX search.
 *
 * @example
 * ```tsx
 * // Basic search bar
 * <SearchBar placeholder="Search products..." />
 *
 * // Filled variant with clear button
 * <SearchBar variant="filled" showClear placeholder="Search..." />
 *
 * // With keyboard shortcut
 * <SearchBar shortcut="⌘K" showShortcut placeholder="Quick search..." />
 *
 * // Large size with loading state
 * <SearchBar size="lg" loading placeholder="Searching..." />
 *
 * // Unpoly AJAX search
 * <SearchBar
 *   name="q"
 *   up-autosubmit
 *   up-delay="300"
 *   up-target=".results"
 *   placeholder="Search..."
 * />
 * ```
 */
export const SearchBar: FC<SearchBarProps> = ({
    variant = 'default',
    size = 'md',
    placeholder = 'Search...',
    name,
    value,
    showIcon = true,
    iconPosition = 'left',
    showClear = false,
    shortcut,
    showShortcut = false,
    loading = false,
    disabled = false,
    fullWidth = false,
    class: className,
    containerClass,
    id,
    autocomplete = 'off',
    ...props
}) => {
    const sizeConfig = sizeStyles[size]

    return (
        <div
            class={cn(
                'relative inline-flex items-center rounded-(--searchbar-border-radius)',
                'transition-all duration-200',
                variantStyles[variant],
                sizeConfig.container,
                fullWidth && 'w-full',
                disabled && 'opacity-50 cursor-not-allowed',
                containerClass,
            )}
        >
            {/* Left Icon */}
            {showIcon && iconPosition === 'left' && (
                <span class='shrink-0 text-(--searchbar-icon-color)'>
                    {loading
                        ? (
                            <LoaderIcon
                                size={sizeConfig.icon}
                                class='animate-spin'
                            />
                        )
                        : <SearchIcon size={sizeConfig.icon} />}
                </span>
            )}

            {/* Input */}
            <input
                type='search'
                id={id}
                name={name}
                value={value}
                placeholder={placeholder}
                disabled={disabled}
                autocomplete={autocomplete}
                class={cn(
                    'flex-1 bg-transparent border-0 outline-none',
                    'placeholder:text-(--muted-foreground)',
                    'disabled:cursor-not-allowed',
                    '[&::-webkit-search-cancel-button]:hidden',
                    '[&::-webkit-search-decoration]:hidden',
                    sizeConfig.input,
                    className,
                )}
                {...props}
            />

            {/* Right Icon (when position is right) */}
            {showIcon && iconPosition === 'right' && !loading && (
                <span class='shrink-0 text-(--searchbar-icon-color)'>
                    <SearchIcon size={sizeConfig.icon} />
                </span>
            )}

            {/* Loading indicator (right side) */}
            {loading && iconPosition === 'right' && (
                <span class='shrink-0 text-(--searchbar-icon-color)'>
                    <LoaderIcon size={sizeConfig.icon} class='animate-spin' />
                </span>
            )}

            {/* Clear Button */}
            {showClear && (
                <button
                    type='button'
                    class={cn(
                        'shrink-0 p-0.5 rounded-sm',
                        'text-(--muted-foreground) hover:text-(--foreground)',
                        'hover:bg-(--muted) transition-colors',
                        'focus:outline-none focus:ring-1 focus:ring-(--ring)',
                    )}
                    aria-label='Clear search'
                    onclick="this.previousElementSibling.value=''; this.previousElementSibling.focus();"
                >
                    <XIcon size={sizeConfig.icon - 2} />
                </button>
            )}

            {/* Keyboard Shortcut Badge */}
            {showShortcut && shortcut && (
                <kbd
                    class={cn(
                        'shrink-0 pointer-events-none',
                        'inline-flex items-center gap-1 px-1.5',
                        'rounded border border-(--border) bg-(--muted)',
                        'font-mono text-xs text-(--muted-foreground)',
                        size === 'sm' && 'text-[10px] px-1',
                        size === 'xl' && 'text-sm px-2',
                    )}
                >
                    {shortcut}
                </kbd>
            )}
        </div>
    )
}

/**
 * SearchBarGroup component for grouping search bar with filters
 */
export interface SearchBarGroupProps {
    /**
     * Children components (SearchBar + SearchBarFilter)
     */
    children?: unknown
    /**
     * Additional CSS class names
     */
    class?: string
}

/**
 * SearchBarGroup Component
 *
 * Groups a SearchBar with optional filter dropdowns.
 *
 * @example
 * ```tsx
 * <SearchBarGroup>
 *   <SearchBar placeholder="Search..." />
 *   <SearchBarFilter>
 *     <option value="all">All</option>
 *     <option value="products">Products</option>
 *   </SearchBarFilter>
 * </SearchBarGroup>
 * ```
 */
export const SearchBarGroup: FC<SearchBarGroupProps> = ({
    children,
    class: className,
}) => {
    return (
        <div
            class={cn(
                'inline-flex items-stretch',
                'rounded-(--radius) border border-(--input)',
                'overflow-hidden',
                'focus-within:ring-2 focus-within:ring-(--ring) focus-within:ring-offset-2',
                className,
            )}
        >
            {children}
        </div>
    )
}

/**
 * SearchBarFilter component for filter dropdown
 */
export interface SearchBarFilterProps {
    /**
     * Select options
     */
    children?: unknown
    /**
     * Select name attribute
     */
    name?: string
    /**
     * Additional CSS class names
     */
    class?: string
    /**
     * Additional HTML attributes
     */
    [key: string]: unknown
}

/**
 * SearchBarFilter Component
 *
 * A filter dropdown to use alongside SearchBar in a SearchBarGroup.
 *
 * @example
 * ```tsx
 * <SearchBarFilter name="category">
 *   <option value="all">All Categories</option>
 *   <option value="electronics">Electronics</option>
 *   <option value="clothing">Clothing</option>
 * </SearchBarFilter>
 * ```
 */
export const SearchBarFilter: FC<SearchBarFilterProps> = ({
    children,
    name,
    class: className,
    ...props
}) => {
    return (
        <select
            name={name}
            class={cn(
                'self-stretch px-3',
                'bg-(--muted) border-l border-(--input)',
                'text-sm text-(--foreground)',
                'cursor-pointer',
                'focus:outline-none focus:bg-(--background)',
                'appearance-none',
                className,
            )}
            {...props}
        >
            {children}
        </select>
    )
}
