import type { FC } from '@lockness/core'
import { cn } from '../lib/utils.ts'

// Constants
const SIDEBAR_COOKIE_NAME = 'sidebar:state'
const _SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7 // 7 days
const SIDEBAR_WIDTH = '16rem'
const SIDEBAR_WIDTH_MOBILE = '18rem'
const _SIDEBAR_KEYBOARD_SHORTCUT = 'b'

/**
 * Sidebar Provider - Root wrapper for sidebar functionality
 * Handles collapsible state via data attributes and localStorage
 *
 * @example
 * ```tsx
 * <SidebarProvider defaultOpen={true}>
 *   <Sidebar>
 *     <SidebarHeader>...</SidebarHeader>
 *     <SidebarContent>...</SidebarContent>
 *   </Sidebar>
 *   <SidebarInset>Main content</SidebarInset>
 * </SidebarProvider>
 * ```
 */
export interface SidebarProviderProps {
    /** Whether the sidebar is open by default */
    defaultOpen?: boolean
    /** Which side the sidebar appears on */
    side?: 'left' | 'right'
    /** Additional CSS class names */
    class?: string
    /** Inline styles (including CSS custom properties) */
    style?: Record<string, string | number>
    /** Provider content (Sidebar and SidebarInset) */
    children?: unknown
    /** Additional HTML attributes */
    [key: string]: unknown
}

export const SidebarProvider: FC<SidebarProviderProps> = ({
    defaultOpen = true,
    side = 'left',
    class: className,
    style,
    children,
    ...props
}) => {
    const cookieValue = defaultOpen ? 'true' : 'false'

    return (
        <div
            class={cn(
                'group/sidebar-wrapper flex min-h-screen w-full has-data-[variant=inset]:bg-sidebar',
                className,
            )}
            style={{
                '--sidebar-width': SIDEBAR_WIDTH,
                '--sidebar-width-mobile': SIDEBAR_WIDTH_MOBILE,
                ...style,
            }}
            data-sidebar-cookie={SIDEBAR_COOKIE_NAME}
            data-sidebar-open={cookieValue}
            data-sidebar-side={side}
            {...props}
        >
            {children}
        </div>
    )
}

/**
 * Main Sidebar Component
 *
 * @example
 * ```tsx
 * <Sidebar side="left" variant="sidebar">
 *   <SidebarHeader>Logo</SidebarHeader>
 *   <SidebarContent>
 *     <SidebarMenu>...</SidebarMenu>
 *   </SidebarContent>
 *   <SidebarFooter>User info</SidebarFooter>
 * </Sidebar>
 * ```
 */
export interface SidebarProps {
    /** Which side the sidebar appears on */
    side?: 'left' | 'right'
    /** Visual style variant */
    variant?: 'sidebar' | 'floating' | 'inset'
    /** Collapse behavior */
    collapsible?: 'offcanvas' | 'icon' | 'none'
    /** Top offset for navbar (e.g., '16' for 4rem/64px navbar) */
    topOffset?: string
    /** Additional CSS class names */
    class?: string
    /** Sidebar content */
    children?: unknown
    /** Additional HTML attributes */
    [key: string]: unknown
}

export const Sidebar: FC<SidebarProps> = ({
    side = 'left',
    variant = 'sidebar',
    collapsible = 'offcanvas',
    topOffset,
    class: className,
    children,
    ...props
}) => {
    // Calculate padding-top based on offset (e.g., '16' = 4rem for navbar height)
    const paddingTop = topOffset === '16'
        ? '4rem'
        : (topOffset ? `${topOffset}rem` : undefined)

    return (
        <>
            {/* Hidden checkbox to manage sidebar state */}
            <input
                type='checkbox'
                id='sidebar-toggle'
                class='peer/sidebar hidden'
                defaultChecked
            />

            {/* Mobile Overlay - only visible on mobile when sidebar is open */}
            <label
                for='sidebar-toggle'
                class='hidden max-md:peer-checked/sidebar:block fixed inset-0 z-40 bg-black/50 transition-opacity duration-300'
            />

            <aside
                id='sidebar'
                style={paddingTop ? { paddingTop } : undefined}
                class={cn(
                    'group peer text-sidebar-foreground',
                    // Base styles
                    'flex flex-col bg-sidebar',
                    'w-64 min-w-64',
                    // Desktop: fixed position, full height
                    'hidden md:flex md:fixed top-0 h-screen',
                    // Mobile: hidden by default, shown when checkbox is checked
                    'peer-checked/sidebar:flex fixed left-0 z-50 bottom-0',
                    // Mobile transitions
                    'transition-transform duration-300 ease-in-out',
                    'max-md:-translate-x-full peer-checked/sidebar:translate-x-0',
                    'md:transition-none md:translate-x-0',
                    // Variants
                    variant === 'floating' && 'p-2',
                    variant === 'inset' &&
                        'border-r border-sidebar-border bg-sidebar',
                    // Side
                    side === 'right' && 'order-last',
                    className,
                )}
                data-side={side}
                data-variant={variant}
                data-collapsible={collapsible}
                {...props}
            >
                {/* Auto-close sidebar on navigation (mobile only) */}
                <script
                    dangerouslySetInnerHTML={{
                        __html: `
                        (function() {
                            // Close sidebar when clicking on navigation links (mobile only)
                            document.addEventListener('up:link:follow', function(event) {
                                if (window.innerWidth < 768) {
                                    const checkbox = document.getElementById('sidebar-toggle');
                                    if (checkbox) {
                                        checkbox.checked = false;
                                    }
                                }
                            });
                        })();
                    `,
                    }}
                />
                {children}
            </aside>
        </>
    )
}

