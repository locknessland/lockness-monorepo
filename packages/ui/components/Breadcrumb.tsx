import type { FC } from '@lockness/core'
import { cn } from '../lib/utils.ts'

/**
 * Breadcrumb component props
 */
export interface BreadcrumbProps {
    /**
     * Breadcrumb items
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
 * BreadcrumbList component props
 */
export interface BreadcrumbListProps {
    /**
     * List items
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
 * BreadcrumbItem component props
 */
export interface BreadcrumbItemProps {
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
 * BreadcrumbLink component props
 */
export interface BreadcrumbLinkProps {
    /**
     * Link href
     */
    href?: string
    /**
     * Link content
     */
    children?: unknown
    /**
     * Additional CSS class names
     */
    class?: string
    /**
     * Additional HTML attributes (Unpoly directives, etc.)
     */
    [key: string]: unknown
}

/**
 * BreadcrumbSeparator component props
 */
export interface BreadcrumbSeparatorProps {
    /**
     * Separator content (default: '/')
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
 * BreadcrumbPage component props
 */
export interface BreadcrumbPageProps {
    /**
     * Current page content
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
 * Breadcrumb Component
 *
 * Breadcrumb navigation component for showing hierarchical navigation.
 *
 * @example
 * ```tsx
 * <Breadcrumb>
 *   <BreadcrumbList>
 *     <BreadcrumbItem>
 *       <BreadcrumbLink href="/">Home</BreadcrumbLink>
 *     </BreadcrumbItem>
 *     <BreadcrumbSeparator />
 *     <BreadcrumbItem>
 *       <BreadcrumbLink href="/products">Products</BreadcrumbLink>
 *     </BreadcrumbItem>
 *     <BreadcrumbSeparator />
 *     <BreadcrumbItem>
 *       <BreadcrumbPage>Current Page</BreadcrumbPage>
 *     </BreadcrumbItem>
 *   </BreadcrumbList>
 * </Breadcrumb>
 * ```
 */
export const Breadcrumb: FC<BreadcrumbProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <nav
            aria-label='breadcrumb'
            class={cn('text-sm', className)}
            {...props}
        >
            {children}
        </nav>
    )
}

/**
 * BreadcrumbList Component
 */
export const BreadcrumbList: FC<BreadcrumbListProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <ol
            class={cn(
                'flex flex-wrap items-center gap-1.5 break-words',
                'text-(--muted-foreground)',
                className,
            )}
            {...props}
        >
            {children}
        </ol>
    )
}

/**
 * BreadcrumbItem Component
 */
export const BreadcrumbItem: FC<BreadcrumbItemProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <li
            class={cn('inline-flex items-center gap-1.5', className)}
            {...props}
        >
            {children}
        </li>
    )
}

/**
 * BreadcrumbLink Component
 */
export const BreadcrumbLink: FC<BreadcrumbLinkProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <a
            class={cn(
                'transition-colors hover:text-(--foreground)',
                className,
            )}
            {...props}
        >
            {children}
        </a>
    )
}

/**
 * BreadcrumbSeparator Component
 */
export const BreadcrumbSeparator: FC<BreadcrumbSeparatorProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <li
            role='presentation'
            aria-hidden='true'
            class={cn('[&>svg]:size-3.5', className)}
            {...props}
        >
            {children || '/'}
        </li>
    )
}

/**
 * BreadcrumbPage Component
 */
export const BreadcrumbPage: FC<BreadcrumbPageProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <span
            role='link'
            aria-disabled='true'
            aria-current='page'
            class={cn('font-normal text-(--foreground)', className)}
            {...props}
        >
            {children}
        </span>
    )
}
