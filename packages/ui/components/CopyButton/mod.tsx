/**
 * @fileoverview Copy to clipboard button component.
 *
 * A reusable button to copy text to clipboard with visual feedback.
 *
 * @module @lockness/ui/components/copy-button
 */

import type { FC } from '@lockness/core'
import { cn } from '../../lib/utils.ts'

// Unique ID counter for copy buttons
let copyButtonId = 0

/**
 * Copy Icon Component
 */
const CopyIcon: FC<{ size?: number }> = ({ size = 16 }) => (
    <svg
        xmlns='http://www.w3.org/2000/svg'
        width={size}
        height={size}
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        stroke-width='2'
        stroke-linecap='round'
        stroke-linejoin='round'
    >
        <rect width='14' height='14' x='8' y='8' rx='2' ry='2' />
        <path d='M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' />
    </svg>
)

/**
 * Check Icon Component
 */
const CheckIcon: FC<{ size?: number }> = ({ size = 16 }) => (
    <svg
        xmlns='http://www.w3.org/2000/svg'
        width={size}
        height={size}
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        stroke-width='2'
        stroke-linecap='round'
        stroke-linejoin='round'
    >
        <polyline points='20 6 9 17 4 12' />
    </svg>
)

/**
 * CopyButton Props Interface
 */
export interface CopyButtonProps {
    /** The text value to copy to clipboard */
    value: string
    /** Additional CSS classes */
    class?: string
    /** Size variant */
    size?: 'sm' | 'md' | 'lg'
    /** Button variant */
    variant?: 'ghost' | 'outline'
    /** Show label text */
    showLabel?: boolean
    /** Custom label text (default: "COPY" / "COPIED!") */
    label?: string
    /** Custom copied label text */
    copiedLabel?: string
    /** Icon size */
    iconSize?: number
    /** Additional HTML attributes */
    [key: string]: unknown
}

/**
 * CopyButton Component
 * Copies text to clipboard with visual feedback (icon change + optional label)
 */
