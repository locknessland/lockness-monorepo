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
                'rounded-lg border border-gray-200 bg-white shadow-sm',
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
 * Header section of the card, typically contains the title.
 *
 * @example
 * ```tsx
 * <CardHeader>
 *   <CardTitle>Title</CardTitle>
 *   <p class="text-sm text-gray-500">Subtitle</p>
 * </CardHeader>
 * ```
 */
export const CardHeader: FC<CardProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <div
            class={cn('flex flex-col space-y-1.5 p-6', className)}
            {...props}
        >
            {children}
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
                'text-2xl font-semibold leading-none tracking-tight',
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
        <p class={cn('text-sm text-gray-500', className)} {...props}>
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
        <div class={cn('p-6 pt-0', className)} {...props}>
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
            class={cn('flex items-center p-6 pt-0', className)}
            {...props}
        >
            {children}
        </div>
    )
}
