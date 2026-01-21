/**
 * @fileoverview Hero section component for landing pages.
 *
 * Full-width hero with background patterns, announcement badges,
 * and call-to-action elements.
 *
 * @module @lockness/ui/components/hero
 */

import type { FC } from '@lockness/core'
import { cn } from '../lib/utils.ts'

/**
 * Hero component props
 */
export interface HeroProps {
    /**
     * Background style
     * @default 'none'
     */
    background?: 'none' | 'pattern' | 'gradient' | 'dots' | 'grid'
    /**
     * Content alignment
     * @default 'center'
     */
    align?: 'center' | 'left'
    /**
     * Vertical padding size
     * @default 'lg'
     */
    size?: 'sm' | 'md' | 'lg' | 'xl'
    /**
     * Container max width
     * @default 'default'
     */
    maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | 'default' | 'full'
    /**
     * Additional CSS class names
     */
    class?: string
    /**
     * Children content
     */
    children?: unknown
    /**
     * Additional HTML attributes
     */
    [key: string]: unknown
}

const sizeClasses = {
    sm: 'py-12 md:py-16',
    md: 'py-16 md:py-24',
    lg: 'py-24 md:py-32',
    xl: 'py-32 md:py-48',
}

const maxWidthClasses = {
    sm: 'max-w-2xl',
    md: 'max-w-4xl',
    lg: 'max-w-5xl',
    xl: 'max-w-6xl',
    default: 'max-w-[85rem]',
    full: 'max-w-full',
}

/**
 * Hero Component
 *
 * A customizable hero section for landing pages.
 *
 * @example
 * ```tsx
 * <Hero background="gradient" size="lg">
 *   <HeroTitle>Build something amazing</HeroTitle>
 *   <HeroSubtitle>Start your next project today.</HeroSubtitle>
 *   <HeroActions>
 *     <HeroCTA href="/start">Get Started</HeroCTA>
 *   </HeroActions>
 * </Hero>
 * ```
 */
export const Hero: FC<HeroProps> = ({
    background = 'none',
    align = 'center',
    size = 'lg',
    maxWidth = 'default',
    class: className,
    children,
    ...props
}) => {
    const backgroundStyles = {
        none: '',
        pattern:
            "before:absolute before:top-0 before:start-1/2 before:bg-[url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 1000 1000%22%3E%3Cpolygon fill=%22%23f3f4f6%22 points=%220,0 500,0 0,500%22/%3E%3Cpolygon fill=%22%23e5e7eb%22 points=%22500,0 1000,0 1000,500 500,500%22/%3E%3Cpolygon fill=%22%23f9fafb%22 points=%220,500 500,500 500,1000 0,1000%22/%3E%3Cpolygon fill=%22%23f3f4f6%22 points=%22500,500 1000,500 1000,1000%22/%3E%3C/svg%3E')] dark:before:bg-[url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 1000 1000%22%3E%3Cpolygon fill=%22%231f2937%22 points=%220,0 500,0 0,500%22/%3E%3Cpolygon fill=%22%23111827%22 points=%22500,0 1000,0 1000,500 500,500%22/%3E%3Cpolygon fill=%22%230f172a%22 points=%220,500 500,500 500,1000 0,1000%22/%3E%3Cpolygon fill=%22%231f2937%22 points=%22500,500 1000,500 1000,1000%22/%3E%3C/svg%3E')] before:bg-no-repeat before:bg-top before:bg-cover before:size-full before:-z-1 before:transform before:-translate-x-1/2",
        gradient:
            'bg-gradient-to-b from-primary/5 via-transparent to-transparent dark:from-primary/10',
        dots:
            'before:absolute before:inset-0 before:bg-[radial-gradient(circle,_var(--border)_1px,_transparent_1px)] before:bg-[size:24px_24px] before:-z-1',
        grid:
            'before:absolute before:inset-0 before:bg-[linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] before:bg-[size:48px_48px] before:-z-1 before:opacity-50',
    }

    return (
        <section
            class={cn(
                'relative overflow-hidden',
                sizeClasses[size],
                backgroundStyles[background],
                className,
            )}
            {...props}
        >
            <div
                class={cn(
                    'mx-auto px-4 sm:px-6 lg:px-8',
                    maxWidthClasses[maxWidth],
                    align === 'center' && 'text-center',
                )}
            >
                {children}
            </div>
        </section>
    )
}

/**
 * Hero Announcement Banner props
 */