export const CopyButton: FC<CopyButtonProps> = ({
    value,
    class: className,
    size = 'md',
    variant = 'ghost',
    showLabel = false,
    label = 'COPY',
    copiedLabel = 'COPIED!',
    iconSize,
    ...props
}) => {
    const id = `copy-btn-${copyButtonId++}`
    const copyIconId = `${id}-copy-icon`
    const checkIconId = `${id}-check-icon`
    const labelId = `${id}-label`

    const sizeClasses = {
        sm: 'h-7 px-2 text-xs',
        md: 'h-8 px-3 text-sm',
        lg: 'h-9 px-4 text-base',
    }

    const iconSizes = {
        sm: 14,
        md: 16,
        lg: 18,
    }

    const variantClasses = {
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        outline:
            'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    }

    const actualIconSize = iconSize ?? iconSizes[size]

    // Escape the value for use in JavaScript string
    const escapedValue = value
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')

    const copyScript = `
        (async function() {
            try {
                await navigator.clipboard.writeText('${escapedValue}');
                document.getElementById('${copyIconId}').classList.add('hidden');
                document.getElementById('${checkIconId}').classList.remove('hidden');
                ${
        showLabel
            ? `document.getElementById('${labelId}').textContent = '${copiedLabel}';`
            : ''
    }
                setTimeout(function() {
                    document.getElementById('${copyIconId}').classList.remove('hidden');
                    document.getElementById('${checkIconId}').classList.add('hidden');
                    ${
        showLabel
            ? `document.getElementById('${labelId}').textContent = '${label}';`
            : ''
    }
                }, 2000);
            } catch (err) {
                console.error('Failed to copy:', err);
            }
        })();
    `.replace(/\s+/g, ' ').trim()

    return (
        <button
            type='button'
            id={id}
            class={cn(
                'inline-flex items-center justify-center gap-1.5 rounded-(--radius)',
                'text-muted-foreground transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                sizeClasses[size],
                variantClasses[variant],
                !showLabel && 'px-0 w-8',
                size === 'sm' && !showLabel && 'w-7',
                size === 'lg' && !showLabel && 'w-9',
                className,
            )}
            title='Copy to clipboard'
            onclick={copyScript}
            {...props}
        >
            <span id={copyIconId}>
                <CopyIcon size={actualIconSize} />
            </span>
            <span id={checkIconId} class='hidden text-green-500'>
                <CheckIcon size={actualIconSize} />
            </span>
            {showLabel && (
                <span id={labelId} class='font-medium'>
                    {label}
                </span>
            )}
        </button>
    )
}

/**
 * CopyLink Component
 * A variant that copies a URL (current page URL + path)
 */
export interface CopyLinkProps {
    /** The path to append to the current origin */
    path: string
    /** Additional CSS classes */
    class?: string
    /** Size variant */
    size?: 'sm' | 'md' | 'lg'
    /** Button variant */
    variant?: 'ghost' | 'outline'
    /** Show label text */
    showLabel?: boolean
    /** Custom label text (default: "COPY" / "COPIED!") */
    label?: string
    /** Custom copied label text */
    copiedLabel?: string
    /** Icon size */
    iconSize?: number
    /** Additional HTML attributes */
    [key: string]: unknown
}

export const CopyLink: FC<CopyLinkProps> = ({
    path,
    class: className,
    size = 'md',
    variant = 'outline',
    showLabel = true,
    label = 'COPY',
    copiedLabel = 'COPIED!',
    iconSize,
    ...restProps
}) => {
    const id = `copy-link-${copyButtonId++}`
    const copyIconId = `${id}-copy-icon`
    const checkIconId = `${id}-check-icon`
    const labelId = `${id}-label`

    const sizeClasses = {
        sm: 'h-7 px-2 text-xs',
        md: 'h-8 px-3 text-sm',
        lg: 'h-9 px-4 text-base',
    }

    const iconSizes = {
        sm: 14,
        md: 16,
        lg: 18,
    }

    const variantClasses = {
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        outline:
            'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    }

    const actualIconSize = iconSize ?? iconSizes[size]

    // Script that builds URL from window.location.origin
    const copyScript = `
        (async function() {
            try {
                const url = window.location.origin + '${path}';
                await navigator.clipboard.writeText(url);
                document.getElementById('${copyIconId}').classList.add('hidden');
                document.getElementById('${checkIconId}').classList.remove('hidden');
                ${
        showLabel
            ? `document.getElementById('${labelId}').textContent = '${copiedLabel}';`
            : ''
    }
                setTimeout(function() {
                    document.getElementById('${copyIconId}').classList.remove('hidden');
                    document.getElementById('${checkIconId}').classList.add('hidden');
                    ${
        showLabel
            ? `document.getElementById('${labelId}').textContent = '${label}';`
            : ''
    }
                }, 2000);
            } catch (err) {
                console.error('Failed to copy:', err);
            }
        })();
    `.replace(/\s+/g, ' ').trim()

    return (
        <button
            type='button'
            id={id}
            class={cn(
                'inline-flex items-center justify-center gap-1.5 rounded-(--radius)',
                'text-muted-foreground transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                sizeClasses[size],
                variantClasses[variant],
                !showLabel && 'px-0 w-8',
                size === 'sm' && !showLabel && 'w-7',
                size === 'lg' && !showLabel && 'w-9',
                className,
            )}
            title='Copy link to clipboard'
            onclick={copyScript}
            {...restProps}
        >
            <span id={copyIconId}>
                <CopyIcon size={actualIconSize} />
            </span>
            <span id={checkIconId} class='hidden text-green-500'>
                <CheckIcon size={actualIconSize} />
            </span>
            {showLabel && (
                <span id={labelId} class='font-medium'>
                    {label}
                </span>
            )}
        </button>
    )
}
