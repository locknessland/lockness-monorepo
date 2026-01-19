/**
 * ThemeToggle Component
 * A button to toggle between light and dark mode
 */

import type { FC } from '@lockness/core'
import { cn } from '../lib/utils.ts'

/**
 * ThemeToggle Props Interface
 */
export interface ThemeToggleProps {
    /** Additional CSS classes */
    class?: string
    /** Size variant */
    size?: 'sm' | 'md' | 'lg'
    /** Additional HTML attributes */
    [key: string]: unknown
}

/**
 * Sun Icon for light mode
 */
const SunIcon = () => (
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
        class='hidden dark:block'
    >
        <circle cx='12' cy='12' r='4' />
        <path d='M12 2v2' />
        <path d='M12 20v2' />
        <path d='m4.93 4.93 1.41 1.41' />
        <path d='m17.66 17.66 1.41 1.41' />
        <path d='M2 12h2' />
        <path d='M20 12h2' />
        <path d='m6.34 17.66-1.41 1.41' />
        <path d='m19.07 4.93-1.41 1.41' />
    </svg>
)

/**
 * Moon Icon for dark mode
 */
const MoonIcon = () => (
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
        class='block dark:hidden'
    >
        <path d='M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z' />
    </svg>
)

/**
 * ThemeToggle Component
 * Toggles between light and dark mode using the 'dark' class on documentElement
 */
export const ThemeToggle: FC<ThemeToggleProps> = ({
    class: className,
    size = 'md',
    ...props
}) => {
    const sizeClasses = {
        sm: 'h-7 w-7',
        md: 'h-9 w-9',
        lg: 'h-11 w-11',
    }

    return (
        <button
            type='button'
            class={cn(
                'inline-flex items-center justify-center rounded-md',
                'text-foreground/80 hover:text-foreground',
                'hover:bg-accent transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                sizeClasses[size],
                className,
            )}
            aria-label='Toggle theme'
            onclick="const isDark = document.documentElement.classList.toggle('dark'); localStorage.setItem('theme', isDark ? 'dark' : 'light')"
            {...props}
        >
            <SunIcon />
            <MoonIcon />
        </button>
    )
}

/**
 * Client-side script to initialize theme from localStorage
 * Add this script to your layout (runs once on page load)
 */
export const ThemeToggleScript: FC = () => (
    <script
        dangerouslySetInnerHTML={{
            __html: `
                (function() {
                    const savedTheme = localStorage.getItem('theme');
                    if (savedTheme === 'dark') {
                        document.documentElement.classList.add('dark');
                    } else if (savedTheme === 'light') {
                        document.documentElement.classList.remove('dark');
                    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                        document.documentElement.classList.add('dark');
                    }
                })();
            `,
        }}
    />
)
