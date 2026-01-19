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

// Navigation data for UI sidebar
const navSections = [
    {
        title: 'OVERVIEW',
        links: [
            { title: 'Getting Started', href: '/ui' },
        ],
    },
    {
        title: 'COMPONENTS',
        links: [
            { title: 'Buttons', href: '/ui/buttons' },
            { title: 'Cards', href: '/ui/cards' },
            { title: 'Form Components', href: '/ui/forms' },
            { title: 'Display Components', href: '/ui/display' },
            { title: 'Navigation', href: '/ui/navigation' },
            { title: 'Accordion', href: '/ui/accordion' },
            { title: 'Sidebar', href: '/ui/sidebar' },
            { title: 'Modal', href: '/ui/modal' },
            { title: 'Navbar', href: '/ui/navbar' },
            { title: 'Table', href: '/ui/table' },
            { title: 'Pagination', href: '/ui/pagination' },
            { title: 'Progress', href: '/ui/progress' },
            { title: 'Spinner', href: '/ui/spinner' },
            { title: 'Upload Zone', href: '/ui/upload-zone' },
            { title: 'Chart', href: '/ui/chart' },
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
                <div class='px-2 py-2 text-xs text-sidebar-foreground/50'>
                    Press{' '}
                    <kbd class='px-1 py-0.5 bg-sidebar-accent rounded text-sidebar-foreground'>
                        ⌘B
                    </kbd>{' '}
                    to toggle
                </div>
            </SidebarFooter>
        </Sidebar>
    )
}
