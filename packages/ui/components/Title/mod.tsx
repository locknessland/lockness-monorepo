/**
 * @fileoverview Responsive heading component.
 *
 * Typography heading component with CSS variable-driven sizing.
 *
 * @module @lockness/ui/components/title
 */

import type { FC } from '@lockness/hono'
import { cn } from '../../lib/utils.ts'

// =============================================================================
// Title
// =============================================================================

/**
 * Title component props
 *
 * CSS Variables (customize in app.css):
 * - --title-h1-font-size: Base font size for h1 (default: 2.25rem)
 * - --title-h1-font-size-md: Medium breakpoint h1 size (default: 3rem)
 * - --title-h1-font-size-lg: Large breakpoint h1 size (default: 3.75rem)
 * - --title-h2-font-size: Calculated from h1 (default: h1 * 0.78)
 * - --title-h3-font-size: Calculated from h2 (default: h2 * 0.85)
 * - --title-h4-font-size: Calculated from h3 (default: h3 * 0.875)
 * - --title-h5-font-size: Calculated from h4 (default: h4 * 0.9)
 * - --title-h6-font-size: Calculated from h5 (default: h5 * 0.9)
 * - --title-font-weight: Font weight (default: 700)
 * - --title-line-height: Line height (default: 1.2)
 * - --title-letter-spacing: Letter spacing (default: -0.025em)
 * - --title-margin-bottom: Bottom margin (default: 0)
 * - --title-color: Text color (default: var(--foreground))
 */
export interface TitleProps {
    /**
     * Heading level (1-6)
     * @default 1
     */
    level?: 1 | 2 | 3 | 4 | 5 | 6
    /**
     * Size variant - 'hero' uses responsive sizes for h1
     * @default 'default'
     */
    size?: 'default' | 'hero'
    /**
     * Title content
     */
    children?: unknown
    /**
     * Additional CSS class names
     */
    class?: string
    /**
     * Use the semantic HTML tag matching the level
     * When false, uses a span with appropriate styling
     * @default true
     */
    as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'span' | 'p' | 'div'
    /**
     * Additional HTML attributes
     */
    [key: string]: unknown
}

/**
 * Title Component
 *
 * A flexible heading component with customizable sizes via CSS variables.
 * Sizes are chained: h1 is the base, and h2-h6 are calculated from it.
 *
 * @example
 * ```tsx
 * // Basic usage
 * <Title level={1}>Page Title</Title>
 * <Title level={2}>Section Title</Title>
 * <Title level={3}>Subsection</Title>
 *
 * // With custom styling
 * <Title level={1} class="text-primary">Colored Title</Title>
 *
 * // Hero size for landing pages (responsive)
 * <Title level={1} size="hero">Hero Title</Title>
 * ```
 */
export const Title: FC<TitleProps> = ({
    level = 1,
    size = 'default',
    children,
    class: className,
    as,
    ...props
}) => {
    // Font size CSS variable based on level
    const fontSizeVar = `--title-h${level}-font-size`

    // Hero size adds responsive classes for h1
    const heroClasses = size === 'hero' && level === 1
        ? 'md:text-(length:--title-h1-font-size-md) lg:text-(length:--title-h1-font-size-lg)'
        : ''

    // Base classes for all titles
    const baseClasses = cn(
        'font-(--title-font-weight)',
        'leading-(--title-line-height)',
        'tracking-(--title-letter-spacing)',
        'mb-(--title-margin-bottom)',
        'text-(--title-color)',
        heroClasses,
        className,
    )

    // Style with font size
    const style = { fontSize: `var(${fontSizeVar})` }

    // Determine element type and render accordingly
    const tag = as ?? `h${level}`

    if (tag === 'h1') {
        return <h1 class={baseClasses} style={style} {...props}>{children}</h1>
    }
    if (tag === 'h2') {
        return <h2 class={baseClasses} style={style} {...props}>{children}</h2>
    }
    if (tag === 'h3') {
        return <h3 class={baseClasses} style={style} {...props}>{children}</h3>
    }
    if (tag === 'h4') {
        return <h4 class={baseClasses} style={style} {...props}>{children}</h4>
    }
    if (tag === 'h5') {
        return <h5 class={baseClasses} style={style} {...props}>{children}</h5>
    }
    if (tag === 'h6') {
        return <h6 class={baseClasses} style={style} {...props}>{children}</h6>
    }
    if (tag === 'span') {
        return (
            <span class={baseClasses} style={style} {...props}>{children}</span>
        )
    }
    if (tag === 'p') {
        return <p class={baseClasses} style={style} {...props}>{children}</p>
    }
    if (tag === 'div') {
        return (
            <div class={baseClasses} style={style} {...props}>{children}</div>
        )
    }

    // Default fallback to h1
    return <h1 class={baseClasses} style={style} {...props}>{children}</h1>
}

export default Title
