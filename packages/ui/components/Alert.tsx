/**
 * @fileoverview Alert component for notifications and messages.
 *
 * Provides alert containers with title and description for
 * displaying important information to users.
 *
 * @module @lockness/ui/components/alert
 */

import type { FC } from '@lockness/core'
import { cn } from '../lib/utils.ts'

/**
 * Alert component props
 */
export interface AlertProps {
    /**
     * Visual style variant
     * @default 'default'
     */
    variant?: 'default' | 'destructive'
    /**
     * Alert content
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
     * ARIA role
     */
    role?: string
    /**
     * Additional HTML attributes
     */
    [key: string]: unknown
}

/**
 * Alert Component
 *
 * Alert message component for notifications and status messages.
 * Uses CSS variables for theming.
 *
 * @example
 * ```tsx
 * // Basic alert
 * <Alert>
 *   <AlertTitle>Heads up!</AlertTitle>
 *   <AlertDescription>
 *     You can add components to your app using the CLI.
 *   </AlertDescription>
 * </Alert>
 *
 * // Destructive alert
 * <Alert variant="destructive">
 *   <AlertTitle>Error</AlertTitle>
 *   <AlertDescription>
 *     Your session has expired. Please log in again.
 *   </AlertDescription>
 * </Alert>
 *
 * // With custom styling
 * <Alert class="mb-4">
 *   <AlertTitle>Information</AlertTitle>
 *   <AlertDescription>Your changes have been saved.</AlertDescription>
 * </Alert>
 * ```
 */
export const Alert: FC<AlertProps> = ({
    variant = 'default',
    class: className,
    children,
    role = 'alert',
    ...props
}) => {
    return (
        <div
            role={role}
            class={cn(
                'relative w-full p-(--alert-padding)',
                'rounded-(--alert-border-radius)',
                'border-[length:--alert-border-width]',
                '[&>svg~*]:pl-7 [&>svg+div]:-translate-y-0.75',
                '[&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4',
                '[&>svg]:w-(--alert-icon-size) [&>svg]:h-(--alert-icon-size)',
                '[&>svg]:text-(--foreground)',
                variant === 'default' &&
                    'bg-(--background) text-(--foreground) border-(--border)',
                variant === 'destructive' &&
                    'border-(--destructive)/50 text-(--destructive)',
                '[&>svg]:text-(--destructive)',
                className,
            )}
            {...props}
        >
            {children}
        </div>
    )
}

/**
 * AlertTitle component props
 */
export interface AlertTitleProps {
    /**
     * Title content
     */
    children?: unknown
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
 * AlertTitle Component
 *
 * Title for the Alert component.
 */
export const AlertTitle: FC<AlertTitleProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <h5
            class={cn(
                'mb-1 leading-none tracking-tight',
                'text-(length:--alert-title-font-size)',
                'font-[--alert-title-font-weight]',
                className,
            )}
            {...props}
        >
            {children}
        </h5>
    )
}

/**
 * AlertDescription component props
 */
export interface AlertDescriptionProps {
    /**
     * Description content
     */
    children?: unknown
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
 * AlertDescription Component
 *
 * Description text for the Alert component.
 */
export const AlertDescription: FC<AlertDescriptionProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <div
            class={cn(
                'text-(length:--alert-description-font-size)',
                '[&_p]:leading-relaxed',
                className,
            )}
            {...props}
        >
            {children}
        </div>
    )
}
