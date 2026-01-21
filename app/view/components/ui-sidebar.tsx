import {
    BarChartIcon,
    BoxIcon,
    FormInputIcon,
    LayoutGridIcon,
    MegaphoneIcon,
    NavigationIcon,
    PlayIcon,
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SparklesIcon,
} from '@lockness/ui/components'
import type { FC } from '@lockness/core'
import { ThemeCustomizer } from './theme-customizer.tsx'

/**
 * Icon component type for sidebar navigation
 */
type IconComponent = FC<{ size?: number; class?: string }>

/**
 * Navigation link with optional icon
 */
interface NavLink {
    readonly title: string
    readonly href: string
    readonly icon?: IconComponent
}

/**
 * Navigation section with links
 */
interface NavSection {
    readonly title: string
    readonly icon?: IconComponent
    readonly links: readonly NavLink[]
}

// Navigation data for UI sidebar
const navSections: readonly NavSection[] = [
    {
        title: 'OVERVIEW',
        icon: PlayIcon,
        links: [
            { title: 'Getting Started', href: '/ui', icon: PlayIcon },
        ],
    },
    {
        title: 'BASIC',
        icon: BoxIcon,
        links: [
            { title: 'Buttons', href: '/ui/buttons' },
            { title: 'Badges', href: '/ui/badges' },
            { title: 'Alerts', href: '/ui/alerts' },
            { title: 'Separators', href: '/ui/separators' },
            { title: 'Keyboards', href: '/ui/keyboards' },
            { title: 'Theme Switch', href: '/ui/theme-switch' },
        ],
    },
    {
        title: 'FORMS',
        icon: FormInputIcon,
        links: [
            { title: 'Form Components', href: '/ui/forms' },
            { title: 'Upload Zone', href: '/ui/upload-zone' },
        ],
    },
    {
        title: 'LAYOUT',
        icon: LayoutGridIcon,
        links: [
            { title: 'Cards', href: '/ui/cards' },
            { title: 'Accordion', href: '/ui/accordion' },
            { title: 'Modal', href: '/ui/modal' },
            { title: 'Table', href: '/ui/table' },
            { title: 'TreeView', href: '/ui/treeview' },
        ],
    },
    {
        title: 'NAVIGATION',
        icon: NavigationIcon,
        links: [
            { title: 'Navigation', href: '/ui/navigation' },
            { title: 'Navbar', href: '/ui/navbar' },
            { title: 'Sidebar', href: '/ui/sidebar' },
            { title: 'Pagination', href: '/ui/pagination' },
        ],
    },
    {
        title: 'FEEDBACK',
        icon: SparklesIcon,
        links: [
            { title: 'Progress', href: '/ui/progress' },
            { title: 'Spinner', href: '/ui/spinner' },
            { title: 'Skeletons', href: '/ui/skeletons' },
        ],
    },
    {
        title: 'DATA',
        icon: BarChartIcon,
        links: [
            { title: 'Chart', href: '/ui/chart' },
            { title: 'Gallery', href: '/ui/gallery' },
        ],
    },
    {
        title: 'MARKETING',
        icon: MegaphoneIcon,
        links: [
            { title: 'Hero', href: '/ui/hero' },
            { title: 'Newsletter', href: '/ui/newsletter' },
            { title: 'Pricing', href: '/ui/pricing' },
        ],
    },
]

/**
 * UI Sidebar Component
 * Reusable sidebar navigation for UI documentation pages
 */
export const UiSidebar = () => {
    return (
        <Sidebar topOffset='16' class='fixed hidden z-50'>
            <SidebarHeader>
                <div class='px-2 py-4'>
                    <h1 class='font-pixel text-lg text-sidebar-foreground mb-1'>
                        Lockness UI
                    </h1>
                    <p class='text-xs text-sidebar-foreground/70'>
                        Component Library
                    </p>
                </div>
            </SidebarHeader>

            <SidebarContent>
                {/* Navigation Sections */}
                {navSections.map((section) => (
                    <SidebarGroup key={section.title}>
                        <SidebarGroupLabel>
                            {section.icon && (
                                <section.icon
                                    size={14}
                                    class='mr-2 text-sidebar-foreground/70'
                                />
                            )}
                            {section.title}
                        </SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                {section.links.map((link) => (
                                    <SidebarMenuItem key={link.href}>
                                        <SidebarMenuButton
                                            href={link.href}
                                            up-preload
                                            up-transition='move-left'
                                        >
                                            {link.title}
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                ))}
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>
                ))}
            </SidebarContent>

            <SidebarFooter>
                <div class='space-y-2 px-2 py-2'>
                    <ThemeCustomizer />
                    <div class='text-xs text-sidebar-foreground/50'>
                        Press{' '}
                        <kbd class='px-1 py-0.5 bg-sidebar-accent rounded text-sidebar-foreground'>
                            ⌘B
                        </kbd>{' '}
                        to toggle
                    </div>
                </div>
            </SidebarFooter>
        </Sidebar>
    )
}
