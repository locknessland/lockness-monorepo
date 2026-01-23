/**
 * @fileoverview Versatile theme switcher component.
 *
 * A theme switcher with multiple visual styles, native logic, and no external dependencies.
 * Provides three distinct variants for different use cases and UI preferences.
 *
 * @module @lockness/ui/components/theme-switch
 */

import type { FC } from '@lockness/core'
import { cn } from '../../lib/utils.ts'

/**
 * Available visual variants for the ThemeSwitch component.
 *
 * @remarks
 * - `classic` - Two buttons showing current action (Light/Dark labels)
 * - `toggle` - Single icon button that swaps between sun/moon
 * - `switch` - Checkbox-style toggle with sliding knob
 */
export type ThemeSwitchVariant = 'classic' | 'toggle' | 'switch'

/**
 * Available size options for the ThemeSwitch component.
 */
export type ThemeSwitchSize = 'sm' | 'md' | 'lg'

/**
 * Props for the ThemeSwitch component.
 *
 * @example
 * ```tsx
 * // Basic usage with default variant
 * <ThemeSwitch />
 *
 * // Toggle variant with custom size
 * <ThemeSwitch variant="toggle" size="lg" />
 *
 * // Switch variant with colored icons
 * <ThemeSwitch
 *   variant="switch"
 *   sunIconClass="text-amber-500"
 *   moonIconClass="text-blue-500"
 * />
 *
 * // Classic variant with custom labels
 * <ThemeSwitch
 *   variant="classic"
 *   darkLabel="Night Mode"
 *   lightLabel="Day Mode"
 * />
 * ```
 */
export interface ThemeSwitchProps {
    /**
     * Additional CSS classes for the container element.
     */
    readonly class?: string

    /**
     * Visual variant of the theme switcher.
     * @defaultValue 'classic'
     */
    readonly variant?: ThemeSwitchVariant

    /**
     * Size variant affecting padding, font size, and icon dimensions.
     * @defaultValue 'md'
     */
    readonly size?: ThemeSwitchSize

    /**
     * Label displayed on the button when in light mode (clicking switches to dark).
     * Only applies to the `classic` variant.
     * @defaultValue 'Dark'
     */
    readonly darkLabel?: string

    /**
     * Label displayed on the button when in dark mode (clicking switches to light).
     * Only applies to the `classic` variant.
     * @defaultValue 'Light'
     */
    readonly lightLabel?: string

    /**
     * Custom CSS class for the sun icon.
     * Use this to override the icon color (e.g., `text-amber-500`).
     *
     * @remarks
     * For `classic` and `toggle` variants, icons inherit `currentColor` by default.
     * For `switch` variant, icons use CSS variables `--theme-switch-sun-color`.
     */
    readonly sunIconClass?: string

    /**
     * Custom CSS class for the moon icon.
     * Use this to override the icon color (e.g., `text-blue-500`).
     *
     * @remarks
     * For `classic` and `toggle` variants, icons inherit `currentColor` by default.
     * For `switch` variant, icons use CSS variables `--theme-switch-moon-color`.
     */
    readonly moonIconClass?: string

    /** Additional HTML attributes passed to the root element. */
    readonly [key: string]: unknown
}

/**
 * Size class mappings for button variants.
 * @internal
 */
const SIZE_CLASSES = {
    sm: 'py-1.5 px-3 text-xs h-7 w-auto',
    md: 'py-2.5 px-4 text-sm h-9 w-auto',
    lg: 'py-3 px-5 text-base h-11 w-auto',
} as const satisfies Record<ThemeSwitchSize, string>

/**
 * Size class mappings for icon-only buttons (toggle variant).
 * @internal
 */
const ICON_ONLY_SIZE_CLASSES = {
    sm: 'h-7 w-7',
    md: 'h-9 w-9',
    lg: 'h-11 w-11',
} as const satisfies Record<ThemeSwitchSize, string>

/**
 * Icon size classes for each size variant.
 * @internal
 */
const ICON_SIZE_CLASSES = {
    sm: 'size-3.5',
    md: 'size-4',
    lg: 'size-5',
} as const satisfies Record<ThemeSwitchSize, string>

/**
 * Switch track size classes.
 * @internal
 */
