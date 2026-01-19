import {
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
} from '@lockness/ui/components'
import { ThemeCustomizer } from './theme-customizer.tsx'

// Navigation data for UI sidebar
const navSections = [
    {
        title: 'OVERVIEW',
        links: [
            { title: 'Getting Started', href: '/ui' },
        ],
    },
    {
        title: 'BASIC',
        links: [
            { title: 'Buttons', href: '/ui/buttons' },
            { title: 'Badges', href: '/ui/badges' },
            { title: 'Alerts', href: '/ui/alerts' },
            { title: 'Separators', href: '/ui/separators' },
            { title: 'Keyboards', href: '/ui/keyboards' },
        ],
    },
    {
        title: 'FORMS',
        links: [
            { title: 'Form Components', href: '/ui/forms' },
            { title: 'Upload Zone', href: '/ui/upload-zone' },
        ],
    },
    {
        title: 'LAYOUT',
        links: [
            { title: 'Cards', href: '/ui/cards' },
            { title: 'Accordion', href: '/ui/accordion' },
            { title: 'Modal', href: '/ui/modal' },
            { title: 'Table', href: '/ui/table' },
        ],
    },
    {
        title: 'NAVIGATION',
        links: [
            { title: 'Navigation', href: '/ui/navigation' },
            { title: 'Navbar', href: '/ui/navbar' },
            { title: 'Sidebar', href: '/ui/sidebar' },
            { title: 'Pagination', href: '/ui/pagination' },
        ],
    },
    {
        title: 'FEEDBACK',
        links: [
            { title: 'Progress', href: '/ui/progress' },
            { title: 'Spinner', href: '/ui/spinner' },
            { title: 'Skeletons', href: '/ui/skeletons' },
        ],
    },
    {
        title: 'DATA',
        links: [
            { title: 'Chart', href: '/ui/chart' },
            { title: 'Gallery', href: '/ui/gallery' },
        ],
    },
    {
        title: 'MARKETING',
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
                        <SidebarGroupLabel>{section.title}</SidebarGroupLabel>
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
