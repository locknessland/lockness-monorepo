/**
 * @fileoverview Card components for content containers.
 *
 * Compound components for building flexible card layouts with
 * header, title, description, content, and footer sections.
 *
 * @module @lockness/ui/components/card
 */

import type { FC } from '@lockness/core'
import { cn } from '../lib/utils.ts'

/**
 * Card component props
 */
export interface CardProps {
    /**
     * Card content
     */
    children?: unknown
    /**
     * Additional CSS class names
     */
    class?: string
    /**
     * Element id attribute
     */
    id?: string
    /**
     * Additional HTML attributes
     */
    [key: string]: unknown
}

/**
 * Card
 *
 * Main card container with border and shadow.
 *
 * @example
 * ```tsx
 * <Card>
 *   <CardHeader>
 *     <CardTitle>User Profile</CardTitle>
 *   </CardHeader>
 *   <CardContent>
 *     Profile information goes here
 *   </CardContent>
 * </Card>
 * ```
 */
export const Card: FC<CardProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <div
            class={cn(
                'rounded-(--radius) border bg-card text-card-foreground shadow-sm',
                className,
            )}
            {...props}
        >
            {children}
        </div>
    )
}

/**
 * CardHeader
 *
 * Header section of the card, typically contains the title and optional icon.
 *
 * @example
 * ```tsx
 * <CardHeader icon="🎨">
 *   <CardTitle>Title</CardTitle>
 * </CardHeader>
 *
 * <CardHeader icon="🎨" iconPosition="top">
 *   <CardTitle>Title</CardTitle>
 * </CardHeader>
 * ```
 */
export interface CardHeaderProps extends CardProps {
    /**
     * Optional icon or emoji to display with the content
     */
    icon?: string
    /**
     * Position of the icon relative to the content
     * @default 'left'
     */
    iconPosition?: 'left' | 'top' | 'right'
}

export const CardHeader: FC<CardHeaderProps> = ({
    class: className,
    icon,
    iconPosition = 'left',
    children,
    ...props
}) => {
    const iconElement = icon && (
        <div class='text-2xl'>
            {icon}
        </div>
    )

    const layoutClasses = {
        left: 'flex-row items-center gap-3',
        top: 'flex-col',
        right: 'flex-row-reverse items-center gap-3',
    }

    return (
        <div
            class={cn(
                'flex space-y-1.5 p-(--card-header-padding)',
                icon ? layoutClasses[iconPosition] : 'flex-col',
                className,
            )}
            {...props}
        >
            {(iconPosition === 'left' || iconPosition === 'right') &&
                iconElement}
            {iconPosition === 'top' && iconElement && (
                <div class='mb-2'>
                    {iconElement}
                </div>
            )}
            <div class='flex flex-col space-y-1.5 flex-1'>
                {children}
            </div>
        </div>
    )
}

/**
 * CardTitle
 *
 * Title typography for card headers.
 *
 * @example
 * ```tsx
 * <CardTitle>Dashboard</CardTitle>
 * ```
 */
export const CardTitle: FC<CardProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <h3
            class={cn(
                'text-(length:--card-title-font-size) font-semibold leading-none tracking-tight',
                className,
            )}
            {...props}
        >
            {children}
        </h3>
    )
}

/**
 * CardDescription
 *
 * Description text for card headers.
 *
 * @example
 * ```tsx
 * <CardDescription>Manage your account settings</CardDescription>
 * ```
 */
export const CardDescription: FC<CardProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <p class={cn('text-sm text-muted-foreground', className)} {...props}>
            {children}
        </p>
    )
}

/**
 * CardContent
 *
 * Main content area of the card.
 *
 * @example
 * ```tsx
 * <CardContent>
 *   <p>Your content here</p>
 * </CardContent>
 * ```
 */
export const CardContent: FC<CardProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <div
            class={cn('p-(--card-content-padding) pt-0', className)}
            {...props}
        >
            {children}
        </div>
    )
}

/**
 * CardFooter
 *
 * Footer section of the card, typically for actions.
 *
 * @example
 * ```tsx
 * <CardFooter>
 *   <Button>Save</Button>
 *   <Button variant="outline">Cancel</Button>
 * </CardFooter>
 * ```
 */
export const CardFooter: FC<CardProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <div
            class={cn(
                'flex items-center p-(--card-footer-padding) pt-0',
                className,
            )}
            {...props}
        >
            {children}
        </div>
    )
}