const SWITCH_SIZES = {
    sm: 'h-6 w-11',
    md: 'h-7 w-14',
    lg: 'h-8 w-16',
} as const satisfies Record<ThemeSwitchSize, string>

/**
 * Switch knob size classes.
 * @internal
 */
const KNOB_SIZES = {
    sm: 'h-5 w-5',
    md: 'h-6 w-6',
    lg: 'h-7 w-7',
} as const satisfies Record<ThemeSwitchSize, string>

/**
 * Switch knob translation classes for checked state.
 * @internal
 */
const TRANSLATE_CLASSES = {
    sm: 'peer-checked:translate-x-[1.25rem]',
    md: 'peer-checked:translate-x-[1.75rem]',
    lg: 'peer-checked:translate-x-[2rem]',
} as const satisfies Record<ThemeSwitchSize, string>

/**
 * Props for internal icon components.
 * @internal
 */
interface IconProps {
    readonly class?: string
}

/**
 * Sun icon component using Lucide-style SVG.
 * @internal
 */
const SunIcon: FC<IconProps> = ({ class: className }) => (
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
        aria-hidden='true'
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
 * Moon icon component using Lucide-style SVG.
 * @internal
 */
const MoonIcon: FC<IconProps> = ({ class: className }) => (
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
        aria-hidden='true'
    >
        <path d='M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z' />
    </svg>
)

/**
 * Inline JavaScript to toggle theme.
 * @internal
 */
const TOGGLE_THEME_JS = 'window.toggleTheme()' as const

/**
 * ThemeSwitch Component
 *
 * A versatile theme switcher with multiple visual styles for toggling between
 * light and dark modes. Works with the `ThemeSwitchScript` component for
 * initialization and state persistence.
 *
 * @example Basic usage
 * ```tsx
 * import { ThemeSwitch, ThemeSwitchScript } from '@lockness/ui/components'
 *
 * export const Layout = ({ children }) => (
 *   <html>
 *     <body>
 *       <header>
 *         <ThemeSwitch />
 *       </header>
 *       {children}
 *       <ThemeSwitchScript />
 *     </body>
 *   </html>
 * )
 * ```
 *
 * @example All variants
 * ```tsx
 * // Classic: Two buttons with labels
 * <ThemeSwitch variant="classic" />
 *
 * // Toggle: Single icon button
 * <ThemeSwitch variant="toggle" />
 *
 * // Switch: Checkbox-style toggle
 * <ThemeSwitch variant="switch" />
 * ```
 *
 * @example With custom styling
 * ```tsx
 * <ThemeSwitch
 *   variant="switch"
 *   size="lg"
 *   sunIconClass="text-amber-500"
 *   moonIconClass="text-indigo-500"
 * />
 * ```
 *
 * @see {@link ThemeSwitchScript} - Required companion script for theme initialization
 * @see {@link ThemeSwitchProps} - Component props documentation
 */
export const ThemeSwitch: FC<ThemeSwitchProps> = ({
    class: className,
    variant = 'classic',
    size = 'md',
    darkLabel = 'Dark',
    lightLabel = 'Light',
    sunIconClass,
    moonIconClass,
    ...props
}) => {
    // --- Classic Variant (Two buttons) ---
    if (variant === 'classic') {
        const btnClasses = cn(
            'flex items-center gap-x-(--theme-switch-classic-gap) rounded-(--theme-switch-border-radius) font-medium transition-colors border border-border shadow-xs',
            'px-(--theme-switch-classic-padding-x) py-(--theme-switch-classic-padding-y)',
            'bg-background text-foreground hover:bg-accent focus:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
            SIZE_CLASSES[size],
        )
        return (
            <div
                class={cn(
                    'flex items-center gap-2 theme-switch-classic',
                    className,
                )}
                role='group'
                aria-label='Theme switcher'
                {...props}
            >
                <button
                    type='button'
                    class={cn(btnClasses, 'dark:hidden')}
                    onclick={TOGGLE_THEME_JS}
                    aria-label={`Current theme: Light. Switch to ${darkLabel} mode`}
                >
                    <MoonIcon
                        class={cn(ICON_SIZE_CLASSES[size], moonIconClass)}
                    />
                    <span>{darkLabel}</span>
                </button>
                <button
                    type='button'
                    class={cn(btnClasses, 'hidden dark:flex')}
                    onclick={TOGGLE_THEME_JS}
                    aria-label={`Current theme: Dark. Switch to ${lightLabel} mode`}
                >
                    <SunIcon
                        class={cn(ICON_SIZE_CLASSES[size], sunIconClass)}
                    />
                    <span>{lightLabel}</span>
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
                    'inline-flex items-center justify-center rounded-(--theme-switch-border-radius) transition-colors theme-switch-toggle',
                    'p-(--theme-switch-toggle-padding)',
                    'text-foreground/80 hover:text-foreground hover:bg-accent',
                    'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
                    ICON_ONLY_SIZE_CLASSES[size],
                    className,
                )}
                onclick={TOGGLE_THEME_JS}
                aria-label='Toggle theme'
                {...props}
            >
                <SunIcon
                    class={cn(
                        ICON_SIZE_CLASSES[size],
                        'hidden dark:block',
                        sunIconClass,
                    )}
                />
                <MoonIcon
                    class={cn(
                        ICON_SIZE_CLASSES[size],
                        'block dark:hidden',
                        moonIconClass,
                    )}
                />
            </button>
        )
    }

    // --- Switch Variant (Checkbox style) ---
    if (variant === 'switch') {
        return (
            <label
                class={cn(
                    'relative inline-flex shrink-0 cursor-pointer items-center rounded-(--theme-switch-border-radius) transition-colors theme-switch-wrapper',
                    'bg-(--theme-switch-track-bg) dark:bg-(--theme-switch-track-bg-dark)',
                    'p-(--theme-switch-switch-padding)',
                    'focus-within:outline-hidden focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
                    SWITCH_SIZES[size],
                    className,
                )}
                {...props}
            >
                <input
                    type='checkbox'
                    class='peer sr-only theme-switch-input'
                    role='switch'
                    aria-label='Toggle theme'
                    onclick={TOGGLE_THEME_JS}
                />
                <span
                    class={cn(
                        'pointer-events-none relative block rounded-(--theme-switch-border-radius) bg-(--theme-switch-knob-bg) shadow-lg ring-0 transition-transform',
                        'translate-x-0',
                        TRANSLATE_CLASSES[size],
                        KNOB_SIZES[size],
                    )}
                >
                    <span class='absolute inset-0 flex items-center justify-center opacity-0 dark:opacity-100 transition-opacity'>
                        <SunIcon
                            class={cn(
                                'size-3 text-(--theme-switch-sun-color)',
                                sunIconClass,
                            )}
                        />
                    </span>
                    <span class='absolute inset-0 flex items-center justify-center dark:opacity-0 transition-opacity'>
                        <MoonIcon
                            class={cn(
                                'size-3 text-(--theme-switch-moon-color)',
                                moonIconClass,
                            )}
                        />
                    </span>
                </span>
            </label>
        )
    }

    return null
}