/**
 * Sidebar Trigger - Toggle button for opening/closing sidebar
 *
 * @example
 * ```tsx
 * <SidebarTrigger />
 * <SidebarTrigger>Custom Icon</SidebarTrigger>
 * ```
 */
export interface SidebarTriggerProps {
    /** Additional CSS class names */
    class?: string
    /** Custom trigger content (defaults to sidebar icon) */
    children?: unknown
    /** Additional HTML attributes */
    [key: string]: unknown
}

export const SidebarTrigger: FC<SidebarTriggerProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <label
            for='sidebar-toggle'
            class={cn(
                'inline-flex items-center justify-center cursor-pointer',
                'h-7 w-7 rounded-(--radius)',
                'hover:bg-accent hover:text-accent-foreground',
                'transition-colors',
                className,
            )}
            {...props}
        >
            {children || (
                <svg
                    xmlns='http://www.w3.org/2000/svg'
                    width='16'
                    height='16'
                    viewBox='0 0 24 24'
                    fill='none'
                    stroke='currentColor'
                    stroke-width='2'
                    stroke-linecap='round'
                    stroke-linejoin='round'
                >
                    <rect width='18' height='18' x='3' y='3' rx='2' />
                    <path d='M9 3v18' />
                </svg>
            )}
        </label>
    )
}

/**
 * Sidebar Rail - Visual element on the edge for resize/collapse
 */
export interface SidebarRailProps {
    /** Additional CSS class names */
    class?: string
    /** Additional HTML attributes */
    [key: string]: unknown
}

export const SidebarRail: FC<SidebarRailProps> = ({
    class: className,
    ...props
}) => {
    return (
        <button
            class={cn(
                'absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear',
                'after:absolute after:inset-y-0 after:left-1/2 after:w-0.5',
                'hover:after:bg-sidebar-border',
                'group-data-[side=left]:-right-4',
                'group-data-[side=right]:left-0',
                className,
            )}
            {...props}
        />
    )
}

/**
 * Sidebar Inset - Main content wrapper with proper spacing
 */
export interface SidebarInsetProps {
    /** Additional CSS class names */
    class?: string
    /** Main page content */
    children?: unknown
    /** Additional HTML attributes */
    [key: string]: unknown
}

export const SidebarInset: FC<SidebarInsetProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <main
            class={cn(
                'relative flex min-h-svh flex-1 flex-col bg-background',
                'peer-data-[variant=inset]:min-h-[calc(100svh-theme(spacing.4)) md:peer-data-[variant=inset]:m-2 md:peer-data-[state=collapsed]:peer-data-[variant=inset]:ml-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow',
                className,
            )}
            {...props}
        >
            {children}
        </main>
    )
}

/**
 * Sidebar Header - Top section for branding/logo
 */
export interface SidebarHeaderProps {
    /** Additional CSS class names */
    class?: string
    /** Header content (logo, brand name) */
    children?: unknown
    /** Additional HTML attributes */
    [key: string]: unknown
}

export const SidebarHeader: FC<SidebarHeaderProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <div
            class={cn('flex flex-col gap-2 p-2', className)}
            {...props}
        >
            {children}
        </div>
    )
}

/**
 * Sidebar Footer - Bottom section for user info/actions
 */
export interface SidebarFooterProps {
    /** Additional CSS class names */
    class?: string
    /** Footer content (user menu, settings) */
    children?: unknown
    /** Additional HTML attributes */
    [key: string]: unknown
}

export const SidebarFooter: FC<SidebarFooterProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <div
            class={cn('flex flex-col gap-2 p-2', className)}
            {...props}
        >
            {children}
        </div>
    )
}

/**
 * Sidebar Content - Main scrollable area
 */
export interface SidebarContentProps {
    /** Additional CSS class names */
    class?: string
    /** Content elements (groups, menus) */
    children?: unknown
    /** Additional HTML attributes */
    [key: string]: unknown
}

