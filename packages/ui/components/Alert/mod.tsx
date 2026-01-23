/**
 * @fileoverview Alert component for notifications and messages.
 *
 * Provides alert containers with title and description for
 * displaying important notifications, warnings, and status messages.
 * Fully customizable via CSS variables.
 *
 * @module @lockness/ui/components/alert
 */

import type { FC } from '@lockness/core'
import { cn } from '../../lib/utils.ts'
import {
    AlertTriangleIcon,
    CheckCircleIcon,
    InfoCircleIcon,
    XCircleIcon,
} from '../../icons.tsx'

// =============================================================================
// Types
// =============================================================================

/**
 * Available visual variants for the Alert component.
 *
 * - `default` - Neutral styling using muted colors
 * - `success` - Green styling for success/confirmation messages
 * - `warning` - Yellow/amber styling for warning messages
 * - `destructive` - Red styling for error/critical messages
 */
export type AlertVariant =
    | 'default'
    | 'success'
    | 'warning'
    | 'destructive'

/**
 * Props for the Alert component.
 *
 * @example
 * ```tsx
 * const props: AlertProps = {
 *   variant: 'success',
 *   showIcon: true,
 *   class: 'my-4'
 * }
 * ```
 */
export interface AlertProps {
    /**
     * Visual style variant that determines the color scheme.
     * Each variant has corresponding CSS variables for customization.
     * @default 'default'
     * @see {@link AlertVariant} for available options
     */
    variant?: AlertVariant
    /**
     * When true, displays the default icon for the current variant.
     * - default: Information circle icon
     * - success: Checkmark circle icon
     * - warning: Warning triangle icon
     * - destructive: X circle icon
     * @default false
     */
    showIcon?: boolean
    /**
     * Custom icon element that overrides the default variant icon.
     * Should be an SVG or icon component. When provided, the icon
     * will be shown regardless of the `showIcon` prop value.
     */
    icon?: unknown
    /**
     * Alert content, typically {@link AlertTitle} and {@link AlertDescription}.
     */
    children?: unknown
    /**
     * Additional CSS class names to apply to the alert container.
     */
    class?: string
    /**
     * HTML id attribute for the alert element.
     */
    id?: string
    /**
     * ARIA role for the alert. Use 'alert' for important messages
     * that require immediate attention, or 'status' for less urgent updates.
     * @default 'alert'
     * @see https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Roles/alert_role
     */
    role?: 'alert' | 'status' | string
    /**
     * Additional HTML attributes passed to the root div element.
     */
    [key: string]: unknown
}

/**
 * Maps each alert variant to its default icon component.
 * Uses icons from `@lockness/ui/icons`.
 * @internal
 */
const variantIcons: Record<AlertVariant, FC<{ size?: number }>> = {
    default: InfoCircleIcon,
    success: CheckCircleIcon,
    warning: AlertTriangleIcon,
    destructive: XCircleIcon,
}

/**
 * CSS class strings for each alert variant.
 * Uses CSS variables for theming support.
 * @internal
 */
const variantStyles: Record<AlertVariant, string> = {
    default: cn(
        'bg-(--alert-default-bg)',
        'text-(--alert-default-fg)',
        'border-(--alert-default-border)',
        '[--alert-icon-color:var(--alert-default-icon)]',
    ),
    success: cn(
        'bg-(--alert-success-bg)',
        'text-(--alert-success-fg)',
        'border-(--alert-success-border)',
        '[--alert-icon-color:var(--alert-success-icon)]',
    ),
    warning: cn(
        'bg-(--alert-warning-bg)',
        'text-(--alert-warning-fg)',
        'border-(--alert-warning-border)',
        '[--alert-icon-color:var(--alert-warning-icon)]',
    ),
    destructive: cn(
        'bg-(--alert-destructive-bg)',
        'text-(--alert-destructive-fg)',
        'border-(--alert-destructive-border)',
        '[--alert-icon-color:var(--alert-destructive-icon)]',
    ),
}

