/**
 * @fileoverview Newsletter subscription form component.
 *
 * Customizable email capture form with multiple layout variants.
 *
 * @module @lockness/ui/components/newsletter
 */

import type { FC } from '@lockness/hono'
import { cn } from '../../lib/utils.ts'

/**
 * Newsletter component props
 */
export interface NewsletterProps {
    /**
     * Layout variant
     * @default 'inline'
     */
    variant?: 'inline' | 'stacked' | 'card' | 'minimal'
    /**
     * Form action URL
     * @default '#'
     */
    action?: string
    /**
     * Form method
     * @default 'post'
     */
    method?: 'get' | 'post'
    /**
     * Input placeholder text
     * @default 'Enter your email'
     */
    placeholder?: string
    /**
     * Submit button text
     * @default 'Subscribe'
     */
    buttonText?: string
    /**
     * Title text (for stacked/card variants)
     */
    title?: string
    /**
     * Description text
     */
    description?: string
    /**
     * Show email icon in input
     * @default false
     */
    showIcon?: boolean
    /**
     * Additional CSS class names
     */
    class?: string
    /**
     * Input name attribute
     * @default 'email'
     */
    inputName?: string
    /**
     * Unpoly target for form submission
     */
    'up-target'?: string
    /**
     * Additional HTML attributes
     */
    [key: string]: unknown
}

const EmailIcon = () => (
    <svg
        class='size-5 text-muted-foreground'
        xmlns='http://www.w3.org/2000/svg'
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        stroke-width='2'
        stroke-linecap='round'
        stroke-linejoin='round'
    >
        <rect width='20' height='16' x='2' y='4' rx='2' />
        <path d='m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7' />
    </svg>
)

/**
 * Newsletter Component
 *
 * A customizable email subscription form component.
 *
 * @example
 * ```tsx
 * // Inline (default)
 * <Newsletter action="/subscribe" />
 *
 * // Stacked with title
 * <Newsletter
 *   variant="stacked"
 *   title="Subscribe to our newsletter"
 *   description="Get the latest updates in your inbox."
 * />
 *
 * // Card variant
 * <Newsletter
 *   variant="card"
 *   title="Stay updated"
 *   showIcon
 * />
 *
 * // Minimal
 * <Newsletter variant="minimal" />
 * ```
 */
export const Newsletter: FC<NewsletterProps> = ({
    variant = 'inline',
    action = '#',
    method = 'post',
    placeholder = 'Enter your email',
    buttonText = 'Subscribe',
    title,
    description,
    showIcon = false,
    class: className,
    inputName = 'email',
    'up-target': upTarget,
    ...props
}) => {
    const formProps = {
        action,
        method,
        ...(upTarget ? { 'up-target': upTarget, 'up-submit': true } : {}),
    }

    // Inline variant
    if (variant === 'inline') {
        return (
            <form
                {...formProps}
                class={cn('flex gap-(--newsletter-gap)', className)}
                {...props}
            >
                <div class='relative flex-1'>
                    {showIcon && (
                        <div class='absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none'>
                            <EmailIcon />
                        </div>
                    )}
                    <input
                        type='email'
                        name={inputName}
                        placeholder={placeholder}
                        required
                        class={cn(
                            'w-full h-(--newsletter-input-height) px-(--newsletter-padding) py-2 bg-background border border-input rounded-(--newsletter-border-radius) text-sm',
                            'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
                            showIcon && 'ps-10',
                        )}
                    />
                </div>
                <button
                    type='submit'
                    class='h-(--newsletter-input-height) px-(--newsletter-padding) bg-primary text-primary-foreground rounded-(--newsletter-border-radius) text-sm font-medium hover:bg-primary/90 transition-colors'
                >
                    {buttonText}
                </button>
            </form>
        )
    }

    // Stacked variant
    if (variant === 'stacked') {
        return (
            <div class={cn('space-y-(--newsletter-gap)', className)} {...props}>
                {title && (
                    <h3 class='text-lg font-semibold text-foreground'>
                        {title}
                    </h3>
                )}
                {description && (
                    <p class='text-sm text-muted-foreground'>{description}</p>
                )}
                <form {...formProps} class='space-y-(--newsletter-gap)'>
                    <div class='relative'>
                        {showIcon && (
                            <div class='absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none'>
                                <EmailIcon />
                            </div>
                        )}
                        <input
                            type='email'
                            name={inputName}
                            placeholder={placeholder}
                            required
                            class={cn(
                                'w-full h-(--newsletter-input-height) px-(--newsletter-padding) py-2 bg-background border border-input rounded-(--newsletter-border-radius) text-sm',
                                'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
                                showIcon && 'ps-10',
                            )}
                        />
                    </div>
                    <button
                        type='submit'
                        class='w-full h-(--newsletter-input-height) px-(--newsletter-padding) bg-primary text-primary-foreground rounded-(--newsletter-border-radius) text-sm font-medium hover:bg-primary/90 transition-colors'
                    >
                        {buttonText}
                    </button>
                </form>
            </div>
        )
    }

    // Card variant
    if (variant === 'card') {
        return (
            <div
                class={cn(
                    'p-(--newsletter-padding) bg-card border border-border rounded-(--newsletter-border-radius) shadow-sm',
                    className,
                )}
                {...props}
            >
                <div class='space-y-(--newsletter-gap)'>
                    {showIcon && (
                        <div class='size-12 flex items-center justify-center bg-primary/10 rounded-(--newsletter-border-radius)'>
                            <svg
                                class='size-6 text-primary'
                                xmlns='http://www.w3.org/2000/svg'
                                viewBox='0 0 24 24'
                                fill='none'
                                stroke='currentColor'
                                stroke-width='2'
                                stroke-linecap='round'
                                stroke-linejoin='round'
                            >
                                <rect
                                    width='20'
                                    height='16'
                                    x='2'
                                    y='4'
                                    rx='2'
                                />
                                <path d='m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7' />
                            </svg>
                        </div>
                    )}
                    {title && (
                        <h3 class='text-lg font-semibold text-foreground'>
                            {title}
                        </h3>
                    )}
                    {description && (
                        <p class='text-sm text-muted-foreground'>
                            {description}
                        </p>
                    )}
                    <form {...formProps} class='flex gap-(--newsletter-gap)'>
                        <input
                            type='email'
                            name={inputName}
                            placeholder={placeholder}
                            required
                            class='flex-1 h-(--newsletter-input-height) px-(--newsletter-padding) py-2 bg-background border border-input rounded-(--newsletter-border-radius) text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent'
                        />
                        <button
                            type='submit'
                            class='h-(--newsletter-input-height) px-(--newsletter-padding) bg-primary text-primary-foreground rounded-(--newsletter-border-radius) text-sm font-medium hover:bg-primary/90 transition-colors'
                        >
                            {buttonText}
                        </button>
                    </form>
                </div>
            </div>
        )
    }

    // Minimal variant
    if (variant === 'minimal') {
        return (
            <form
                {...formProps}
                class={cn('flex', className)}
                {...props}
            >
                <input
                    type='email'
                    name={inputName}
                    placeholder={placeholder}
                    required
                    class='flex-1 h-9 px-3 py-1.5 bg-transparent border-b border-input text-sm placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors'
                />
                <button
                    type='submit'
                    class='h-9 px-3 text-sm font-medium text-primary hover:text-primary/80 transition-colors'
                >
                    {buttonText}
                </button>
            </form>
        )
    }

    return null
}