export const SidebarContent: FC<SidebarContentProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <div
            data-sidebar-content
            class={cn(
                'flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden',
                className,
            )}
            {...props}
        >
            {children}
        </div>
    )
}

/**
 * Sidebar Group - Container for related menu items
 */
export interface SidebarGroupProps {
    /** Additional CSS class names */
    class?: string
    /** Group content (label, action, content) */
    children?: unknown
    /** Additional HTML attributes */
    [key: string]: unknown
}

export const SidebarGroup: FC<SidebarGroupProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <div
            class={cn(
                'relative flex w-full min-w-0 flex-col p-2',
                className,
            )}
            {...props}
        >
            {children}
        </div>
    )
}

/**
 * Sidebar Group Label - Section heading
 */
export interface SidebarGroupLabelProps {
    /** Additional CSS class names */
    class?: string
    /** Label text */
    children?: unknown
    /** Additional HTML attributes */
    [key: string]: unknown
}

export const SidebarGroupLabel: FC<SidebarGroupLabelProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <div
            class={cn(
                'flex h-8 shrink-0 items-center rounded-(--radius) px-2 text-xs font-medium text-sidebar-foreground/70 outline-none ring-sidebar-ring transition-[margin,opa] duration-200 ease-linear focus-visible:ring-2',
                'group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0',
                className,
            )}
            {...props}
        >
            {children}
        </div>
    )
}

/**
 * Sidebar Group Action - Button for group-level actions (e.g., add new item)
 */
export interface SidebarGroupActionProps {
    /** Additional CSS class names */
    class?: string
    /** Action button content (icon) */
    children?: unknown
    /** Additional HTML attributes */
    [key: string]: unknown
}

export const SidebarGroupAction: FC<SidebarGroupActionProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <button
            class={cn(
                'absolute right-3 top-3.5 flex aspect-square w-5 items-center justify-center rounded-(--radius) p-0 text-sidebar-foreground outline-none ring-sidebar-ring transition-transform hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2',
                'after:absolute after:-inset-2 after:md:hidden',
                'group-data-[collapsible=icon]:hidden',
                className,
            )}
            {...props}
        >
            {children}
        </button>
    )
}

/**
 * Sidebar Group Content - Container for menu items
 */
export interface SidebarGroupContentProps {
    /** Additional CSS class names */
    class?: string
    /** Menu and menu items */
    children?: unknown
    /** Additional HTML attributes */
    [key: string]: unknown
}

export const SidebarGroupContent: FC<SidebarGroupContentProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <div class={cn('w-full text-sm', className)} {...props}>
            {children}
        </div>
    )
}

/**
 * Sidebar Menu - List container for menu items
 */
export interface SidebarMenuProps {
    /** Additional CSS class names */
    class?: string
    /** Menu items */
    children?: unknown
    /** Additional HTML attributes */
    [key: string]: unknown
}

export const SidebarMenu: FC<SidebarMenuProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <ul
            class={cn('flex w-full min-w-0 flex-col gap-1', className)}
            {...props}
        >
            {children}
        </ul>
    )
}

/**
 * Sidebar Menu Item - Individual menu entry container
 */
export interface SidebarMenuItemProps {
    /** Additional CSS class names */
    class?: string
    /** Menu button and optional actions */
    children?: unknown
    /** Additional HTML attributes */
    [key: string]: unknown
}

export const SidebarMenuItem: FC<SidebarMenuItemProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <li
            class={cn('group/menu-item relative', className)}
            {...props}
        >
            {children}
        </li>
    )
}

/**
 * Sidebar Menu Button - Clickable menu item
 */
export interface SidebarMenuButtonProps {
    /** Whether this item is currently active */
    isActive?: boolean
    /** Additional CSS class names */
    class?: string
    /** Button content (icon and label) */
    children?: unknown
    /** Navigation URL (renders as anchor) */
    href?: string
    /** Additional HTML attributes */
    [key: string]: unknown
}

export const SidebarMenuButton: FC<SidebarMenuButtonProps> = ({
    isActive = false,
    class: className,
    children,
    href,
    ...props
}) => {
    const classes = cn(
        'peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-(--radius) p-2 text-left text-sm outline-none transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-ring active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-[[data-sidebar=menu-action]]/menu-item:pr-8',
        'group-data-[collapsible=icon]:!size-8 group-data-[collapsible=icon]:!p-2',
        isActive &&
            'bg-sidebar-accent font-medium text-sidebar-accent-foreground',
        className,
    )

    if (href) {
        return (
            <a
                href={href}
                class={classes}
                up-follow
                up-nav
                {...props}
            >
                {children}
            </a>
        )
    }

    return (
        <button class={classes} {...props}>
            {children}
        </button>
    )
}

