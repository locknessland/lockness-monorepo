/**
 * @fileoverview Accordion component for collapsible content sections.
 *
 * Uses native HTML details/summary elements for accessibility
 * and zero-JavaScript functionality.
 *
 * @module @lockness/ui/components/accordion
 */

import type { FC } from '@lockness/core'
import { cn } from '../../lib/utils.ts'

/**
 * Accordion component props
 */
export interface AccordionProps {
    /**
     * Accordion items
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
 * AccordionItem component props
 */
export interface AccordionItemProps {
    /**
     * Unique value for this accordion item
     */
    value: string
    /**
     * Item content
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
 * AccordionTrigger component props
 */
export interface AccordionTriggerProps {
    /**
     * Trigger content
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
 * AccordionContent component props
 */
export interface AccordionContentProps {
    /**
     * Content
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
 * Accordion Component
 *
 * Vertically stacked set of collapsible sections.
 * Uses HTML details/summary for native collapsible behavior.
 *
 * @example
 * ```tsx
 * <Accordion>
 *   <AccordionItem value="item-1">
 *     <AccordionTrigger>Is it accessible?</AccordionTrigger>
 *     <AccordionContent>
 *       Yes. It adheres to the WAI-ARIA design pattern.
 *     </AccordionContent>
 *   </AccordionItem>
 *   <AccordionItem value="item-2">
 *     <AccordionTrigger>Is it styled?</AccordionTrigger>
 *     <AccordionContent>
 *       Yes. It comes with default styles using CSS variables.
 *     </AccordionContent>
 *   </AccordionItem>
 * </Accordion>
 * ```
 */
export const Accordion: FC<AccordionProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <div class={cn('w-full', className)} {...props}>
            {children}
        </div>
    )
}

/**
 * AccordionItem Component
 */
export const AccordionItem: FC<AccordionItemProps> = ({
    value,
    class: className,
    children,
    ...props
}) => {
    return (
        <details
            data-value={value}
            class={cn('border-b border-(--border)', className)}
            {...props}
        >
            {children}
        </details>
    )
}

/**
 * AccordionTrigger Component
 */
export const AccordionTrigger: FC<AccordionTriggerProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <summary
            class={cn(
                'flex cursor-pointer items-center justify-between',
                'py-4 font-medium transition-all',
                'hover:underline',
                '[&::-webkit-details-marker]:hidden',
                className,
            )}
            {...props}
        >
            {children}
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
                class='h-4 w-4 shrink-0 transition-transform duration-200 group-open:rotate-180'
            >
                <polyline points='6 9 12 15 18 9'></polyline>
            </svg>
        </summary>
    )
}

/**
 * AccordionContent Component
 */
export const AccordionContent: FC<AccordionContentProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <div
            class={cn(
                'overflow-hidden text-sm transition-all',
                'pb-4 pt-0',
                className,
            )}
            {...props}
        >
            {children}
        </div>
    )
}
