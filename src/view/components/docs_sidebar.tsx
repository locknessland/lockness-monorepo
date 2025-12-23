interface NavLink {
    title: string
    href: string
}

const navLinks: NavLink[] = [
    { title: 'Installation', href: '/docs/installation' },
    { title: 'Getting Started', href: '/docs/getting-started' },
    { title: 'Routing & Controllers', href: '/docs/routing' },
    { title: 'Models & Database', href: '/docs/models' },
    { title: 'Validation', href: '/docs/validation' },
    { title: 'Authentication', href: '/docs/authentication' },
    { title: 'Middleware', href: '/docs/middleware' },
    { title: 'Components', href: '/docs/components' },
    { title: 'CLI (Ace)', href: '/docs/cli' },
]

export const DocsSidebar = (props: { currentPath: string }) => {
    return (
        <>
            {/* Mobile menu toggle - hidden checkbox */}
            <input type="checkbox" id="mobile-menu-toggle" class="peer hidden" />
            
            {/* Mobile hamburger button (visible only on mobile) */}
            <label 
                for="mobile-menu-toggle" 
                class="md:hidden fixed bottom-6 right-6 z-50 w-14 h-14 bg-primary border-4 border-border flex items-center justify-center cursor-pointer hover:bg-primary/90 transition-all"
                style="box-shadow: 4px 4px 0 0 rgba(0,0,0,0.5);"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" class="peer-checked:hidden">
                    <line x1="3" y1="12" x2="21" y2="12"></line>
                    <line x1="3" y1="6" x2="21" y2="6"></line>
                    <line x1="3" y1="18" x2="21" y2="18"></line>
                </svg>
            </label>

            {/* Backdrop (visible only when menu is open on mobile) */}
            <label 
                for="mobile-menu-toggle"
                class="md:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-40 hidden peer-checked:block"
            ></label>

            {/* Sidebar */}
            <aside class='fixed left-0 top-16 bottom-0 w-[90%] md:w-64 border-r-4 border-border bg-card/30 overflow-y-auto scanlines z-40 transition-transform duration-300 -translate-x-full peer-checked:translate-x-0 md:translate-x-0'>
                <nav class='p-6 space-y-2'>
                    {navLinks.map((link) => {
                        const isActive = props.currentPath === link.href
                        return (
                            <a
                                href={link.href}
                                class={`block px-4 py-2 border-2 ${
                                    isActive
                                        ? 'border-primary bg-primary/20 text-primary font-pixel text-[10px]'
                                        : 'border-border bg-background hover:border-primary hover:text-primary text-muted-foreground'
                                } transition-all duration-200`}
                                style={isActive ? 'box-shadow: 2px 2px 0 0 rgba(var(--primary-rgb), 0.3);' : ''}
                            >
                                {link.title}
                            </a>
                        )
                    })}
                </nav>
            </aside>
        </>
    )
}
