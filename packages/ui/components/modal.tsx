import type { FC } from '@lockness/core'
import { cn } from '../lib/utils.ts'

/**
 * Modal Dialog Component
 * Pure CSS implementation using <dialog> element and Unpoly layers
 */

/**
 * Modal Root - Uses HTML dialog element
 */
export interface ModalProps {
    id: string
    class?: string
    children?: any
    [key: string]: any
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
 */
export interface ModalTriggerProps {
    targetId?: string
    href?: string
    class?: string
    variant?: 'primary' | 'secondary' | 'outline' | 'ghost'
    children?: any
    [key: string]: any
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
    class?: string
    children?: any
    [key: string]: any
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
 * Modal Header
 */
export interface ModalHeaderProps {
    class?: string
    children?: any
    [key: string]: any
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
 * Modal Title
 */
export interface ModalTitleProps {
    class?: string
    children?: any
    [key: string]: any
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
 * Modal Description
 */
export interface ModalDescriptionProps {
    class?: string
    children?: any
    [key: string]: any
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
 * Modal Body
 */
export interface ModalBodyProps {
    class?: string
    children?: any
    [key: string]: any
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
 * Modal Footer
 */
export interface ModalFooterProps {
    class?: string
    children?: any
    [key: string]: any
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
 * Modal Close - Closes the modal
 */
export interface ModalCloseProps {
    class?: string
    size?: 'sm' | 'md' | 'lg'
    children?: any
    [key: string]: any
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
    [key: string]: any
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