/**
 * NewsletterSection component props
 */
export interface NewsletterSectionProps {
    /**
     * Background style
     * @default 'default'
     */
    background?: 'default' | 'muted' | 'primary' | 'gradient'
    /**
     * Title text
     */
    title?: string
    /**
     * Description text
     */
    description?: string
    /**
     * Form action URL
     */
    action?: string
    /**
     * Submit button text
     */
    buttonText?: string
    /**
     * Show social proof (subscriber count)
     */
    socialProof?: string
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
 * Newsletter Section Component
 *
 * A full-width newsletter section for landing pages.
 *
 * @example
 * ```tsx
 * <NewsletterSection
 *   background="gradient"
 *   title="Join 10,000+ subscribers"
 *   description="Get weekly tips and resources."
 *   socialProof="Join 10,000+ developers"
 * />
 * ```
 */
export const NewsletterSection: FC<NewsletterSectionProps> = ({
    background = 'default',
    title = 'Subscribe to our newsletter',
    description = 'Get the latest updates delivered to your inbox.',
    action = '#',
    buttonText = 'Subscribe',
    socialProof,
    class: className,
    ...props
}) => {
    const backgroundClasses = {
        default: 'bg-background',
        muted: 'bg-muted',
        primary: 'bg-primary text-primary-foreground',
        gradient:
            'bg-gradient-to-r from-primary to-primary/60 text-primary-foreground',
    }

    const isPrimaryBg = background === 'primary' || background === 'gradient'

    return (
        <section
            class={cn(
                'py-12 md:py-16',
                backgroundClasses[background],
                className,
            )}
            {...props}
        >
            <div class='container mx-auto px-4'>
                <div class='max-w-2xl mx-auto text-center space-y-6'>
                    <h2
                        class={cn(
                            'text-2xl md:text-3xl font-bold',
                            !isPrimaryBg && 'text-foreground',
                        )}
                    >
                        {title}
                    </h2>
                    <p
                        class={cn(
                            'text-base',
                            isPrimaryBg
                                ? 'text-primary-foreground/80'
                                : 'text-muted-foreground',
                        )}
                    >
                        {description}
                    </p>
                    <form
                        action={action}
                        method='post'
                        class='flex flex-col sm:flex-row gap-3 max-w-md mx-auto'
                    >
                        <input
                            type='email'
                            name='email'
                            placeholder='Enter your email'
                            required
                            class={cn(
                                'flex-1 h-12 px-4 rounded-(--radius) text-sm focus:outline-none focus:ring-2',
                                isPrimaryBg
                                    ? 'bg-white/10 border border-white/20 text-primary-foreground placeholder:text-primary-foreground/60 focus:ring-white/30'
                                    : 'bg-background border border-input placeholder:text-muted-foreground focus:ring-ring',
                            )}
                        />
                        <button
                            type='submit'
                            class={cn(
                                'h-12 px-6 rounded-(--radius) text-sm font-medium transition-colors',
                                isPrimaryBg
                                    ? 'bg-white text-primary hover:bg-white/90'
                                    : 'bg-primary text-primary-foreground hover:bg-primary/90',
                            )}
                        >
                            {buttonText}
                        </button>
                    </form>
                    {socialProof && (
                        <p
                            class={cn(
                                'text-sm',
                                isPrimaryBg
                                    ? 'text-primary-foreground/70'
                                    : 'text-muted-foreground',
                            )}
                        >
                            {socialProof}
                        </p>
                    )}
                </div>
            </div>
        </section>
    )
}