/**
 * Alert Component
 *
 * Alert message component for notifications and status messages.
 * Fully customizable via CSS variables.
 *
 * CSS Variables:
 * - `--alert-padding`: Padding inside the alert (default: 1rem)
 * - `--alert-border-radius`: Border radius (default: var(--radius))
 * - `--alert-border-width`: Border width (default: 1px)
 * - `--alert-icon-size`: Icon size (default: 1.25rem)
 * - `--alert-icon-gap`: Gap between icon and content (default: 0.75rem)
 * - `--alert-title-font-size`: Title font size (default: 0.875rem)
 * - `--alert-title-font-weight`: Title font weight (default: 600)
 * - `--alert-description-font-size`: Description font size (default: 0.875rem)
 *
 * Per-variant colors:
 * - `--alert-{variant}-bg`: Background color
 * - `--alert-{variant}-fg`: Text color
 * - `--alert-{variant}-border`: Border color
 * - `--alert-{variant}-icon`: Icon color
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
 * // With icon
 * <Alert variant="success" showIcon>
 *   <AlertTitle>Success!</AlertTitle>
 *   <AlertDescription>Your changes have been saved.</AlertDescription>
 * </Alert>
 *
 * // Destructive with icon
 * <Alert variant="destructive" showIcon>
 *   <AlertTitle>Error</AlertTitle>
 *   <AlertDescription>
 *     Your session has expired. Please log in again.
 *   </AlertDescription>
 * </Alert>
 * ```
 */
export const Alert: FC<AlertProps> = ({
    variant = 'default',
    showIcon = false,
    icon,
    class: className,
    children,
    role = 'alert',
    ...props
}) => {
    // Determine icon to show
    const IconComponent = variantIcons[variant]
    const shouldShowIcon = showIcon || icon
    const iconElement = icon ?? <IconComponent size={20} />

    return (
        <div
            role={role}
            class={cn(
                // Layout
                'relative flex gap-(--alert-icon-gap)',
                'w-full p-(--alert-padding)',
                // Border & shape
                'rounded-(--alert-border-radius)',
                'border-[length:--alert-border-width]',
                // Variant styles
                variantStyles[variant],
                className,
            )}
            {...props}
        >
            {shouldShowIcon && iconElement && (
                <div
                    class={cn(
                        'shrink-0 mt-0.5',
                        'w-(--alert-icon-size) h-(--alert-icon-size)',
                        'text-(--alert-icon-color)',
                    )}
                >
                    {iconElement}
                </div>
            )}
            <div class='flex-1 min-w-0'>
                {children}
            </div>
        </div>
    )
}

/**
 * Props for the AlertTitle component.
 *
 * @example
 * ```tsx
 * <AlertTitle class="font-bold">Important Notice</AlertTitle>
 * ```
 */
export interface AlertTitleProps {
    /**
     * Title text or elements to display.
     */
    children?: unknown
    /**
     * Additional CSS class names to apply to the title.
     */
    class?: string
    /**
     * Additional HTML attributes passed to the h5 element.
     */
    [key: string]: unknown
}

/**
 * Title component for the Alert.
 *
 * Renders as an h5 element with appropriate font sizing and weight.
 * Should be used as a direct child of the {@link Alert} component.
 *
 * @param props - Component props
 * @returns The rendered title element
 *
 * @example
 * ```tsx
 * <Alert>
 *   <AlertTitle>Heads up!</AlertTitle>
 *   <AlertDescription>Some description here.</AlertDescription>
 * </Alert>
 * ```
 */
export const AlertTitle: FC<AlertTitleProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <h5
            class={cn(
                'leading-tight tracking-tight',
                'text-(length:--alert-title-font-size)',
                'font-(--alert-title-font-weight)',
                'mb-1',
                className,
            )}
            {...props}
        >
            {children}
        </h5>
    )
}

/**
 * Props for the AlertDescription component.
 *
 * @example
 * ```tsx
 * <AlertDescription class="text-sm">
 *   Your changes have been saved successfully.
 * </AlertDescription>
 * ```
 */
export interface AlertDescriptionProps {
    /**
     * Description text or elements to display.
     * Can contain paragraphs, links, or other inline content.
     */
    children?: unknown
    /**
     * Additional CSS class names to apply to the description.
     */
    class?: string
    /**
     * Additional HTML attributes passed to the div element.
     */
    [key: string]: unknown
}

/**
 * Description component for the Alert.
 *
 * Renders as a div with relaxed line-height for readability.
 * Should be used as a direct child of the {@link Alert} component,
 * typically following an {@link AlertTitle}.
 *
 * @param props - Component props
 * @returns The rendered description element
 *
 * @example
 * ```tsx
 * <Alert variant="warning" showIcon>
 *   <AlertTitle>Attention Required</AlertTitle>
 *   <AlertDescription>
 *     Please review your settings before continuing.
 *   </AlertDescription>
 * </Alert>
 * ```
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
                'leading-relaxed',
                'opacity-90',
                '[&_p]:leading-relaxed',
                className,
            )}
            {...props}
        >
            {children}
        </div>
    )
}
