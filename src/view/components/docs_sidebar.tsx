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
        <aside class='fixed left-0 top-16 bottom-0 w-64 border-r-4 border-border bg-card/30 overflow-y-auto scanlines'>
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
    )
}