export interface HeroAnnouncementProps {
    /**
     * Link URL
     */
    href?: string
    /**
     * Badge text (shown in pill)
     */
    badge?: string
    /**
     * Additional CSS class names
     */
    class?: string
    /**
     * Children content
     */
    children?: unknown
    /**
     * Additional HTML attributes
     */
    [key: string]: unknown
}

/**
 * Hero Announcement Banner
 *
 * A pill-style announcement banner for the hero section.
 */
export const HeroAnnouncement: FC<HeroAnnouncementProps> = ({
    href,
    badge,
    class: className,
    children,
    ...props
}) => {
    const content = (
        <>
            {children}
            {badge && (
                <span class='py-1.5 px-2.5 inline-flex justify-center items-center gap-x-2 rounded-full bg-muted font-semibold text-sm text-muted-foreground'>
                    {badge}
                    <svg
                        class='shrink-0 size-4'
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
                        <path d='m9 18 6-6-6-6' />
                    </svg>
                </span>
            )}
        </>
    )

    const classes = cn(
        'inline-flex items-center gap-x-2 bg-card border border-border text-sm text-foreground p-1 ps-3 rounded-full transition hover:border-ring focus:outline-none focus:border-ring',
        className,
    )

    if (href) {
        return (
            <div class='flex justify-center mb-5'>
                <a href={href} class={classes} {...props}>
                    {content}
                </a>
            </div>
        )
    }

    return (
        <div class='flex justify-center mb-5'>
            <div class={classes} {...props}>
                {content}
            </div>
        </div>
    )
}

/**
 * Hero Title props
 */
export interface HeroTitleProps {
    /**
     * Title size
     * @default 'default'
     */
    size?: 'sm' | 'default' | 'lg' | 'xl'
    /**
     * Gradient text (wrap part of title in this)
     */
    gradient?: string
    /**
     * Gradient colors
     * @default 'primary'
     */
    gradientColors?:
        | 'primary'
        | 'blue-violet'
        | 'green-teal'
        | 'orange-red'
        | 'custom'
    /**
     * Custom gradient class (when gradientColors is 'custom')
     */
    gradientClass?: string
    /**
     * Additional CSS class names
     */
    class?: string
    /**
     * Children content
     */
    children?: unknown
    /**
     * Additional HTML attributes
     */
    [key: string]: unknown
}

const titleSizeClasses = {
    sm: 'text-2xl md:text-3xl lg:text-4xl',
    default: 'text-3xl md:text-4xl lg:text-5xl',
    lg: 'text-4xl md:text-5xl lg:text-6xl',
    xl: 'text-5xl md:text-6xl lg:text-7xl',
}

const gradientClasses = {
    primary: 'bg-gradient-to-r from-primary to-primary/60',
    'blue-violet': 'bg-gradient-to-tl from-blue-600 to-violet-600',
    'green-teal': 'bg-gradient-to-r from-green-500 to-teal-500',
    'orange-red': 'bg-gradient-to-r from-orange-500 to-red-500',
    custom: '',
}

/**
 * Hero Title Component
 */
export const HeroTitle: FC<HeroTitleProps> = ({
    size = 'default',
    gradient,
    gradientColors = 'primary',
    gradientClass,
    class: className,
    children,
    ...props
}) => {
    return (
        <h1
            class={cn(
                'block font-bold text-foreground',
                titleSizeClasses[size],
                className,
            )}
            {...props}
        >
            {children}
            {gradient && (
                <>
                    {' '}
                    <span
                        class={cn(
                            'bg-clip-text text-transparent',
                            gradientColors === 'custom'
                                ? gradientClass
                                : gradientClasses[gradientColors],
                        )}
                    >
                        {gradient}
                    </span>
                </>
            )}
        </h1>
    )
}

/**
 * Hero Subtitle props
 */
export interface HeroSubtitleProps {
    /**
     * Max width
     * @default 'md'
     */
    maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | 'full'
    /**
     * Additional CSS class names
     */
    class?: string
    /**
     * Children content
     */
    children?: unknown
    /**
     * Additional HTML attributes
     */
    [key: string]: unknown
}

const subtitleMaxWidthClasses = {
    sm: 'max-w-xl',
    md: 'max-w-2xl',
    lg: 'max-w-3xl',
    xl: 'max-w-4xl',
    full: 'max-w-full',
}

/**
 * Hero Subtitle Component
 */
export const HeroSubtitle: FC<HeroSubtitleProps> = ({
    maxWidth = 'md',
    class: className,
    children,
    ...props
}) => {
    return (
        <p
            class={cn(
                'mt-5 text-lg text-muted-foreground mx-auto',
                subtitleMaxWidthClasses[maxWidth],
                className,
            )}
            {...props}
        >
            {children}
        </p>
    )
}

