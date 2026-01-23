/**
 * @fileoverview Table component for displaying tabular data.
 *
 * A responsive table component inspired by shadcn/ui with support for
 * sorting, striping, hover effects, and borders.
 *
 * @module @lockness/ui/components/table
 *
 * @example Basic table
 * ```tsx
 * <Table>
 *   <TableCaption>A list of your recent invoices.</TableCaption>
 *   <TableHeader>
 *     <TableRow>
 *       <TableHead class="w-[100px]">Invoice</TableHead>
 *       <TableHead>Status</TableHead>
 *       <TableHead>Method</TableHead>
 *       <TableHead class="text-right">Amount</TableHead>
 *     </TableRow>
 *   </TableHeader>
 *   <TableBody>
 *     <TableRow>
 *       <TableCell class="font-medium">INV001</TableCell>
 *       <TableCell>Paid</TableCell>
 *       <TableCell>Credit Card</TableCell>
 *       <TableCell class="text-right">$250.00</TableCell>
 *     </TableRow>
 *   </TableBody>
 *   <TableFooter>
 *     <TableRow>
 *       <TableCell colSpan={3}>Total</TableCell>
 *       <TableCell class="text-right">$2,500.00</TableCell>
 *     </TableRow>
 *   </TableFooter>
 * </Table>
 * ```
 *
 * @example With options
 * ```tsx
 * <Table striped hoverable bordered>
 *   ...
 * </Table>
 * ```
 */

import type { FC } from '@lockness/core'
import { cn } from '../../lib/utils.ts'

/**
 * Table Props
 */
export interface TableProps {
    /** Additional CSS classes */
    class?: string
    /** Table content */
    children?: unknown
    /** Add zebra-striping to table rows */
    striped?: boolean
    /** Add hover effect to table rows */
    hoverable?: boolean
    /** Add borders on all sides of the table and cells */
    bordered?: boolean
    /** Additional HTML attributes */
    [key: string]: unknown
}

/**
 * Table Component
 * Wrapper for the table element with responsive scrolling
 */
export const Table: FC<TableProps> = ({
    class: className,
    children,
    striped = false,
    hoverable = false,
    bordered = false,
    ...props
}) => {
    return (
        <div
            class={cn(
                'relative w-full overflow-auto',
                bordered &&
                    'border border-(--table-border-color) rounded-(--table-border-radius)',
            )}
        >
            <table
                class={cn(
                    'w-full caption-bottom text-sm',
                    className,
                )}
                data-striped={striped ? 'true' : undefined}
                data-hoverable={hoverable ? 'true' : undefined}
                data-bordered={bordered ? 'true' : undefined}
                {...props}
            >
                {children}
            </table>
        </div>
    )
}

/**
 * TableHeader Props
 */
export interface TableHeaderProps {
    /** Additional CSS classes */
    class?: string
    /** Header rows */
    children?: unknown
    /** Additional HTML attributes */
    [key: string]: unknown
}

/**
 * TableHeader Component
 * Container for table header rows
 */
export const TableHeader: FC<TableHeaderProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <thead
            class={cn(
                '[&_tr]:border-b',
                // Bordered cells (when parent table has data-bordered)
                '[[data-bordered=true]_&_th]:border [[data-bordered=true]_&_th]:border-border',
                className,
            )}
            {...props}
        >
            {children}
        </thead>
    )
}

/**
 * TableBody Props
 */
export interface TableBodyProps {
    /** Additional CSS classes */
    class?: string
    /** Body rows */
    children?: unknown
    /** Additional HTML attributes */
    [key: string]: unknown
}

/**
 * TableBody Component
 * Container for table body rows
 */
export const TableBody: FC<TableBodyProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <tbody
            class={cn(
                '[&_tr:last-child]:border-0',
                // Striped rows (when parent table has data-striped)
                '[[data-striped=true]_&_tr:nth-child(odd)]:bg-muted/50',
                // Hoverable rows (when parent table has data-hoverable)
                '[[data-hoverable=true]_&_tr]:hover:bg-muted',
                // Bordered cells (when parent table has data-bordered)
                '[[data-bordered=true]_&_td]:border [[data-bordered=true]_&_td]:border-border',
                className,
            )}
            {...props}
        >
            {children}
        </tbody>
    )
}

/**
 * TableFooter Props
 */
export interface TableFooterProps {
    /** Additional CSS classes */
    class?: string
    /** Footer rows */
    children?: unknown
    /** Additional HTML attributes */
    [key: string]: unknown
}

/**
 * TableFooter Component
 * Container for table footer rows
 */
export const TableFooter: FC<TableFooterProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <tfoot
            class={cn(
                'border-t bg-muted/50 font-medium [&>tr]:last:border-b-0',
                className,
            )}
            {...props}
        >
            {children}
        </tfoot>
    )
}

/**
 * TableRow Props
 */
export interface TableRowProps {
    /** Additional CSS classes */
    class?: string
    /** Row cells */
    children?: unknown
    /** Whether the row is selected */
    selected?: boolean
    /** Make row clickable with href */
    href?: string
    /** Additional HTML attributes */
    [key: string]: unknown
}

/**
 * TableRow Component
 * A table row with hover and selection states
 */
