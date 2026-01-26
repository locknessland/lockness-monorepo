/**
 * @fileoverview Feature card component for showcasing features.
 *
 * Styled card with icon, title, and description for feature lists.
 *
 * @module @lockness/ui/components/feature-card
 */

import type { FC } from '@lockness/hono'
import { cn } from '../../lib/utils.ts'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '../Card/mod.tsx'

/**
 * FeatureCard component props
 */
export interface FeatureCardProps {
    /**
     * Icon element to display
     */
    icon?: unknown
    /**
     * Feature title
     */
    title: string
    /**
     * Feature description
     */
    description: string
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
 * FeatureCard
 *
 * A card component designed for feature sections, with an icon, title, and description.
 * Uses the Card component internally with hover effects.
 *
 * @example
 * ```tsx
 * <FeatureCard
 *   icon={<ZapIcon />}
 *   title="Blazing Fast"
 *   description="Sub-millisecond response times"
 * />
 * ```
 */
export const FeatureCard: FC<FeatureCardProps> = ({
    icon,
    title,
    description,
    class: className,
    ...props
}) => {
    return (
        <Card
            class={cn(
                'group transition-all duration-200 hover:border-primary/50 hover:shadow-md',
                className,
            )}
            {...props}
        >
            <CardHeader class='pb-2'>
                {icon && (
                    <div class='h-10 w-10 rounded-(--radius) border bg-muted/50 flex items-center justify-center text-primary mb-2 group-hover:bg-primary/10 transition-colors'>
                        {icon}
                    </div>
                )}
                <CardTitle class='text-base group-hover:text-primary transition-colors'>
                    {title}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <CardDescription>{description}</CardDescription>
            </CardContent>
        </Card>
    )
}
