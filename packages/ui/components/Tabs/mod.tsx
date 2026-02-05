/**
 * @fileoverview Tabbed interface component.
 *
 * Uses Unpoly's up-switch directive with hidden radio buttons
 * for zero-JavaScript tab switching.
 *
 * @module @lockness/ui/components/tabs
 */

import type { FC } from '@lockness/hono'
import { cn } from '../../lib/utils.ts'

/**
 * Tabs component props
 */
export interface TabsProps {
    /**
     * Default active tab value
     */
    defaultValue?: string
    /**
     * Unique name for this tab group (used for radio buttons)
     * If not provided, defaults to 'tab'
     */
    name?: string
    /**
     * Orientation of the tabs
     * @default 'horizontal'
     */
    orientation?: 'horizontal' | 'vertical'
    /**
     * Tabs content
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
 * TabsList component props
 */
export interface TabsListProps {
    /**
     * Orientation of the tabs list
     * @default 'horizontal'
     */
    orientation?: 'horizontal' | 'vertical'
    /**
     * Tab triggers
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
 * TabsTrigger component props
 */
export interface TabsTriggerProps {
    /**
     * Tab value (should match TabsContent value)
     */
    value: string
    /**
     * Whether this tab is checked by default
     */
    checked?: boolean
    /**
     * Unique name for radio button group
     * Should match the Tabs component name
     */
    name?: string
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
 * TabsContent component props
 */
export interface TabsContentProps {
    /**
     * Tab value (should match TabsTrigger value)
     */
    value: string
    /**
     * Unique name for this tab group (must match parent Tabs name)
     */
    name?: string
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
 * Tabs Component
 *
 * Tabbed interface using Unpoly's up-switch with hidden radio buttons.
 * Zero custom JavaScript - pure Unpoly declarative approach.
 *
 * Uses radio buttons for state and up-switch/up-show-for for visibility.
 *
 * @example
 * ```tsx
 * <Tabs defaultValue="account">
 *   <TabsList>
 *     <TabsTrigger value="account">Account</TabsTrigger>
 *     <TabsTrigger value="password">Password</TabsTrigger>
 *   </TabsList>
 *   <TabsContent value="account">
 *     <p>Account settings content</p>
 *   </TabsContent>
 *   <TabsContent value="password">
 *     <p>Password settings content</p>
 *   </TabsContent>
 * </Tabs>
 * ```
 */
export const Tabs: FC<TabsProps> = ({
    defaultValue: _defaultValue,
    name = 'tab',
    orientation = 'horizontal',
    class: className,
    children,
    ...props
}) => {
    return (
        <div
            class={cn(
                'w-full',
                orientation === 'vertical' && 'flex gap-4',
                className,
            )}
            up-switch={`.tab-content-${name}`}
            data-tab-name={name}
            data-orientation={orientation}
            {...props}
        >
            {children}
        </div>
    )
}

/**
 * TabsList Component
 */
export const TabsList: FC<TabsListProps> = ({
    orientation = 'horizontal',
    class: className,
    children,
    ...props
}) => {
    return (
        <div
            role='tablist'
            aria-orientation={orientation}
            class={cn(
                'inline-flex items-center justify-center',
                'rounded-(--tabs-border-radius) bg-(--tabs-background)',
                'p-(--tabs-padding) text-(--tabs-foreground)',
                orientation === 'horizontal' && 'h-(--tabs-height) flex-row',
                orientation === 'vertical' && 'h-auto flex-col w-fit',
                className,
            )}
            {...props}
        >
            {children}
        </div>
    )
}

/**
 * TabsTrigger Component
 *
 * Uses hidden radio button + label for Unpoly up-switch.
 * Pure declarative - no JavaScript needed.
 */
export const TabsTrigger: FC<TabsTriggerProps> = ({
    value,
    checked,
    name = 'tab',
    class: className,
    children,
    ...props
}) => {
    return (
        <label
            class={cn(
                'inline-flex items-center justify-center whitespace-nowrap',
                'rounded-(--tabs-trigger-border-radius) px-(--tabs-trigger-padding-x) py-(--tabs-trigger-padding-y) text-[length:--tabs-trigger-font-size] font-(--tabs-trigger-font-weight) cursor-pointer',
                'ring-offset-(--background) transition-all',
                'focus-visible:outline-none focus-visible:ring-2',
                'focus-visible:ring-(--ring) focus-visible:ring-offset-(--ring-offset)',
                'has-checked:bg-(--tabs-trigger-background-active)',
                'has-checked:text-(--tabs-trigger-foreground-active)',
                'has-checked:shadow-sm',
                className,
            )}
            {...props}
        >
            <input
                type='radio'
                name={name}
                value={value}
                checked={checked}
                class='sr-only'
            />
            {children}
        </label>
    )
}

/**
 * TabsContent Component
 *
 * Shown/hidden by Unpoly up-show-for directive.
 * Matches the radio button value.
 */
export const TabsContent: FC<TabsContentProps> = ({
    value,
    name = 'tab',
    class: className,
    children,
    ...props
}) => {
    return (
        <div
            role='tabpanel'
            class={cn(
                `tab-content-${name}`,
                'mt-(--tabs-content-margin-top) ring-offset-(--background)',
                'focus-visible:outline-none focus-visible:ring-2',
                'focus-visible:ring-(--ring) focus-visible:ring-offset-(--ring-offset)',
                className,
            )}
            up-show-for={value}
            {...props}
        >
            {children}
        </div>
    )
}