/**
 * Sidebar Menu Action - Secondary action button within menu item
 */
export interface SidebarMenuActionProps {
    /** Additional CSS class names */
    class?: string
    /** Action button content (icon) */
    children?: unknown
    /** Additional HTML attributes */
    [key: string]: unknown
}

export const SidebarMenuAction: FC<SidebarMenuActionProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <button
            class={cn(
                'absolute right-1 top-1.5 flex aspect-square w-5 items-center justify-center rounded-(--radius) p-0 text-sidebar-foreground outline-none ring-sidebar-ring transition-transform hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 peer-hover/menu-button:text-sidebar-accent-foreground',
                'after:absolute after:-inset-2 after:md:hidden',
                'peer-data-[size=sm]/menu-button:top-1',
                'peer-data-[size=default]/menu-button:top-1.5',
                'peer-data-[size=lg]/menu-button:top-2.5',
                'group-data-[collapsible=icon]:hidden',
                className,
            )}
            data-sidebar='menu-action'
            {...props}
        >
            {children}
        </button>
    )
}

/**
 * Sidebar Menu Sub - Nested submenu container
 */
export interface SidebarMenuSubProps {
    /** Additional CSS class names */
    class?: string
    /** Submenu items */
    children?: unknown
    /** Additional HTML attributes */
    [key: string]: unknown
}

export const SidebarMenuSub: FC<SidebarMenuSubProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <ul
            class={cn(
                'mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l border-sidebar-border px-2.5 py-0.5',
                'group-data-[collapsible=icon]:hidden',
                className,
            )}
            {...props}
        >
            {children}
        </ul>
    )
}

/**
 * Sidebar Menu Sub Item - Individual submenu entry
 */
export interface SidebarMenuSubItemProps {
    /** Additional CSS class names */
    class?: string
    /** Submenu button */
    children?: unknown
    /** Additional HTML attributes */
    [key: string]: unknown
}

export const SidebarMenuSubItem: FC<SidebarMenuSubItemProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <li class={cn('group/menu-item relative', className)} {...props}>
            {children}
        </li>
    )
}

/**
 * Sidebar Menu Sub Button - Clickable submenu item
 */
export interface SidebarMenuSubButtonProps {
    /** Whether this item is currently active */
    isActive?: boolean
    /** Additional CSS class names */
    class?: string
    /** Button content (label) */
    children?: unknown
    /** Navigation URL (renders as anchor) */
    href?: string
    /** Additional HTML attributes */
    [key: string]: unknown
}

export const SidebarMenuSubButton: FC<SidebarMenuSubButtonProps> = ({
    isActive = false,
    class: className,
    children,
    href,
    ...props
}) => {
    const classes = cn(
        'flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-(--radius) px-2 text-sidebar-foreground outline-none ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50',
        isActive &&
            'bg-sidebar-accent font-medium text-sidebar-accent-foreground',
        className,
    )

    if (href) {
        return (
            <a
                href={href}
                class={classes}
                up-follow
                up-nav
                {...props}
            >
                {children}
            </a>
        )
    }

    return (
        <button class={classes} {...props}>
            {children}
        </button>
    )
}

/**
 * Sidebar Menu Badge - Count or status indicator
 */
export interface SidebarMenuBadgeProps {
    /** Additional CSS class names */
    class?: string
    /** Badge content (number or status) */
    children?: unknown
    /** Additional HTML attributes */
    [key: string]: unknown
}

export const SidebarMenuBadge: FC<SidebarMenuBadgeProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <div
            class={cn(
                'absolute right-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium tabular-nums text-sidebar-foreground select-none pointer-events-none',
                'peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[active=true]/menu-button:text-sidebar-accent-foreground',
                'peer-data-[size=sm]/menu-button:top-1',
                'peer-data-[size=default]/menu-button:top-1.5',
                'peer-data-[size=lg]/menu-button:top-2.5',
                'group-data-[collapsible=icon]:hidden',
                className,
            )}
            {...props}
        >
            {children}
        </div>
    )
}

/**
 * Sidebar Menu Skeleton - Loading placeholder
 */
export interface SidebarMenuSkeletonProps {
    class?: string
    showIcon?: boolean
    [key: string]: unknown
}

export const SidebarMenuSkeleton: FC<SidebarMenuSkeletonProps> = ({
    class: className,
    showIcon = false,
    ...props
}) => {
    return (
        <div
            class={cn(
                'flex h-8 items-center gap-2 rounded-(--radius) px-2',
                className,
            )}
            {...props}
        >
            {showIcon && (
                <div class='h-4 w-4 rounded-(--radius) bg-sidebar-accent' />
            )}
            <div class='h-4 flex-1 rounded-(--radius) bg-sidebar-accent' />
        </div>
    )
}