/**
 * Hero Actions Container props
 */
export interface HeroActionsProps {
    /**
     * Additional CSS class names
     */
    class?: string
    /**
     * Children content
     */
    children?: unknown
    /**
     * Additional HTML attributes
     */
    [key: string]: unknown
}

/**
 * Hero Actions Container
 */
export const HeroActions: FC<HeroActionsProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <div
            class={cn('mt-8 gap-3 flex justify-center flex-wrap', className)}
            {...props}
        >
            {children}
        </div>
    )
}

/**
 * Hero CTA Button props
 */
export interface HeroCTAProps {
    /**
     * Link URL
     */
    href?: string
    /**
     * Button variant
     * @default 'gradient'
     */
    variant?: 'gradient' | 'primary' | 'secondary' | 'outline'
    /**
     * Button size
     * @default 'default'
     */
    size?: 'sm' | 'default' | 'lg'
    /**
     * Show arrow icon
     * @default true
     */
    showArrow?: boolean
    /**
     * Additional CSS class names
     */
    class?: string
    /**
     * Children content
     */
    children?: unknown
    /**
     * Additional HTML attributes
     */
    [key: string]: unknown
}

const ctaSizeClasses = {
    sm: 'py-2 px-3 text-sm',
    default: 'py-3 px-4 text-sm',
    lg: 'py-4 px-6 text-base',
}

const ctaVariantClasses = {
    gradient:
        'bg-gradient-to-tl from-blue-600 to-violet-600 hover:from-violet-600 hover:to-blue-600 border border-transparent text-white focus:from-violet-600 focus:to-blue-600',
    primary:
        'bg-primary text-primary-foreground hover:bg-primary/90 border border-transparent',
    secondary:
        'bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-transparent',
    outline:
        'bg-background text-foreground hover:bg-muted border border-border',
}

/**
 * Hero CTA Button Component
 */
export const HeroCTA: FC<HeroCTAProps> = ({
    href,
    variant = 'gradient',
    size = 'default',
    showArrow = true,
    class: className,
    children,
    ...props
}) => {
    const classes = cn(
        'inline-flex justify-center items-center gap-x-3 text-center font-medium rounded-(--radius) focus:outline-none transition-all',
        ctaSizeClasses[size],
        ctaVariantClasses[variant],
        className,
    )

    const content = (
        <>
            {children}
            {showArrow && (
                <svg
                    class='shrink-0 size-4'
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
                    <path d='m9 18 6-6-6-6' />
                </svg>
            )}
        </>
    )

    if (href) {
        return (
            <a href={href} class={classes} {...props}>
                {content}
            </a>
        )
    }

    return (
        <button type='button' class={classes} {...props}>
            {content}
        </button>
    )
}

/**
 * Hero Command Button props
 */
export interface HeroCommandProps {
    /**
     * Command text to display and copy
     */
    command: string
    /**
     * Additional CSS class names
     */
    class?: string
    /**
     * Additional HTML attributes
     */
    [key: string]: unknown
}

/**
 * Hero Command Button
 *
 * A code/command display with copy functionality.
 */
export const HeroCommand: FC<HeroCommandProps> = ({
    command,
    class: className,
    ...props
}) => {
    const copyId = `hero-cmd-${Math.random().toString(36).slice(2, 9)}`

    return (
        <button
            type='button'
            class={cn(
                'relative group p-2 ps-3 inline-flex items-center gap-x-2 text-sm font-mono rounded-(--radius) border border-border bg-card text-foreground shadow-sm hover:bg-muted focus:outline-none focus:bg-muted transition-colors',
                className,
            )}
            onclick={`navigator.clipboard.writeText('${command}');var el=document.getElementById('${copyId}');el.textContent='Copied!';setTimeout(()=>el.textContent='',1500)`}
            {...props}
        >
            <span class='text-muted-foreground'>$</span>
            {command}
            <span
                id={copyId}
                class='absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-foreground text-background text-xs rounded opacity-0 transition-opacity'
                style='opacity: 0;'
            />
            <span class='flex justify-center items-center bg-muted rounded-md size-7'>
                <svg
                    class='shrink-0 size-4 group-hover:rotate-6 transition'
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
                    <rect width='8' height='4' x='8' y='2' rx='1' ry='1' />
                    <path d='M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' />
                </svg>
            </span>
        </button>
    )
}

