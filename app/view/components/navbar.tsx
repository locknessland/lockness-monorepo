const BookIcon = () => (
    <svg
        xmlns='http://www.w3.org/2000/svg'
        width='20'
        height='20'
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        stroke-width='2'
        stroke-linecap='round'
        stroke-linejoin='round'
    >
        <path d='M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20'>
        </path>
    </svg>
)

const HomeIcon = () => (
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
        <path d='m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'></path>
        <polyline points='9 22 9 12 15 12 15 22'></polyline>
    </svg>
)

const UserIcon = () => (
    <svg
        xmlns='http://www.w3.org/2000/svg'
        width='18'
        height='18'
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        stroke-width='2'
        stroke-linecap='round'
        stroke-linejoin='round'
    >
        <path d='M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2'></path>
        <circle cx='12' cy='7' r='4'></circle>
    </svg>
)

export const Navbar = () => {
    return (
        <header class='fixed top-0 left-0 right-0 z-50 border-b-4 border-border bg-background/95'>
            <div class='max-w-7xl mx-auto px-6 h-16 flex items-center justify-between'>
                <div class='flex items-center gap-6'>
                    <a href='/' class='flex items-center gap-3 group'>
                        <div
                            class='w-8 h-8 bg-primary flex items-center justify-center border-2 border-primary-foreground/20'
                            style='box-shadow: 2px 2px 0 0 rgba(0,0,0,0.5);'
                        >
                            <span class='font-pixel text-[8px] text-primary-foreground'>
                                L
                            </span>
                        </div>
                        <span class='font-pixel text-xs text-foreground tracking-tight mt-1'>
                            LOCKNESS<span class='text-primary'>JS</span>
                        </span>
                    </a>
                    <div class='flex items-center gap-2 text-muted-foreground'>
                        <span class='font-pixel text-[8px]'>/</span>
                        <BookIcon />
                        <span class='font-pixel text-[8px] mt-0.5'>
                            DOCS
                        </span>
                    </div>
                </div>

                <nav class='flex items-center gap-4'>
                    <a
                        href='/'
                        class='text-muted-foreground hover:text-primary transition-colors flex items-center gap-2'
                        title='Back to home'
                    >
                        <HomeIcon />
                    </a>
                    <a
                        href='/auth/profile'
                        class='text-muted-foreground hover:text-primary transition-colors flex items-center gap-2'
                        title='Profile'
                    >
                        <UserIcon />
                    </a>
                    <a
                        href='https://github.com/locknessjs/core'
                        class='text-muted-foreground hover:text-primary transition-colors'
                    >
                        <svg
                            xmlns='http://www.w3.org/2000/svg'
                            width='20'
                            height='20'
                            viewBox='0 0 24 24'
                            fill='none'
                            stroke='currentColor'
                            stroke-width='2'
                        >
                            <path d='M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4'>
                            </path>
                            <path d='M9 18c-4.51 2-5-2-7-2'></path>
                        </svg>
                    </a>
                </nav>
            </div>
        </header>
    )
}
