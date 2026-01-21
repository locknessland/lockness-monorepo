/**
 * @fileoverview Pricing cards and tables component.
 *
 * Pricing display components for subscription and product pricing.
 *
 * @module @lockness/ui/components/pricing
 */

import type { FC } from '@lockness/core'
import { cn } from '../lib/utils.ts'
import { Button } from './Button.tsx'
import type { ButtonProps } from './Button.tsx'
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from './Card.tsx'
import { Badge } from './Badge.tsx'
import type { BadgeProps } from './Badge.tsx'
import { CheckCircleIcon, XCircleIcon } from '../icons.tsx'

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Common currency symbols for pricing display
 * @see https://en.wikipedia.org/wiki/Currency_symbol
 */
export type CurrencySymbol =
    | '$' // USD, CAD, AUD, etc.
    | '€' // EUR
    | '£' // GBP
    | '¥' // JPY, CNY
    | '₹' // INR
    | '₽' // RUB
    | 'Fr' // CHF
    | 'kr' // SEK, NOK, DKK
    | 'R$' // BRL
    // Allow custom currencies while keeping autocomplete
    // deno-lint-ignore ban-types
    | (string & {})

/**
 * Common billing period options
 */
export type BillingPeriod =
    | 'month'
    | 'year'
    | 'week'
    | 'day'
    | 'one-time'
    | 'lifetime'
    // Allow custom periods while keeping autocomplete
    // deno-lint-ignore ban-types
    | (string & {})

/**
 * Billing period selection for toggle
 */
export type BillingPeriodSelection = 'monthly' | 'yearly'

// ============================================================================
// PricingCard
// ============================================================================

/**
 * Props for the PricingCard component
 */
export interface PricingCardProps {
    /**
     * Card content (typically PricingCardHeader, PricingCardPrice, etc.)
     */
    children?: unknown
    /**
     * Additional CSS class names
     */
    class?: string
    /**
     * Whether this tier is emphasized/featured
     * Adds visual emphasis with border highlight and scale effect
     * @default false
     */
    featured?: boolean
}

/**
 * PricingCard Component
 *
 * Main container for a pricing tier. Acts as the root component for building
 * pricing cards with a consistent layout and styling.
 *
 * Use `featured={true}` to highlight a recommended or popular plan with
 * visual emphasis (border highlight, scale effect, elevated z-index).
 *
 * @example Basic usage
 * ```tsx
 * <PricingCard>
 *   <PricingCardHeader title="Starter" />
 *   <PricingCardPrice price={9} period="month" />
 *   <PricingCardFeatures>
 *     <PricingCardFeature>5 projects</PricingCardFeature>
 *   </PricingCardFeatures>
 *   <PricingCardAction href="/signup">Get Started</PricingCardAction>
 * </PricingCard>
 * ```
 *
 * @example Featured tier
 * ```tsx
 * <PricingCard featured>
 *   <PricingCardHeader badge="Popular" title="Pro" />
 *   <PricingCardPrice price={29} period="month" />
 *   <PricingCardFeatures>
 *     <PricingCardFeature>Unlimited projects</PricingCardFeature>
 *   </PricingCardFeatures>
 *   <PricingCardAction href="/signup">Get Started</PricingCardAction>
 * </PricingCard>
 * ```
 */
export const PricingCard: FC<PricingCardProps> = ({
    children,
    class: className,
    featured = false,
}) => {
    return (
        <Card
            class={cn(
                'relative flex flex-col h-full',
                featured && 'border-primary shadow-lg scale-105 z-10',
                className,
            )}
        >
            {children}
        </Card>
    )
}

// ============================================================================
// PricingCardHeader
// ============================================================================

/**
 * Props for the PricingCardHeader component
 */
export interface PricingCardHeaderProps {
    /**
     * Tier name displayed as the card title
     * @example "Starter", "Pro", "Enterprise"
     */
    title: string
    /**
     * Optional badge text displayed above the title
     * @example "Popular", "Best Value", "New"
     */
    badge?: string
    /**
     * Visual variant for the badge
     * @default 'default'
     */
    badgeVariant?: BadgeProps['variant']
    /**
     * Additional CSS class names
     */
    class?: string
}

