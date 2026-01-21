/**
 * @fileoverview Pagination navigation component.
 *
 * A flexible pagination component with Unpoly navigation support.
 *
 * @module @lockness/ui/components/pagination
 */

import type { FC } from '@lockness/core'
import { cn } from '../lib/utils.ts'

/**
 * Chevron Left Icon
 */
const ChevronLeftIcon: FC<{ size?: number }> = ({ size = 16 }) => (
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
        <path d='m15 18-6-6 6-6' />
    </svg>
)

/**
 * Chevron Right Icon
 */
const ChevronRightIcon: FC<{ size?: number }> = ({ size = 16 }) => (
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
        <path d='m9 18 6-6-6-6' />
    </svg>
)

/**
 * Ellipsis Icon
 */
const EllipsisIcon: FC<{ size?: number }> = ({ size = 16 }) => (
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
        <circle cx='12' cy='12' r='1' />
        <circle cx='19' cy='12' r='1' />
        <circle cx='5' cy='12' r='1' />
    </svg>
)

/**
 * Pagination Props Interface
 */
export interface PaginationProps {
    /** Current page number (1-indexed) */
    currentPage: number
    /** Total number of pages */
    totalPages: number
    /** Base URL for pagination links (page number will be appended) */
    baseUrl: string
    /** Query parameter name for page (default: 'page') */
    pageParam?: string
    /** Number of page numbers to show around current page */
    siblingCount?: number
    /** Show first/last page buttons */
    showFirstLast?: boolean
    /** Additional CSS classes */
    class?: string
    /** Unpoly target selector */
    'up-target'?: string
    /** Enable Unpoly preload on hover */
    'up-preload'?: boolean
    /** Unpoly transition */
    'up-transition'?: string
    /** Additional HTML attributes */
    [key: string]: unknown
}

/**
 * PaginationItem Props Interface
 */
export interface PaginationItemProps {
    /** Link href */
    href?: string
    /** Is current page */
    isActive?: boolean
    /** Is disabled */
    disabled?: boolean
    /** Additional CSS classes */
    class?: string
    /** Item content */
    children?: unknown
    /** Unpoly target selector */
    'up-target'?: string
    /** Enable Unpoly preload */
    'up-preload'?: boolean
    /** Unpoly transition */
    'up-transition'?: string
    /** Additional HTML attributes */
    [key: string]: unknown
}

/**
 * Generate page numbers to display with ellipsis
 */
function generatePageNumbers(
    currentPage: number,
    totalPages: number,
    siblingCount: number,
): (number | 'ellipsis')[] {
    const pages: (number | 'ellipsis')[] = []

    // Always show first page
    pages.push(1)

    // Calculate range around current page
    const leftSibling = Math.max(2, currentPage - siblingCount)
    const rightSibling = Math.min(totalPages - 1, currentPage + siblingCount)

    // Add left ellipsis if needed
    if (leftSibling > 2) {
        pages.push('ellipsis')
    }

    // Add pages around current
    for (let i = leftSibling; i <= rightSibling; i++) {
        if (i !== 1 && i !== totalPages) {
            pages.push(i)
        }
    }

    // Add right ellipsis if needed
    if (rightSibling < totalPages - 1) {
        pages.push('ellipsis')
    }

    // Always show last page (if more than 1 page)
    if (totalPages > 1) {
        pages.push(totalPages)
    }

    return pages
}

/**
 * Build URL with page parameter
 */
function buildPageUrl(
    baseUrl: string,
    page: number,
    pageParam: string,
): string {
    const url = new URL(baseUrl, 'http://localhost')
    url.searchParams.set(pageParam, String(page))
    return url.pathname + url.search
}

/**
 * PaginationItem Component
 * Individual pagination button/link
 */
