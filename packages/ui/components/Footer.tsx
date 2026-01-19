import type { FC } from '@lockness/core'
import { cn } from '../lib/utils.ts'

/**
 * FooterLink component props
 */
export interface FooterLinkProps {
    /**
     * Link URL
     */
    href: string
    /**
     * Link text
     */
    children?: unknown
    /**
     * Open in new tab
     */
    external?: boolean
    /**
     * Additional CSS class names
     */
    class?: string
}

/**
 * FooterLink
 *
 * A link styled for footer navigation.
 */
export const FooterLink: FC<FooterLinkProps> = ({
    href,
    children,
    external,
    class: className,
}) => (
    <a
        href={href}
        class={cn(
            'text-muted-foreground hover:text-foreground transition-colors',
            className,
        )}
        {...(external && { target: '_blank', rel: 'noopener noreferrer' })}
    >
        {children}
    </a>
)

/**
 * FooterSection component props
 */
export interface FooterSectionProps {
    /**
     * Section title
     */
    title: string
    /**
     * Section content (links)
     */
    children?: unknown
    /**
     * Additional CSS class names
     */
    class?: string
}

/**
 * FooterSection
 *
 * A section within the footer with a title and list of links.
 */
export const FooterSection: FC<FooterSectionProps> = ({
    title,
    children,
    class: className,
}) => (
    <div class={cn('space-y-4', className)}>
        <h3 class='text-sm font-semibold text-foreground'>{title}</h3>
        <ul class='space-y-2 text-sm'>{children}</ul>
    </div>
)

/**
 * FooterSectionItem component props
 */
export interface FooterSectionItemProps {
    /**
     * Link URL
     */
    href: string
    /**
     * Link text
     */
    children?: unknown
    /**
     * Open in new tab
     */
    external?: boolean
}

/**
 * FooterSectionItem
 *
 * A list item within a FooterSection.
 */
export const FooterSectionItem: FC<FooterSectionItemProps> = ({
    href,
    children,
    external,
}) => (
    <li>
        <FooterLink href={href} external={external}>
            {children}
        </FooterLink>
    </li>
)

/**
 * Footer component props
 */
export interface FooterProps {
    /**
     * Footer content (sections, links, etc.)
     */
    children?: unknown
    /**
     * Additional CSS class names
     */
    class?: string
    /**
     * Copyright text
     */
    copyright?: string
    /**
     * Brand/Logo element
     */
    brand?: unknown
}

/**
 * Footer
 *
 * Main footer component with brand, sections, and copyright.
 *
 * @example
 * ```tsx
 * <Footer
 *   brand={<Logo />}
 *   copyright="© 2025 Company. All rights reserved."
 * >
 *   <FooterSection title="Product">
 *     <FooterSectionItem href="/features">Features</FooterSectionItem>
 *     <FooterSectionItem href="/pricing">Pricing</FooterSectionItem>
 *   </FooterSection>
 * </Footer>
 * ```
 */
export const Footer: FC<FooterProps> = ({
    children,
    class: className,
    copyright,
    brand,
}) => {
    return (
        <footer
            class={cn(
                'border-t bg-card/30 py-12 px-6',
                className,
            )}
        >
            <div class='max-w-5xl mx-auto'>
                <div class='grid grid-cols-2 md:grid-cols-4 gap-8'>
                    {brand && (
                        <div class='col-span-2 md:col-span-1 space-y-4'>
                            {brand}
                        </div>
                    )}
                    {children}
                </div>

                {copyright && (
                    <div class='mt-12 pt-8 border-t text-center text-sm text-muted-foreground'>
                        {copyright}
                    </div>
                )}
            </div>
        </footer>
    )
}
