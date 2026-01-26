import type { FC } from '@lockness/hono'
import { cn } from '../../lib/utils.ts'

/**
 * Modal Dialog Component
 * Pure CSS implementation using <dialog> element and Unpoly layers
 */

/**
 * Modal Root - Uses HTML dialog element
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dialog
 */
export interface ModalProps {
    /** Unique identifier for the modal dialog */
    id: string
    /** Additional CSS class names */
    class?: string
    /** Modal content (header, body, footer) */
    children?: unknown
    /** Additional HTML attributes */
    [key: string]: unknown
}

export const Modal: FC<ModalProps> = ({
    id,
    class: className,
    children,
    ...props
}) => {
    return (
        <dialog
            id={id}
            class={cn(
                // Base styles
                'relative rounded-(--radius) border border-border bg-background shadow-lg',
                'backdrop:bg-black/50 backdrop:backdrop-blur-sm',
                // Positioning - center in viewport
                'fixed inset-0 m-auto',
                // Size and spacing
                'p-0 max-w-lg w-full max-h-[90vh]',
                // Animation
                'animate-in fade-in-0 zoom-in-95',
                // Reset browser defaults
                'overflow-visible',
                // Focus ring
                'focus:outline-none focus:ring-2 focus:ring-(--ring) focus:ring-offset-(--ring-offset)',
                className,
            )}
            onclick='if (event.target === this) this.close()'
            {...props}
        >
            {children}
        </dialog>
    )
}

/**
 * Modal Trigger - Opens the modal
 * Works with both CSS :target and Unpoly layers
 *
 * @example
 * ```tsx
 * // Native dialog trigger
 * <ModalTrigger targetId="my-modal">Open Modal</ModalTrigger>
 *
 * // Unpoly layer trigger
 * <ModalTrigger href="/modal-content" variant="outline">Open</ModalTrigger>
 * ```
 */
export interface ModalTriggerProps {
    /** ID of the target modal dialog (for native dialog) */
    targetId?: string
    /** URL to load in Unpoly layer (for Unpoly mode) */
    href?: string
    /** Additional CSS class names */
    class?: string
    /** Visual style variant */
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost'
    /** Button content */
    children?: unknown
    /** Additional HTML attributes */
    [key: string]: unknown
}

export const ModalTrigger: FC<ModalTriggerProps> = ({
    targetId,
    href,
    class: className,
    variant = 'primary',
    children,
    ...props
}) => {
    const variantClasses = {
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
        secondary:
            'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        outline:
            'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
    }

    // If href is provided, use Unpoly layer
    if (href) {
        return (
            <a
                href={href}
                up-layer='new'
                up-size='medium'
                up-dismissable='button'
                class={cn(
                    'inline-flex items-center justify-center rounded-(--radius) px-4 py-2',
                    'text-sm font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring)',
                    'disabled:pointer-events-none disabled:opacity-50',
                    variantClasses[variant],
                    className,
                )}
                {...props}
            >
                {children}
            </a>
        )
    }

    // Otherwise use native dialog with onclick
    return (
        <button
            type='button'
            onclick={`document.getElementById('${targetId}')?.showModal()`}
            class={cn(
                'inline-flex items-center justify-center rounded-(--radius) px-4 py-2',
                'text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring)',
                'disabled:pointer-events-none disabled:opacity-50',
                variantClasses[variant],
                className,
            )}
            {...props}
        >
            {children}
        </button>
    )
}

/**
 * Modal Content - Wrapper for modal sections
 */
export interface ModalContentProps {
    /** Additional CSS class names */
    class?: string
    /** Modal sections (header, body, footer) */
    children?: unknown
    /** Additional HTML attributes */
    [key: string]: unknown
}

export const ModalContent: FC<ModalContentProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <div
            class={cn('flex flex-col', className)}
            {...props}
        >
            {children}
        </div>
    )
}

/**
 * Modal Header - Top section with title and close button
 */
export interface ModalHeaderProps {
    /** Additional CSS class names */
    class?: string
    /** Header content (title, description, close button) */
    children?: unknown
    /** Additional HTML attributes */
    [key: string]: unknown
}

export const ModalHeader: FC<ModalHeaderProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <div
            class={cn(
                'flex items-center justify-between border-b border-border px-(--modal-header-padding-x) py-(--modal-header-padding-y)',
                className,
            )}
            {...props}
        >
            {children}
        </div>
    )
}