/**
 * ThemeSwitchScript Component
 *
 * Initializes theme switching functionality and keeps all ThemeSwitch components
 * in sync. This script should be added once to your root layout, typically at the
 * end of the `<body>` tag.
 *
 * @remarks
 * This component:
 * - Initializes theme from localStorage or system preference
 * - Provides the global `window.toggleTheme()` function
 * - Syncs all switch-variant checkboxes on theme change
 * - Handles Unpoly navigation events for SPA-like behavior
 *
 * @example
 * ```tsx
 * import { ThemeSwitchScript } from '@lockness/ui/components'
 *
 * export const RootLayout = ({ children }) => (
 *   <html>
 *     <head>...</head>
 *     <body>
 *       {children}
 *       <ThemeSwitchScript />
 *     </body>
 *   </html>
 * )
 * ```
 *
 * @see {@link ThemeSwitch} - The theme switcher component
 */
export const ThemeSwitchScript: FC = () => (
    <script
        dangerouslySetInnerHTML={{
            __html: `
                (function() {
                    window.toggleTheme = function() {
                        const isDark = document.documentElement.classList.toggle('dark');
                        localStorage.setItem('theme', isDark ? 'dark' : 'light');
                        window.dispatchEvent(new CustomEvent('theme-change', { 
                            detail: { theme: isDark ? 'dark' : 'light' } 
                        }));
                    };

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
