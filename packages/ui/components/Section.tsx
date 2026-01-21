/**
 * @fileoverview Page section components for landing pages.
 *
 * Provides consistent layout structure with configurable backgrounds,
 * padding sizes, and container widths.
 *
 * @module @lockness/ui/components/section
 */

import type { FC } from '@lockness/core'
import { cn } from '../lib/utils.ts'

// =============================================================================
// Section
// =============================================================================

/**
 * Section component props
 */
export interface SectionProps {
    /**
     * Section content
     */
    children?: unknown
    /**
     * Section ID for anchor links
     */
    id?: string
    /**
     * Background variant
     * @default 'default'
     */
    variant?: 'default' | 'muted' | 'accent' | 'card'
    /**
     * Vertical padding size
     * @default 'lg'
     */
    size?: 'sm' | 'md' | 'lg' | 'xl'
    /**
     * Container max-width
     * @default 'lg'
     */
    container?: 'sm' | 'md' | 'lg' | 'xl' | 'full' | false
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
 * Section
 *
 * A page section wrapper with configurable background, padding, and container.
 *
 * @example
 * ```tsx
 * <Section id="features" variant="muted" size="lg">
 *     <SectionHeader>
 *         <SectionTitle>Features</SectionTitle>
 *         <SectionDescription>Everything you need</SectionDescription>
 *     </SectionHeader>
 *     <SectionContent>
 *         <FeatureCard ... />
 *     </SectionContent>
 * </Section>
 * ```
 */
export const Section: FC<SectionProps> = ({
    children,
    id,
    variant = 'default',
    size = 'lg',
    container = 'lg',
    class: className,
    ...props
}) => {
    const variantClasses = {
        default: 'bg-background',
        muted: 'bg-muted/30',
        accent: 'bg-primary/5',
        card: 'bg-card/50 border-y border-border',
    }

    const sizeClasses = {
        sm: 'py-(--section-padding-y-sm)',
        md: 'py-(--section-padding-y-md)',
        lg: 'py-(--section-padding-y-lg)',
        xl: 'py-(--section-padding-y-xl)',
    }

    const containerClasses = {
        sm: 'max-w-(--section-container-sm)',
        md: 'max-w-(--section-container-md)',
        lg: 'max-w-(--section-container-lg)',
        xl: 'max-w-(--section-container-xl)',
        full: 'max-w-full',
    }

    return (
        <section
            id={id}
            class={cn(
                'px-(--section-padding-x) rounded-(--section-border-radius)',
                variantClasses[variant],
                sizeClasses[size],
                className,
            )}
            {...props}
        >
            {container !== false
                ? (
                    <div class={cn('mx-auto', containerClasses[container])}>
                        {children}
                    </div>
                )
                : children}
        </section>
    )
}

// =============================================================================
// SectionHeader
// =============================================================================

/**
 * SectionHeader component props
 */
export interface SectionHeaderProps {
    /**
     * Header content
     */
    children?: unknown
    /**
     * Text alignment
     * @default 'center'
     */
    align?: 'left' | 'center' | 'right'
    /**
     * Additional CSS class names
     */
    class?: string
}

/**
 * SectionHeader
 *
 * Container for section title and description.
 */
export const SectionHeader: FC<SectionHeaderProps> = ({
    children,
    align = 'center',
    class: className,
}) => {
    const alignClasses = {
        left: 'text-left',
        center: 'text-center',
        right: 'text-right',
    }

    return (
        <div
            class={cn(
                'mb-(--section-header-margin-bottom) space-y-(--section-header-gap)',
                alignClasses[align],
                className,
            )}
        >
            {children}
        </div>
    )
}

// =============================================================================
// SectionTitle
// =============================================================================

/**
 * SectionTitle component props
 */
export interface SectionTitleProps {
    /**
     * Title text
     */
    children?: unknown
    /**
     * Additional CSS class names
     */
    class?: string
}

/**
 * SectionTitle
 *
 * The main heading of a section.
 */
export const SectionTitle: FC<SectionTitleProps> = ({
    children,
    class: className,
}) => (
    <h2
        class={cn(
            'text-(length:--section-title-font-size) md:text-(length:--section-title-font-size-md) lg:text-(length:--section-title-font-size-lg)',
            'font-(--section-title-font-weight) tracking-(--section-title-letter-spacing)',
            'leading-(--section-title-line-height) text-foreground mb-(--section-title-margin-bottom)',
            className,
        )}
    >
        {children}
    </h2>
)

// =============================================================================
// SectionDescription
// =============================================================================

/**
 * SectionDescription component props
 */
export interface SectionDescriptionProps {
    /**
     * Description text
     */
    children?: unknown
    /**
     * Center the text block (adds mx-auto)
     * @default true
     */
    centered?: boolean
    /**
     * Additional CSS class names
     */
    class?: string
}

/**
 * SectionDescription
 *
 * Subtitle/description text below the section title.
 */
export const SectionDescription: FC<SectionDescriptionProps> = ({
    children,
    centered = true,
    class: className,
}) => (
    <p
        class={cn(
            'text-(length:--section-description-font-size) md:text-(length:--section-description-font-size-md)',
            'leading-(--section-description-line-height) text-muted-foreground',
            'max-w-(--section-description-max-width)',
            centered && 'mx-auto',
            className,
        )}
    >
        {children}
    </p>
)

// =============================================================================
// SectionContent
// =============================================================================

/**
 * SectionContent component props
 */
export interface SectionContentProps {
    /**
     * Content
     */
    children?: unknown
    /**
     * Additional CSS class names
     */
    class?: string
}

/**
 * SectionContent
 *
 * Container for section body content.
 */
export const SectionContent: FC<SectionContentProps> = ({
    children,
    class: className,
}) => <div class={cn(className)}>{children}</div>
