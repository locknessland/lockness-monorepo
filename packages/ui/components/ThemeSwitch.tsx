/**
 * ThemeSwitch Component
 * A versatile theme switcher with multiple visual styles, native logic, and no external dependencies.
 */

import type { FC } from '@lockness/core'
import { cn } from '../lib/utils.ts'

/**
 * ThemeSwitch Props Interface
 */
export interface ThemeSwitchProps {
    /** Additional CSS classes for the container */
    class?: string
    /**
     * Visual variant:
     * - 'classic': Two buttons (Light/Dark)
     * - 'toggle': Single button swapping icons
     * - 'switch': Checkbox-style toggle
     */
    variant?: 'classic' | 'toggle' | 'switch'
    /** Size variant */
    size?: 'sm' | 'md' | 'lg'
    /** Additional HTML attributes */
    [key: string]: unknown
}

/**
 * Sun Icon Component
 */
const SunIcon = ({ class: className }: { class?: string }) => (
    <svg
        class={cn('shrink-0', className)}
        xmlns='http://www.w3.org/2000/svg'
        width='24'
        height='24'
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        stroke-width='2'
        stroke-linecap='round'
        stroke-linejoin='round'
    >
        <circle cx='12' cy='12' r='4'></circle>
        <path d='M12 2v2'></path>
        <path d='M12 20v2'></path>
        <path d='m4.93 4.93 1.41 1.41'></path>
        <path d='m17.66 17.66 1.41 1.41'></path>
        <path d='M2 12h2'></path>
        <path d='M20 12h2'></path>
        <path d='m6.34 17.66-1.41 1.41'></path>
        <path d='m19.07 4.93-1.41 1.41'></path>
    </svg>
)

/**
 * Moon Icon Component
 */
const MoonIcon = ({ class: className }: { class?: string }) => (
    <svg
        class={cn('shrink-0', className)}
        xmlns='http://www.w3.org/2000/svg'
        width='24'
        height='24'
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        stroke-width='2'
        stroke-linecap='round'
        stroke-linejoin='round'
    >
        <path d='M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z'></path>
    </svg>
)

/**
 * Script used to toggle theme
 */
const toggleThemeJs =
    "const isDark = document.documentElement.classList.toggle('dark'); localStorage.setItem('theme', isDark ? 'dark' : 'light'); window.dispatchEvent(new CustomEvent('theme-change', { detail: { theme: isDark ? 'dark' : 'light' } }));"

/**
 * ThemeSwitch Component
 */
export const ThemeSwitch: FC<ThemeSwitchProps> = ({
    class: className,
    variant = 'classic',
    size = 'md',
    ...props
}) => {
    const sizeClasses = {
        sm: 'py-1 px-2 text-xs h-7 w-auto',
        md: 'py-2 px-3 text-sm h-9 w-auto',
        lg: 'py-2.5 px-4 text-base h-11 w-auto',
    }

    const iconOnlySizeClasses = {
        sm: 'h-7 w-7',
        md: 'h-9 w-9',
        lg: 'h-11 w-11',
    }

    const iconSizeClasses = {
        sm: 'size-3.5',
        md: 'size-4',
        lg: 'size-5',
    }

    // --- Classic Variant (Two buttons) ---
    if (variant === 'classic') {
        const btnClasses = cn(
            'flex items-center gap-x-2 rounded-full font-medium transition-colors border border-border shadow-xs',
            'bg-background text-foreground hover:bg-accent focus:outline-hidden',
            sizeClasses[size],
        )
        return (
            <div
                class={cn(
                    'flex items-center gap-2 theme-switch-classic',
                    className,
                )}
                {...props}
            >
                <button
                    type='button'
                    class={cn(btnClasses, 'dark:hidden')}
                    onclick={toggleThemeJs}
                >
                    <MoonIcon class={iconSizeClasses[size]} />
                    <span>Dark</span>
                </button>
                <button
                    type='button'
                    class={cn(btnClasses, 'hidden dark:flex')}
                    onclick={toggleThemeJs}
                >
                    <SunIcon class={iconSizeClasses[size]} />
                    <span>Light</span>
                </button>
            </div>
        )
    }

    // --- Toggle Variant (Single icon button) ---
    if (variant === 'toggle') {
        return (
            <button
                type='button'
                class={cn(
                    'inline-flex items-center justify-center rounded-md transition-colors theme-switch-toggle',
                    'text-foreground/80 hover:text-foreground hover:bg-accent',
                    'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
                    iconOnlySizeClasses[size],
                    className,
                )}
                onclick={toggleThemeJs}
                aria-label='Toggle theme'
                {...props}
            >
                <SunIcon
                    class={cn(iconSizeClasses[size], 'hidden dark:block')}
                />
                <MoonIcon
                    class={cn(iconSizeClasses[size], 'block dark:hidden')}
                />
            </button>
        )
    }

    // --- Switch Variant (Checkbox style) ---
    if (variant === 'switch') {
        const switchSizes = {
            sm: 'h-5 w-9',
            md: 'h-6 w-11',
            lg: 'h-7 w-14',
        }
        const knobSizes = {
            sm: 'h-4 w-4',
            md: 'h-5 w-5',
            lg: 'h-6 w-6',
        }
        const translateClasses = {
            sm: 'peer-checked:translate-x-[1rem]',
            md: 'peer-checked:translate-x-[1.375rem]',
            lg: 'peer-checked:translate-x-[1.75rem]',
        }

        return (
            <label
                class={cn(
                    'relative inline-flex shrink-0 cursor-pointer items-center rounded-full transition-colors theme-switch-wrapper',
                    'bg-slate-200 dark:bg-slate-700',
                    'focus-within:outline-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
                    switchSizes[size],
                    className,
                )}
                {...props}
            >
                <input
                    type='checkbox'
                    class='peer sr-only theme-switch-input'
                    role='switch'
                    onclick={toggleThemeJs}
                />
                <span
                    class={cn(
                        'pointer-events-none block rounded-full bg-white shadow-lg ring-0 transition-transform text-slate-600',
                        'translate-x-0.5',
                        translateClasses[size],
                        knobSizes[size],
                    )}
                >
                    <span class='absolute inset-0 flex items-center justify-center dark:opacity-0 transition-opacity'>
                        <SunIcon class='size-3 text-amber-500' />
                    </span>
                    <span class='absolute inset-0 flex items-center justify-center opacity-0 dark:opacity-100 transition-opacity'>
                        <MoonIcon class='size-3 text-blue-500' />
                    </span>
                </span>
            </label>
        )
    }

    return null
}

/**
 * Hook-like script to initialize theme and keep Switch components in sync.
 * Add this once to your RootLayout.
 */
export const ThemeSwitchScript: FC = () => (
    <script
        dangerouslySetInnerHTML={{
            __html: `
                (function() {
                    const syncSwitches = () => {
                        const isDark = document.documentElement.classList.contains('dark');
                        document.querySelectorAll('.theme-switch-input').forEach(i => {
                            i.checked = isDark;
                        });
                    };

                    const init = () => {
                        const savedTheme = localStorage.getItem('theme');
                        const isDark = savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);
                        
                        if (isDark) {
                            document.documentElement.classList.add('dark');
                        } else {
                            document.documentElement.classList.remove('dark');
                        }
                        syncSwitches();
                    };

                    init();

                    // Sync on event
                    window.addEventListener('theme-change', syncSwitches);

                    // Sync on load and Unpoly events
                    window.addEventListener('load', syncSwitches);
                    window.addEventListener('up:content:updated', syncSwitches);
                })();
            `,
        }}
    />
)