/**
 * PricingCardHeader Component
 *
 * Header section displaying the tier name and optional promotional badge.
 * The badge appears above the title and can be styled with different variants.
 *
 * @example Basic header
 * ```tsx
 * <PricingCardHeader title="Pro" />
 * ```
 *
 * @example With badge
 * ```tsx
 * <PricingCardHeader title="Pro" badge="Popular" />
 * ```
 *
 * @example With styled badge
 * ```tsx
 * <PricingCardHeader
 *   title="Enterprise"
 *   badge="Best Value"
 *   badgeVariant="secondary"
 * />
 * ```
 */
export const PricingCardHeader: FC<PricingCardHeaderProps> = ({
    title,
    badge,
    badgeVariant = 'default',
    class: className,
}) => {
    return (
        <CardHeader class={cn('text-center', className)}>
            {badge && (
                <div class='mb-2 flex justify-center'>
                    <Badge variant={badgeVariant}>{badge}</Badge>
                </div>
            )}
            <CardTitle class='text-2xl'>{title}</CardTitle>
        </CardHeader>
    )
}

// ============================================================================
// PricingCardPrice
// ============================================================================

/**
 * Props for the PricingCardPrice component
 */
export interface PricingCardPriceProps {
    /**
     * Price amount to display
     * Can be a number (e.g., 29) or string (e.g., "Custom", "Free")
     */
    price: number | string
    /**
     * Currency symbol displayed before the price
     * Use CurrencySymbol type for common currencies with autocomplete
     * @default '$'
     * @example '$', '€', '£', '¥', '₹'
     */
    currency?: CurrencySymbol
    /**
     * Billing period displayed after the price
     * Use BillingPeriod type for common periods with autocomplete
     * @example 'month', 'year', 'one-time', 'lifetime'
     */
    period?: BillingPeriod
    /**
     * Original price for showing discounts (displayed with strikethrough)
     * @example originalPrice={348} with price={290} shows the discount
     */
    originalPrice?: number | string
    /**
     * Additional description text below the price
     * @example "Save $58/year", "Billed annually", "Free forever"
     */
    description?: string
    /**
     * Additional CSS class names
     */
    class?: string
}

/**
 * PricingCardPrice Component
 *
 * Displays the price with currency symbol, amount, and optional billing period.
 * The price amount is displayed larger than the currency for visual hierarchy.
 * Supports showing original prices for discount comparisons.
 *
 * @example Basic price
 * ```tsx
 * <PricingCardPrice price={29} period="month" />
 * ```
 *
 * @example With discount
 * ```tsx
 * <PricingCardPrice
 *   price={290}
 *   period="year"
 *   originalPrice={348}
 *   description="Save $58/year"
 * />
 * ```
 *
 * @example Free tier
 * ```tsx
 * <PricingCardPrice price={0} description="Free forever" />
 * ```
 *
 * @example Different currency
 * ```tsx
 * <PricingCardPrice price={29} currency="€" period="month" />
 * ```
 *
 * @example Custom pricing
 * ```tsx
 * <PricingCardPrice price="Custom" description="Contact us for pricing" />
 * ```
 */
export const PricingCardPrice: FC<PricingCardPriceProps> = ({
    price,
    currency = '$',
    period,
    originalPrice,
    description,
    class: className,
}) => {
    return (
        <CardContent class={cn('text-center py-6', className)}>
            <div class='flex items-baseline justify-center gap-0.5'>
                <span class='text-2xl font-semibold text-foreground self-start mt-2'>
                    {currency}
                </span>
                <span class='text-5xl font-bold text-foreground tracking-tight'>
                    {price}
                </span>
                {period && (
                    <span class='text-base text-muted-foreground ml-1'>
                        /{period}
                    </span>
                )}
            </div>
            {originalPrice !== undefined && (
                <div class='mt-2'>
                    <span class='text-sm text-muted-foreground line-through'>
                        {currency}
                        {originalPrice}
                    </span>
                </div>
            )}
            {description && (
                <CardDescription class='mt-2'>{description}</CardDescription>
            )}
        </CardContent>
    )
}