/**
 * Modal Title - Main heading text
 */
export interface ModalTitleProps {
    /** Additional CSS class names */
    class?: string
    /** Title text content */
    children?: unknown
    /** Additional HTML attributes */
    [key: string]: unknown
}

export const ModalTitle: FC<ModalTitleProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <h2
            class={cn(
                'text-lg font-semibold leading-none tracking-tight text-foreground',
                className,
            )}
            {...props}
        >
            {children}
        </h2>
    )
}

/**
 * Modal Description - Subtitle or additional context text
 */
export interface ModalDescriptionProps {
    /** Additional CSS class names */
    class?: string
    /** Description text content */
    children?: unknown
    /** Additional HTML attributes */
    [key: string]: unknown
}

export const ModalDescription: FC<ModalDescriptionProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <p
            class={cn('text-sm text-muted-foreground', className)}
            {...props}
        >
            {children}
        </p>
    )
}

/**
 * Modal Body - Main content area with scrolling support
 */
export interface ModalBodyProps {
    /** Additional CSS class names */
    class?: string
    /** Body content */
    children?: unknown
    /** Additional HTML attributes */
    [key: string]: unknown
}

export const ModalBody: FC<ModalBodyProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <div
            class={cn(
                'flex-1 overflow-auto px-(--modal-body-padding-x) py-(--modal-body-padding-y)',
                className,
            )}
            {...props}
        >
            {children}
        </div>
    )
}

/**
 * Modal Footer - Bottom section with action buttons
 */
export interface ModalFooterProps {
    /** Additional CSS class names */
    class?: string
    /** Footer content (buttons, links) */
    children?: unknown
    /** Additional HTML attributes */
    [key: string]: unknown
}

export const ModalFooter: FC<ModalFooterProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <div
            class={cn(
                'flex items-center justify-end gap-2 border-t border-border px-(--modal-footer-padding-x) py-(--modal-footer-padding-y)',
                className,
            )}
            {...props}
        >
            {children}
        </div>
    )
}

/**
 * Modal Close - Button that closes the modal
 *
 * @example
 * ```tsx
 * <ModalClose>Cancel</ModalClose>
 * <ModalClose size="md" variant="primary">Confirm</ModalClose>
 * ```
 */
export interface ModalCloseProps {
    /** Additional CSS class names */
    class?: string
    /** Button size */
    size?: 'sm' | 'md' | 'lg'
    /** Button content */
    children?: unknown
    /** Additional HTML attributes */
    [key: string]: unknown
}

export const ModalClose: FC<ModalCloseProps> = ({
    class: className,
    size = 'sm',
    children,
    ...props
}) => {
    const sizeClasses = {
        sm: 'px-3 py-1.5 text-sm',
        md: 'px-4 py-2 text-base',
        lg: 'px-6 py-3 text-lg',
    }

    return (
        <button
            type='button'
            onclick="this.closest('dialog')?.close()"
            class={cn(
                'inline-flex items-center justify-center rounded-(--radius)',
                'font-medium text-foreground transition-colors',
                'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring)',
                sizeClasses[size],
                className,
            )}
            {...props}
        >
            {children || 'Close'}
        </button>
    )
}

/**
 * Modal Close Icon - X button in header
 */
export interface ModalCloseIconProps {
    class?: string
    [key: string]: unknown
}

export const ModalCloseIcon: FC<ModalCloseIconProps> = ({
    class: className,
    ...props
}) => {
    return (
        <button
            type='button'
            onclick="this.closest('dialog')?.close()"
            class={cn(
                'rounded-(--radius) text-foreground opacity-70 ring-offset-background transition-opacity',
                'hover:opacity-100',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--ring) focus-visible:ring-offset-(--ring-offset)',
                'disabled:pointer-events-none',
                className,
            )}
            {...props}
        >
            <svg
                xmlns='http://www.w3.org/2000/svg'
                width='24'
                height='24'
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
                stroke-width='2'
                stroke-linecap='round'
                stroke-linejoin='round'
            >
                <line x1='18' y1='6' x2='6' y2='18' />
                <line x1='6' y1='6' x2='18' y2='18' />
            </svg>
            <span class='sr-only'>Close</span>
        </button>
    )
}
