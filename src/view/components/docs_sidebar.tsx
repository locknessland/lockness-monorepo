import { route } from 'lockness'

interface NavLink {
    title: string
    name: string
}

const navLinks: NavLink[] = [
    { title: 'Installation', name: 'docs.installation' },
    { title: 'Getting Started', name: 'docs.getting-started' },
    { title: 'Routing & Controllers', name: 'docs.routing' },
    { title: 'Models & Database', name: 'docs.models' },
    { title: 'Validation', name: 'docs.validation' },
    { title: 'Authentication', name: 'docs.authentication' },
    { title: 'Middleware', name: 'docs.middleware' },
    { title: 'Components', name: 'docs.components' },
    { title: 'CLI (Ace)', name: 'docs.cli' },
    { title: 'Nessy CLI', name: 'docs.nessy' },
    { title: 'Packages', name: 'docs.packages' },
    { title: 'Deprecation', name: 'docs.deprecation' },
]

export const DocsSidebar = (props: { currentPath: string }) => {
    return (
        <>
            {/* Mobile hamburger button (visible only on mobile) */}
            <button
                type='button'
                id='mobile-menu-btn'
                class='md:hidden fixed bottom-6 right-6 z-60 w-14 h-14 bg-primary border-4 border-border flex items-center justify-center cursor-pointer hover:bg-primary/90'
                style='box-shadow: 4px 4px 0 0 rgba(0,0,0,0.5);'
                aria-label='Toggle menu'
            >
                <svg
                    xmlns='http://www.w3.org/2000/svg'
                    width='28'
                    height='28'
                    viewBox='0 0 24 24'
                    fill='none'
                    stroke='white'
                    stroke-width='2.5'
                    stroke-linecap='round'
                >
                    <line x1='3' y1='12' x2='21' y2='12'></line>
                    <line x1='3' y1='6' x2='21' y2='6'></line>
                    <line x1='3' y1='18' x2='21' y2='18'></line>
                </svg>
            </button>

            {/* Backdrop (visible only when menu is open on mobile) */}
            <div
                id='mobile-menu-backdrop'
                class='md:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-40 hidden'
            >
            </div>

            {/* Sidebar */}
            <aside
                id='mobile-sidebar'
                class='hidden md:block md:static md:w-64 border-r-4 border-border bg-card/30 overflow-y-auto scanlines md:z-auto min-h-screen min-w-[290px] md:min-w-[290px]'
            >
                <nav class='md:fixed p-6 space-y-2'>
                    {navLinks.map((link) => {
                        const href = route(link.name)
                        const isActive = props.currentPath === href
                        return (
                            <a
                                href={href}
                                class={`block font-pixel text-[10px] w-full px-4 py-2 border-2 ${
                                    isActive
                                        ? 'border-primary bg-primary/20 text-primary '
                                        : 'border-border bg-background hover:border-primary hover:text-primary text-muted-foreground'
                                }`}
                                style={isActive
                                    ? 'box-shadow: 2px 2px 0 0 rgba(var(--primary-rgb), 0.3);'
                                    : ''}
                            >
                                {link.title}
                            </a>
                        )
                    })}
                </nav>
            </aside>

            {/* JavaScript for mobile menu toggle */}
            <script
                dangerouslySetInnerHTML={{
                    __html: `
                    document.addEventListener('DOMContentLoaded', function() {
                        const btn = document.getElementById('mobile-menu-btn');
                        const sidebar = document.getElementById('mobile-sidebar');
                        const backdrop = document.getElementById('mobile-menu-backdrop');
                        
                        if (!btn || !sidebar || !backdrop) {
                            console.error('Menu elements not found');
                            return;
                        }
                        
                        function toggleMenu() {
                            const isHidden = sidebar.classList.contains('hidden');
                            
                            if (isHidden) {
                                // Show menu
                                sidebar.classList.remove('hidden');
                                sidebar.classList.add('block', 'fixed', 'left-0', 'top-0', 'w-[90%]', 'h-screen', 'z-[50]', 'opacity-0', '-translate-x-full');
                                backdrop.classList.remove('hidden');
                                backdrop.classList.add('opacity-0');
                                // Wait for next frame to trigger transition
                                requestAnimationFrame(() => {
                                    requestAnimationFrame(() => {
                                        sidebar.classList.remove('opacity-0', '-translate-x-full');
                                        sidebar.classList.add('opacity-100', 'translate-x-0');
                                        backdrop.classList.remove('opacity-0');
                                        backdrop.classList.add('opacity-100');
                                    });
                                });
                            } else {
                                // Hide menu with animation
                                sidebar.classList.remove('opacity-100', 'translate-x-0');
                                sidebar.classList.add('opacity-0', '-translate-x-full');
                                backdrop.classList.remove('opacity-100');
                                backdrop.classList.add('opacity-0');
                                // Wait for transition to finish before hiding
                                setTimeout(() => {
                                    sidebar.classList.add('hidden');
                                    sidebar.classList.remove('block', 'fixed', 'left-0', 'top-0', 'w-[90%]', 'h-screen', 'z-[50]', 'opacity-0', '-translate-x-full');
                                    backdrop.classList.add('hidden');
                                    backdrop.classList.remove('opacity-0');
                                }, 500);
                            }
                        }
                        
                        btn.addEventListener('click', toggleMenu);
                        backdrop.addEventListener('click', toggleMenu);
                    });
                `,
                }}
            />
        </>
    )
}
