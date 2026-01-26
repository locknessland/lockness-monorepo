/**
 * @fileoverview Props table component for documentation
 *
 * Displays component props in a clean table format using the Table component.
 * Designed for use in component documentation pages to show prop interfaces.
 *
 * @module @lockness/ui/components/props-table
 */

import type { FC } from '@lockness/hono'
import { cn } from '../../lib/utils.ts'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '../Table/mod.tsx'
import { Badge } from '../Badge/mod.tsx'
import { Separator } from '../Separator/mod.tsx'

/**
 * Definition of a single prop for documentation purposes.
 *
 * @example
 * ```ts
 * const prop: PropDefinition = {
 *   name: 'variant',
 *   type: 'primary | secondary | destructive',
 *   default: 'primary',
 *   description: 'Visual style variant',
 *   required: false
 * }
 * ```
 */
export interface PropDefinition {
    /**
     * The name of the prop (e.g., 'variant', 'size', 'disabled')
     */
    name: string

    /**
     * TypeScript type annotation without surrounding quotes
     * @example 'string', 'boolean', 'primary | secondary', 'ReactNode'
     */
    type: string

    /**
     * Default value without surrounding quotes, if any
     * @example 'primary', 'false', 'undefined'
     */
    default?: string

    /**
     * Human-readable description of what the prop does
     */
    description: string

    /**
     * Whether the prop is required (shows a red asterisk indicator)
     * @default false
     */
    required?: boolean
}

/**
 * Props for the PropsTable component.
 */
export interface PropsTableProps {
    /**
     * Array of prop definitions to display in the table
     */
    props: readonly PropDefinition[]

    /**
     * Optional title displayed above the table with a separator
     */
    title?: string

    /**
     * Additional CSS classes to apply to the container
     */
    class?: string
}

/**
 * PropsTable Component
 *
 * Renders a formatted table displaying component prop definitions for documentation.
 * Uses the Table component for structure, Badge for default values, and Separator
 * for visual hierarchy when a title is provided.
 *
 * Features:
 * - Hoverable rows for better readability
 * - Monospace font for prop names and types
 * - Badge highlighting for default values
 * - Red asterisk indicator for required props
 * - Optional title with separator
 *
 * @param props - Component props
 * @param props.props - Array of prop definitions to display
 * @param props.title - Optional title displayed above the table
 * @param props.class - Additional CSS classes
 * @returns JSX element representing the props table
 *
 * @example Basic usage
 * ```tsx
 * <PropsTable
 *   props={[
 *     { name: 'variant', type: 'primary | secondary', default: 'primary', description: 'Button style' },
 *     { name: 'size', type: 'sm | md | lg', default: 'md', description: 'Button size' },
 *     { name: 'onClick', type: '() => void', description: 'Click handler', required: true },
 *   ]}
 * />
 * ```
 *
 * @example With title
 * ```tsx
 * <PropsTable
 *   title="Button Props"
 *   props={buttonProps}
 * />
 * ```
 */
export const PropsTable: FC<PropsTableProps> = ({
    props,
    title,
    class: className,
}) => {
    return (
        <div class={cn('space-y-3', className)}>
            {title && (
                <>
                    <h3 class='font-pixel text-xs text-foreground'>
                        {title}
                    </h3>
                    <Separator />
                </>
            )}
            <Table hoverable bordered>
                <TableHeader>
                    <TableRow>
                        <TableHead>Prop</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Required</TableHead>
                        <TableHead>Default</TableHead>
                        <TableHead>Description</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {props.map((prop) => (
                        <TableRow>
                            <TableCell class='font-mono text-xs'>
                                {prop.name}
                            </TableCell>
                            <TableCell class='font-mono text-xs text-muted-foreground'>
                                {prop.type}
                            </TableCell>
                            <TableCell class='text-muted-foreground'>
                                <Badge
                                    variant={prop.required
                                        ? 'default'
                                        : 'secondary'}
                                >
                                    {prop.required ? 'true' : 'false'}
                                </Badge>
                            </TableCell>
                            <TableCell class='text-muted-foreground'>
                                {prop.default
                                    ? (
                                        <Badge variant='secondary'>
                                            {prop.default}
                                        </Badge>
                                    )
                                    : '-'}
                            </TableCell>
                            <TableCell class='text-muted-foreground'>
                                {prop.description}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    )
}
