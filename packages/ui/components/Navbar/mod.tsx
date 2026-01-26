/**
 * @fileoverview Responsive navigation bar component.
 *
 * A fully theme-aware navigation component using CSS variables.
 * Supports sticky/fixed positioning, responsive menus, and Unpoly integration.
 *
 * @module @lockness/ui/components/navbar
 *
 * @example Basic navbar
 * ```tsx
 * <Navbar position="fixed">
 *   <NavbarBrand href="/">Logo</NavbarBrand>
 *   <NavbarContent>
 *     <NavbarMenuItem href="/features">Features</NavbarMenuItem>
 *     <NavbarMenuItem href="/pricing">Pricing</NavbarMenuItem>
 *   </NavbarContent>
 *   <NavbarContent position="right">
 *     <Button href="/login">Login</Button>
 *   </NavbarContent>
 * </Navbar>
 * ```
 */

import type { FC } from '@lockness/hono'
import { cn } from '../../lib/utils.ts'

/**
 * Navbar Props Interface
 */
export interface NavbarProps {
    /** Additional CSS classes */
    class?: string
    /** Navbar content */
    children?: unknown
    /** Position type (sticky, fixed, static) */
    position?: 'sticky' | 'fixed' | 'static'
    /** Additional HTML attributes */
    [key: string]: unknown
}

/**
 * NavbarBrand Props Interface
 */
export interface NavbarBrandProps {
    /** Additional CSS classes */
    class?: string
    /** Brand content (logo, text, etc.) */
    children?: unknown
    /** Link href */
    href?: string
    /** Additional HTML attributes */
    [key: string]: unknown
}

/**
 * NavbarContent Props Interface
 */
export interface NavbarContentProps {
    /** Additional CSS classes */
    class?: string
    /** Content items */
    children?: unknown
    /** Position (left, center, right) */
    position?: 'left' | 'center' | 'right'
    /** Additional HTML attributes */
    [key: string]: unknown
}

/**
 * NavbarMenu Props Interface
 */
export interface NavbarMenuProps {
    /** Additional CSS classes */
    class?: string
    /** Menu items */
    children?: unknown
    /** Open state */
    open?: boolean
    /** Additional HTML attributes */
    [key: string]: unknown
}

/**
 * NavbarMenuItem Props Interface
 */
export interface NavbarMenuItemProps {
    /** Additional CSS classes */
    class?: string
    /** Item content */
    children?: unknown
    /** Link href */
    href?: string
    /** Active state */
    active?: boolean
    /** Additional HTML attributes */
    [key: string]: unknown
}

/**
 * NavbarToggle Props Interface
 */
export interface NavbarToggleProps {
    /** Additional CSS classes */
    class?: string
    /** Toggle callback */
    onClick?: () => void
    /** Open state */
    open?: boolean
    /** Additional HTML attributes */
    [key: string]: unknown
}

/**
 * Navbar Component
 * Main navigation container
 */
export const Navbar: FC<NavbarProps> = ({
    class: className,
    children,
    position = 'sticky',
    ...props
}) => {
    const positionClasses = {
        sticky: 'sticky top-0 z-[100]',
        fixed: 'fixed top-0 left-0 right-0 z-[100]',
        static: 'relative',
    }

    return (
        <nav
            class={cn(
                'w-full border-b border-(--border) bg-(--background) backdrop-blur supports-backdrop-filter:bg-(--background)/95',
                positionClasses[position],
                className,
            )}
            {...props}
        >
            <div class='container mx-auto flex h-16 items-center justify-between px-4 md:px-6'>
                {children}
            </div>
        </nav>
    )
}

/**
 * NavbarBrand Component
 * Logo/brand section
 */
export const NavbarBrand: FC<NavbarBrandProps> = ({
    class: className,
    children,
    href = '/',
    ...props
}) => {
    return (
        <a
            href={href}
            up-follow
            up-target='body'
            class={cn(
                'flex items-center gap-2 text-lg font-semibold text-(--foreground) transition-colors hover:text-(--primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-(--radius)',
                className,
            )}
            {...props}
        >
            {children}
        </a>
    )
}

/**
 * NavbarContent Component
 * Content section with positioning support
 */
export const NavbarContent: FC<NavbarContentProps> = ({
    class: className,
    children,
    position = 'center',
    ...props
}) => {
    const positionClasses = {
        left: 'justify-start',
        center: 'justify-center',
        right: 'justify-end',
    }

    return (
        <div
            class={cn(
                'flex items-center gap-6',
                positionClasses[position],
                className,
            )}
            {...props}
        >
            {children}
        </div>
    )
}

/**
 * NavbarMenu Component
 * Mobile menu container
 */
export const NavbarMenu: FC<NavbarMenuProps> = ({
    class: className,
    children,
    open = false,
    ...props
}) => {
    return (
        <div
            class={cn(
                'fixed inset-x-0 top-16 z-50 border-b border-(--border) bg-(--background) px-4 py-6 shadow-lg transition-all duration-200 ease-in-out md:hidden',
                open
                    ? 'translate-y-0 opacity-100'
                    : '-translate-y-full opacity-0 pointer-events-none',
                className,
            )}
            {...props}
        >
            <nav class='flex flex-col gap-4'>{children}</nav>
        </div>
    )
}

/**
 * NavbarMenuItem Component
 * Navigation link item
 */
export const NavbarMenuItem: FC<NavbarMenuItemProps> = ({
    class: className,
    children,
    href = '#',
    active = false,
    ...props
}) => {
    return (
        <a
            href={href}
            up-follow
            up-target='body'
            class={cn(
                'inline-flex h-9 items-center justify-start rounded-(--radius) px-4 py-2 text-sm font-medium transition-colors hover:bg-(--accent) hover:text-(--accent-foreground) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50',
                active
                    ? 'bg-(--accent) text-(--accent-foreground)'
                    : 'text-(--foreground)',
                className,
            )}
            {...props}
        >
            {children}
        </a>
    )
}

/**
 * NavbarToggle Component
 * Mobile menu toggle button
 */
export const NavbarToggle: FC<NavbarToggleProps> = ({
    class: className,
    onClick,
    open = false,
    ...props
}) => {
    return (
        <button
            type='button'
            onClick={onClick}
            class={cn(
                'inline-flex h-9 w-9 items-center justify-center rounded-(--radius) text-(--foreground) transition-colors hover:bg-(--accent) hover:text-(--accent-foreground) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) focus-visible:ring-offset-2 focus-visible:ring-offset-background md:hidden',
                className,
            )}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            {...props}
        >
            {open
                ? (
                    <svg
                        xmlns='http://www.w3.org/2000/svg'
                        width='24'
                        height='24'
                        viewBox='0 0 24 24'
                        fill='none'
                        stroke='currentColor'
                        strokeWidth='2'
                        strokeLinecap='round'
                        strokeLinejoin='round'
                    >
                        <line x1='18' y1='6' x2='6' y2='18' />
                        <line x1='6' y1='6' x2='18' y2='18' />
                    </svg>
                )
                : (
                    <svg
                        xmlns='http://www.w3.org/2000/svg'
                        width='24'
                        height='24'
                        viewBox='0 0 24 24'
                        fill='none'
                        stroke='currentColor'
                        strokeWidth='2'
                        strokeLinecap='round'
                        strokeLinejoin='round'
                    >
                        <line x1='3' y1='12' x2='21' y2='12' />
                        <line x1='3' y1='6' x2='21' y2='6' />
                        <line x1='3' y1='18' x2='21' y2='18' />
                    </svg>
                )}
        </button>
    )
}