// ============================================================================
// PricingCardDescription
// ============================================================================

/**
 * Props for the PricingCardDescription component
 */
export interface PricingCardDescriptionProps {
    /**
     * Description text content
     */
    children?: unknown
    /**
     * Additional CSS class names
     */
    class?: string
}

/**
 * PricingCardDescription Component
 *
 * Short description text for the pricing tier.
 * Useful for explaining who the tier is best suited for.
 *
 * @example
 * ```tsx
 * <PricingCardDescription>
 *   Perfect for individuals and small teams
 * </PricingCardDescription>
 * ```
 */
export const PricingCardDescription: FC<PricingCardDescriptionProps> = ({
    children,
    class: className,
}) => {
    return (
        <CardContent class={cn('text-center pb-6', className)}>
            <CardDescription>{children}</CardDescription>
        </CardContent>
    )
}

// ============================================================================
// PricingCardFeatures
// ============================================================================

/**
 * Props for the PricingCardFeatures component
 */
export interface PricingCardFeaturesProps {
    /**
     * Feature items (typically PricingCardFeature components)
     */
    children?: unknown
    /**
     * Additional CSS class names
     */
    class?: string
}

/**
 * PricingCardFeatures Component
 *
 * Container for feature list items. Provides consistent spacing
 * and layout for feature lists within pricing cards.
 *
 * @example
 * ```tsx
 * <PricingCardFeatures>
 *   <PricingCardFeature>Unlimited projects</PricingCardFeature>
 *   <PricingCardFeature>10GB storage</PricingCardFeature>
 *   <PricingCardFeature included={false}>Priority support</PricingCardFeature>
 * </PricingCardFeatures>
 * ```
 */
export const PricingCardFeatures: FC<PricingCardFeaturesProps> = ({
    children,
    class: className,
}) => {
    return (
        <CardContent class={cn('flex-1 pb-6 space-y-3', className)}>
            <ul class='space-y-3'>{children}</ul>
        </CardContent>
    )
}

// ============================================================================
// PricingCardFeature
// ============================================================================

/**
 * Props for the PricingCardFeature component
 */
export interface PricingCardFeatureProps {
    /**
     * Feature text content
     */
    children?: unknown
    /**
     * Whether the feature is included in this tier
     * Shows a check icon when true, cross icon when false
     * @default true
     */
    included?: boolean
    /**
     * Additional CSS class names
     */
    class?: string
}

/**
 * PricingCardFeature Component
 *
 * Individual feature item with check/cross icon indicating availability.
 * Use within PricingCardFeatures container.
 *
 * @example Included feature (default)
 * ```tsx
 * <PricingCardFeature>Unlimited projects</PricingCardFeature>
 * ```
 *
 * @example Not included feature
 * ```tsx
 * <PricingCardFeature included={false}>Priority support</PricingCardFeature>
 * ```
 */
export const PricingCardFeature: FC<PricingCardFeatureProps> = ({
    children,
    included = true,
    class: className,
}) => {
    return (
        <li
            class={cn(
                'flex items-start gap-2 text-sm',
                included ? 'text-foreground' : 'text-muted-foreground',
                className,
            )}
        >
            <span class='flex-shrink-0 mt-0.5'>
                {included
                    ? <CheckCircleIcon class='w-5 h-5 text-primary' />
                    : <XCircleIcon class='w-5 h-5 text-muted-foreground/50' />}
            </span>
            <span>{children}</span>
        </li>
    )
}

// ============================================================================
// PricingCardAction
// ============================================================================

/**
 * Props for the PricingCardAction component
 */