export const PaginationItem: FC<PaginationItemProps> = ({
    href,
    isActive = false,
    disabled = false,
    class: className,
    children,
    'up-target': upTarget,
    'up-preload': upPreload,
    'up-transition': upTransition,
    ...props
}) => {
    const baseClasses = cn(
        'inline-flex items-center justify-center',
        'min-w-9 h-9 px-3',
        'text-sm font-medium',
        'rounded-(--radius)',
        'transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    )

    const stateClasses = cn(
        isActive
            ? 'bg-primary text-primary-foreground'
            : 'hover:bg-accent hover:text-accent-foreground',
        disabled && 'pointer-events-none opacity-50',
    )

    if (disabled || !href) {
        return (
            <span
                class={cn(baseClasses, stateClasses, className)}
                aria-disabled={disabled}
                {...props}
            >
                {children}
            </span>
        )
    }

    return (
        <a
            href={href}
            class={cn(baseClasses, stateClasses, className)}
            aria-current={isActive ? 'page' : undefined}
            up-follow
            up-target={upTarget}
            up-preload={upPreload}
            up-transition={upTransition}
            {...props}
        >
            {children}
        </a>
    )
}

/**
 * PaginationEllipsis Component
 * Ellipsis indicator for skipped pages
 */
export const PaginationEllipsis: FC<{ class?: string }> = ({
    class: className,
}) => (
    <span
        class={cn(
            'inline-flex items-center justify-center min-w-9 h-9',
            'text-muted-foreground',
            className,
        )}
        aria-hidden='true'
    >
        <EllipsisIcon size={16} />
    </span>
)

/**
 * PaginationPrevious Component
 * Previous page navigation button
 */
export const PaginationPrevious: FC<PaginationItemProps> = ({
    class: className,
    children,
    ...props
}) => (
    <PaginationItem class={cn('gap-1 pl-2.5', className)} {...props}>
        <ChevronLeftIcon size={16} />
        <span>{children ?? 'Previous'}</span>
    </PaginationItem>
)

/**
 * PaginationNext Component
 * Next page navigation button
 */
export const PaginationNext: FC<PaginationItemProps> = ({
    class: className,
    children,
    ...props
}) => (
    <PaginationItem class={cn('gap-1 pr-2.5', className)} {...props}>
        <span>{children ?? 'Next'}</span>
        <ChevronRightIcon size={16} />
    </PaginationItem>
)

/**
 * PaginationContent Component
 * Container for pagination items
 */
export const PaginationContent: FC<{ class?: string; children?: unknown }> = ({
    class: className,
    children,
}) => (
    <div class={cn('flex flex-row items-center gap-1', className)}>
        {children}
    </div>
)

/**
 * Pagination Component
 * Complete pagination with Unpoly support
 *
 * @example
 * ```tsx
 * // Basic pagination
 * <Pagination
 *     currentPage={3}
 *     totalPages={10}
 *     baseUrl="/users"
 * />
 *
 * // With Unpoly options
 * <Pagination
 *     currentPage={1}
 *     totalPages={5}
 *     baseUrl="/posts"
 *     up-target="#content"
 *     up-preload
 *     up-transition="cross-fade"
 * />
 *
 * // Custom page parameter
 * <Pagination
 *     currentPage={2}
 *     totalPages={20}
 *     baseUrl="/search?q=test"
 *     pageParam="p"
 *     siblingCount={2}
 * />
 * ```
 */
export const Pagination: FC<PaginationProps> = ({
    currentPage,
    totalPages,
    baseUrl,
    pageParam = 'page',
    siblingCount = 1,
    showFirstLast = false,
    class: className,
    'up-target': upTarget,
    'up-preload': upPreload,
    'up-transition': upTransition,
    ...props
}) => {
    // Don't render if only one page
    if (totalPages <= 1) {
        return null
    }

    const pages = generatePageNumbers(currentPage, totalPages, siblingCount)
    const isFirstPage = currentPage === 1
    const isLastPage = currentPage === totalPages

    // Unpoly props to pass down
    const unpolyProps = {
        'up-target': upTarget,
        'up-preload': upPreload,
        'up-transition': upTransition,
    }

    return (
        <nav
            role='navigation'
            aria-label='Pagination'
            class={cn('flex justify-center', className)}
            {...props}
        >
            <PaginationContent>
                {/* Previous button */}
                <PaginationPrevious
                    href={isFirstPage
                        ? undefined
                        : buildPageUrl(baseUrl, currentPage - 1, pageParam)}
                    disabled={isFirstPage}
                    {...unpolyProps}
                />

                {/* First page (if showFirstLast and not visible) */}
                {showFirstLast && currentPage > siblingCount + 2 && (
                    <>
                        <PaginationItem
                            href={buildPageUrl(baseUrl, 1, pageParam)}
                            {...unpolyProps}
                        >
                            1
                        </PaginationItem>
                        <PaginationEllipsis />
                    </>
                )}

                {/* Page numbers */}
                {pages.map((page, index) => {
                    if (page === 'ellipsis') {
                        return <PaginationEllipsis key={`ellipsis-${index}`} />
                    }

                    return (
                        <PaginationItem
                            key={page}
                            href={buildPageUrl(baseUrl, page, pageParam)}
                            isActive={page === currentPage}
                            {...unpolyProps}
                        >
                            {page}
                        </PaginationItem>
                    )
                })}

                {/* Last page (if showFirstLast and not visible) */}
                {showFirstLast &&
                    currentPage < totalPages - siblingCount - 1 && (
                    <>
                        <PaginationEllipsis />
                        <PaginationItem
                            href={buildPageUrl(baseUrl, totalPages, pageParam)}
                            {...unpolyProps}
                        >
                            {totalPages}
                        </PaginationItem>
                    </>
                )}

                {/* Next button */}
                <PaginationNext
                    href={isLastPage
                        ? undefined
                        : buildPageUrl(baseUrl, currentPage + 1, pageParam)}
                    disabled={isLastPage}
                    {...unpolyProps}
                />
            </PaginationContent>
        </nav>
    )
}

/**
 * SimplePagination Component
 * A minimal prev/next only pagination
 *
 * @example
 * ```tsx
 * <SimplePagination
 *     currentPage={3}
 *     totalPages={10}
 *     baseUrl="/articles"
 *     up-target="#main"
 * />
 * ```
 */
export interface SimplePaginationProps {
    /** Current page number (1-indexed) */
    currentPage: number
    /** Total number of pages */
    totalPages: number
    /** Base URL for pagination links */
    baseUrl: string
    /** Query parameter name for page */
    pageParam?: string
    /** Show page info (e.g., "Page 3 of 10") */
    showPageInfo?: boolean
    /** Additional CSS classes */
    class?: string
    /** Unpoly target selector */
    'up-target'?: string
    /** Enable Unpoly preload */
    'up-preload'?: boolean
    /** Unpoly transition */
    'up-transition'?: string
    /** Additional HTML attributes */
    [key: string]: unknown
}

export const SimplePagination: FC<SimplePaginationProps> = ({
    currentPage,
    totalPages,
    baseUrl,
    pageParam = 'page',
    showPageInfo = true,
    class: className,
    'up-target': upTarget,
    'up-preload': upPreload,
    'up-transition': upTransition,
    ...props
}) => {
    if (totalPages <= 1) {
        return null
    }

    const isFirstPage = currentPage === 1
    const isLastPage = currentPage === totalPages

    const unpolyProps = {
        'up-target': upTarget,
        'up-preload': upPreload,
        'up-transition': upTransition,
    }

    return (
        <nav
            role='navigation'
            aria-label='Pagination'
            class={cn('flex items-center justify-between gap-4', className)}
            {...props}
        >
            <PaginationPrevious
                href={isFirstPage
                    ? undefined
                    : buildPageUrl(baseUrl, currentPage - 1, pageParam)}
                disabled={isFirstPage}
                {...unpolyProps}
            />

            {showPageInfo && (
                <span class='text-sm text-muted-foreground'>
                    Page {currentPage} of {totalPages}
                </span>
            )}

            <PaginationNext
                href={isLastPage
                    ? undefined
                    : buildPageUrl(baseUrl, currentPage + 1, pageParam)}
                disabled={isLastPage}
                {...unpolyProps}
            />
        </nav>
    )
}