export const TableRow: FC<TableRowProps> = ({
    class: className,
    children,
    selected = false,
    href,
    ...props
}) => {
    const classes = cn(
        'border-b border-border transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted',
        selected && 'bg-muted',
        href && 'cursor-pointer',
        className,
    )

    // If href is provided, make the row clickable with Unpoly
    if (href) {
        return (
            <tr
                class={classes}
                data-state={selected ? 'selected' : undefined}
                onclick={`window.location.href='${href}'`}
                up-follow
                up-target='body'
                {...props}
            >
                {children}
            </tr>
        )
    }

    return (
        <tr
            class={classes}
            data-state={selected ? 'selected' : undefined}
            {...props}
        >
            {children}
        </tr>
    )
}

/**
 * TableHead Props
 */
export interface TableHeadProps {
    /** Additional CSS classes */
    class?: string
    /** Header content */
    children?: unknown
    /** Enable sorting (adds visual indicator) */
    sortable?: boolean
    /** Current sort direction */
    sortDirection?: 'asc' | 'desc' | null
    /** Sort URL for Unpoly navigation */
    sortHref?: string
    /** Additional HTML attributes */
    [key: string]: unknown
}

/**
 * TableHead Component
 * A table header cell with optional sorting
 */
export const TableHead: FC<TableHeadProps> = ({
    class: className,
    children,
    sortable = false,
    sortDirection = null,
    sortHref,
    ...props
}) => {
    const baseClasses = cn(
        'h-10 px-4 text-left align-middle font-medium',
        'bg-(--table-header-background) text-(--table-header-foreground)',
        '[&:has([role=checkbox])]:pr-0 *:[[role=checkbox]]:translate-y-0.5',
        sortable && 'cursor-pointer select-none hover:text-foreground',
        className,
    )

    // Sortable header with Unpoly navigation
    if (sortable && sortHref) {
        return (
            <th class={baseClasses} {...props}>
                <a
                    href={sortHref}
                    up-follow
                    up-target='body'
                    class='inline-flex items-center gap-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-(--radius)'
                >
                    {children}
                    <SortIcon direction={sortDirection} />
                </a>
            </th>
        )
    }

    // Sortable header without href (for JS-based sorting)
    if (sortable) {
        return (
            <th class={baseClasses} {...props}>
                <span class='inline-flex items-center gap-1'>
                    {children}
                    <SortIcon direction={sortDirection} />
                </span>
            </th>
        )
    }

    return (
        <th class={baseClasses} {...props}>
            {children}
        </th>
    )
}

/**
 * SortIcon Component
 * Shows sort direction indicator
 */
const SortIcon: FC<{ direction: 'asc' | 'desc' | null }> = ({ direction }) => {
    if (direction === 'asc') {
        return (
            <svg
                class='h-4 w-4'
                xmlns='http://www.w3.org/2000/svg'
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
                stroke-width='2'
                stroke-linecap='round'
                stroke-linejoin='round'
            >
                <path d='m18 15-6-6-6 6' />
            </svg>
        )
    }

    if (direction === 'desc') {
        return (
            <svg
                class='h-4 w-4'
                xmlns='http://www.w3.org/2000/svg'
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
                stroke-width='2'
                stroke-linecap='round'
                stroke-linejoin='round'
            >
                <path d='m6 9 6 6 6-6' />
            </svg>
        )
    }

    // Default: show both arrows (unsorted)
    return (
        <svg
            class='h-4 w-4 opacity-50'
            xmlns='http://www.w3.org/2000/svg'
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            stroke-width='2'
            stroke-linecap='round'
            stroke-linejoin='round'
        >
            <path d='m7 15 5 5 5-5' />
            <path d='m7 9 5-5 5 5' />
        </svg>
    )
}

/**
 * TableCell Props
 */
export interface TableCellProps {
    /** Additional CSS classes */
    class?: string
    /** Cell content */
    children?: unknown
    /** Column span */
    colSpan?: number
    /** Row span */
    rowSpan?: number
    /** Additional HTML attributes */
    [key: string]: unknown
}

/**
 * TableCell Component
 * A table data cell
 */
export const TableCell: FC<TableCellProps> = ({
    class: className,
    children,
    colSpan,
    rowSpan,
    ...props
}) => {
    return (
        <td
            class={cn(
                'p-4 align-middle [&:has([role=checkbox])]:pr-0 *:[[role=checkbox]]:translate-y-0.5',
                className,
            )}
            colSpan={colSpan}
            rowSpan={rowSpan}
            {...props}
        >
            {children}
        </td>
    )
}

/**
 * TableCaption Props
 */
export interface TableCaptionProps {
    /** Additional CSS classes */
    class?: string
    /** Caption content */
    children?: unknown
    /** Additional HTML attributes */
    [key: string]: unknown
}

/**
 * TableCaption Component
 * A caption for the table
 */
export const TableCaption: FC<TableCaptionProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <caption
            class={cn('mt-4 text-sm text-muted-foreground', className)}
            {...props}
        >
            {children}
        </caption>
    )
}

/**
 * TableEmpty Props
 */
export interface TableEmptyProps {
    /** Additional CSS classes */
    class?: string
    /** Empty state message */
    children?: unknown
    /** Number of columns to span */
    colSpan?: number
    /** Additional HTML attributes */
    [key: string]: unknown
}

/**
 * TableEmpty Component
 * Empty state row for when there's no data
 */
export const TableEmpty: FC<TableEmptyProps> = ({
    class: className,
    children = 'No results.',
    colSpan = 1,
    ...props
}) => {
    return (
        <TableRow class={className} {...props}>
            <TableCell
                colSpan={colSpan}
                class='h-24 text-center text-muted-foreground'
            >
                {children}
            </TableCell>
        </TableRow>
    )
}