export interface PricingCardActionProps {
    /**
     * Button text content
     */
    children?: unknown
    /**
     * Button href (renders as link with up-follow if provided)
     */
    href?: string
    /**
     * Button visual variant
     * @default 'primary'
     */
    variant?: ButtonProps['variant']
    /**
     * Additional CSS class names
     */
    class?: string
}

/**
 * PricingCardAction Component
 *
 * CTA button at the bottom of the pricing card.
 * Renders as a full-width button using the Button component.
 *
 * @example Basic action
 * ```tsx
 * <PricingCardAction href="/signup">Get Started</PricingCardAction>
 * ```
 *
 * @example With different variant
 * ```tsx
 * <PricingCardAction variant="outline">Contact Sales</PricingCardAction>
 * ```
 */
export const PricingCardAction: FC<PricingCardActionProps> = ({
    children,
    href,
    variant = 'primary',
    class: className,
}) => {
    return (
        <CardFooter class={cn('pt-0 mt-auto', className)}>
            <Button href={href} variant={variant} class='w-full'>
                {children}
            </Button>
        </CardFooter>
    )
}

// ============================================================================
// PricingToggle
// ============================================================================

/**
 * Props for the PricingToggle component
 */
export interface PricingToggleProps {
    /**
     * Currently selected billing period
     * @default 'monthly'
     */
    selected?: BillingPeriodSelection
    /**
     * Label for monthly option
     * @default 'Monthly'
     */
    monthlyLabel?: string
    /**
     * Label for yearly option
     * @default 'Yearly'
     */
    yearlyLabel?: string
    /**
     * Optional badge text for yearly option (e.g., discount message)
     * @example "Save 20%", "-2 months free"
     */
    yearlyBadge?: string
    /**
     * Additional CSS class names
     */
    class?: string
}

/**
 * PricingToggle Component
 *
 * Toggle switch for monthly/yearly billing periods.
 * Uses the global `--radius` CSS variable for consistent border radius.
 *
 * **Note:** This is a UI component only. For functional toggle,
 * implement with JavaScript, Alpine.js, or Unpoly.
 *
 * @example Basic toggle
 * ```tsx
 * <PricingToggle />
 * ```
 *
 * @example With yearly selected
 * ```tsx
 * <PricingToggle selected="yearly" />
 * ```
 *
 * @example With discount badge
 * ```tsx
 * <PricingToggle selected="yearly" yearlyBadge="Save 20%" />
 * ```
 */
export const PricingToggle: FC<PricingToggleProps> = ({
    selected = 'monthly',
    monthlyLabel = 'Monthly',
    yearlyLabel = 'Yearly',
    yearlyBadge,
    class: className,
}) => {
    return (
        <div
            class={cn(
                'flex items-center justify-center gap-3 mb-8',
                className,
            )}
        >
            <button
                type='button'
                class={cn(
                    'px-4 py-2 rounded-(--radius) text-sm font-medium transition-colors',
                    selected === 'monthly'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80',
                )}
                data-billing-period='monthly'
            >
                {monthlyLabel}
            </button>
            <button
                type='button'
                class={cn(
                    'px-4 py-2 rounded-(--radius) text-sm font-medium transition-colors flex items-center gap-2',
                    selected === 'yearly'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80',
                )}
                data-billing-period='yearly'
            >
                {yearlyLabel}
                {yearlyBadge && (
                    <Badge variant='secondary' class='text-xs'>
                        {yearlyBadge}
                    </Badge>
                )}
            </button>
        </div>
    )
}

// ============================================================================
// PricingSection
// ============================================================================

/**
 * Props for the PricingSection component
 */
export interface PricingSectionProps {
    /**
     * Pricing cards (typically 2-3 PricingCard components)
     */
    children?: unknown
    /**
     * Number of columns in grid layout
     * @default 3
     */
    columns?: 2 | 3
    /**
     * Additional CSS class names
     */
    class?: string
}