/**
 * Hero Footer props
 */
export interface HeroFooterProps {
    /**
     * Additional CSS class names
     */
    class?: string
    /**
     * Children content
     */
    children?: unknown
    /**
     * Additional HTML attributes
     */
    [key: string]: unknown
}

/**
 * Hero Footer Component
 *
 * Footer section for additional links and info.
 */
export const HeroFooter: FC<HeroFooterProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <div
            class={cn(
                'mt-5 flex flex-col sm:flex-row justify-center items-center gap-1.5 sm:gap-3 text-sm',
                className,
            )}
            {...props}
        >
            {children}
        </div>
    )
}

/**
 * Hero Separator
 *
 * A visual separator for the footer.
 */
export const HeroSeparator: FC<{ class?: string }> = ({ class: className }) => (
    <svg
        class={cn('hidden sm:block size-5 text-border', className)}
        width='16'
        height='16'
        viewBox='0 0 16 16'
        fill='none'
        xmlns='http://www.w3.org/2000/svg'
        aria-hidden='true'
    >
        <path d='M6 13L10 3' stroke='currentColor' stroke-linecap='round' />
    </svg>
)

/**
 * Hero Link props
 */
export interface HeroLinkProps {
    /**
     * Link URL
     */
    href: string
    /**
     * Show arrow icon
     * @default true
     */
    showArrow?: boolean
    /**
     * Additional CSS class names
     */
    class?: string
    /**
     * Children content
     */
    children?: unknown
    /**
     * Additional HTML attributes
     */
    [key: string]: unknown
}

/**
 * Hero Link Component
 */
export const HeroLink: FC<HeroLinkProps> = ({
    href,
    showArrow = true,
    class: className,
    children,
    ...props
}) => {
    return (
        <a
            href={href}
            class={cn(
                'inline-flex items-center gap-x-1 text-sm text-primary decoration-2 hover:underline focus:outline-none focus:underline font-medium',
                className,
            )}
            {...props}
        >
            {children}
            {showArrow && (
                <svg
                    class='shrink-0 size-4'
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
                    <path d='m9 18 6-6-6-6' />
                </svg>
            )}
        </a>
    )
}

/**
 * Hero Badge/Tag props
 */
export interface HeroBadgeProps {
    /**
     * Label text
     */
    label?: string
    /**
     * Additional CSS class names
     */
    class?: string
    /**
     * Children content (value)
     */
    children?: unknown
    /**
     * Additional HTML attributes
     */
    [key: string]: unknown
}

/**
 * Hero Badge Component
 *
 * A label-value badge for the footer.
 */
export const HeroBadge: FC<HeroBadgeProps> = ({
    label,
    class: className,
    children,
    ...props
}) => {
    return (
        <div class={cn('flex flex-wrap gap-1 sm:gap-3', className)} {...props}>
            {label && (
                <span class='text-sm text-muted-foreground'>{label}:</span>
            )}
            <span class='text-sm font-bold text-foreground'>{children}</span>
        </div>
    )
}

/**
 * Hero Image props
 */
export interface HeroImageProps {
    /**
     * Image source URL
     */
    src: string
    /**
     * Alt text
     */
    alt?: string
    /**
     * Image position
     * @default 'bottom'
     */
    position?: 'bottom' | 'right' | 'background'
    /**
     * Additional CSS class names
     */
    class?: string
    /**
     * Additional HTML attributes
     */
    [key: string]: unknown
}

/**
 * Hero Image Component
 */
export const HeroImage: FC<HeroImageProps> = ({
    src,
    alt = '',
    position = 'bottom',
    class: className,
    ...props
}) => {
    if (position === 'background') {
        return (
            <div
                class={cn(
                    'absolute inset-0 -z-10 bg-cover bg-center bg-no-repeat',
                    className,
                )}
                style={{ backgroundImage: `url(${src})` }}
                {...props}
            />
        )
    }

    if (position === 'right') {
        return (
            <div
                class={cn(
                    'mt-8 lg:mt-0 lg:absolute lg:end-0 lg:top-1/2 lg:-translate-y-1/2 lg:w-1/2',
                    className,
                )}
            >
                <img
                    src={src}
                    alt={alt}
                    class='w-full h-auto rounded-(--radius) shadow-xl'
                    {...props}
                />
            </div>
        )
    }

    return (
        <div class={cn('mt-10', className)}>
            <img
                src={src}
                alt={alt}
                class='w-full h-auto rounded-(--radius) shadow-xl'
                {...props}
            />
        </div>
    )
}