/**
 * PricingSection Component
 *
 * Grid container for pricing cards with responsive layout.
 * Automatically adjusts from single column on mobile to the
 * specified number of columns on larger screens.
 *
 * @example Two columns
 * ```tsx
 * <PricingSection columns={2}>
 *   <PricingCard>...</PricingCard>
 *   <PricingCard featured>...</PricingCard>
 * </PricingSection>
 * ```
 *
 * @example Three columns (default)
 * ```tsx
 * <PricingSection columns={3}>
 *   <PricingCard>...</PricingCard>
 *   <PricingCard featured>...</PricingCard>
 *   <PricingCard>...</PricingCard>
 * </PricingSection>
 * ```
 */
export const PricingSection: FC<PricingSectionProps> = ({
    children,
    columns = 3,
    class: className,
}) => {
    return (
        <div
            class={cn(
                'grid gap-6 items-start',
                columns === 2 && 'md:grid-cols-2 max-w-4xl mx-auto',
                columns === 3 && 'md:grid-cols-2 lg:grid-cols-3',
                className,
            )}
        >
            {children}
        </div>
    )
}

// ============================================================================
// PricingComparison
// ============================================================================

/**
 * Feature comparison row type
 * First element is the feature name, followed by values for each tier
 */
export type PricingComparisonFeature = [
    featureName: string,
    ...tierValues: (boolean | string)[],
]

/**
 * Props for the PricingComparison component
 */
export interface PricingComparisonProps {
    /**
     * Column headers (tier names)
     * @example ['Free', 'Pro', 'Enterprise']
     */
    tiers: readonly string[]
    /**
     * Feature comparison rows
     * Each row is a tuple where first element is the feature name,
     * followed by boolean/string values for each tier.
     * Use `true`/`false` for check/cross icons, or strings for custom values.
     * @example
     * ```tsx
     * features={[
     *   ['Projects', '3', '10', 'Unlimited'],
     *   ['Support', false, true, true],
     * ]}
     * ```
     */
    features: readonly PricingComparisonFeature[]
    /**
     * Additional CSS class names
     */
    class?: string
}

/**
 * PricingComparison Component
 *
 * Feature comparison table for detailed tier comparisons.
 * Displays a table with feature names in the first column and
 * tier values (check/cross icons or text) in subsequent columns.
 *
 * @example
 * ```tsx
 * <PricingComparison
 *   tiers={['Free', 'Pro', 'Enterprise']}
 *   features={[
 *     ['Projects', '3', '10', 'Unlimited'],
 *     ['Storage', '1 GB', '10 GB', '100 GB'],
 *     ['Support', false, true, true],
 *     ['Custom Domain', false, true, true],
 *   ]}
 * />
 * ```
 */
export const PricingComparison: FC<PricingComparisonProps> = ({
    tiers,
    features,
    class: className,
}) => {
    return (
        <div class={cn('overflow-x-auto', className)}>
            <table class='w-full border-collapse'>
                <thead>
                    <tr class='border-b border-border'>
                        <th class='text-left py-4 px-4 font-semibold text-foreground'>
                            Features
                        </th>
                        {tiers.map((tier) => (
                            <th
                                key={tier}
                                class='text-center py-4 px-4 font-semibold text-foreground'
                            >
                                {tier}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {features.map(([feature, ...values], index) => (
                        <tr
                            key={index}
                            class='border-b border-border hover:bg-muted/50 transition-colors'
                        >
                            <td class='py-4 px-4 text-sm text-muted-foreground'>
                                {feature}
                            </td>
                            {values.map((value, valueIndex) => (
                                <td
                                    key={valueIndex}
                                    class='text-center py-4 px-4'
                                >
                                    {typeof value === 'boolean'
                                        ? (
                                            value
                                                ? (
                                                    <CheckCircleIcon class='w-5 h-5 text-primary inline-block' />
                                                )
                                                : (
                                                    <XCircleIcon class='w-5 h-5 text-muted-foreground/50 inline-block' />
                                                )
                                        )
                                        : (
                                            <span class='text-sm text-foreground'>
                                                {value}
                                            </span>
                                        )}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
