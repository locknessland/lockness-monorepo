/**
 * @fileoverview Hierarchical tree view component.
 *
 * Collapsible tree structure with support for icons, selection,
 * and both declarative and data-driven rendering.
 *
 * @module @lockness/ui/components/tree-view
 */

import type { FC } from '@lockness/hono'
import { cn } from '../../lib/utils.ts'

/**
 * TreeView display variant
 */
export type TreeViewVariant = 'interactive' | 'text'

/**
 * TreeView component props
 */
export interface TreeViewProps {
    /**
     * Tree items (can be TreeViewItem components or data-driven)
     */
    children?: unknown
    /**
     * Data-driven tree structure (alternative to children)
     */
    items?: TreeViewDataItem[]
    /**
     * Display variant:
     * - 'interactive': Collapsible tree with keyboard navigation (default)
     * - 'text': Static ASCII tree representation (like terminal output)
     */
    variant?: TreeViewVariant
    /**
     * Root label for text variant (displayed at top of tree)
     */
    rootLabel?: string
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
 * TreeViewItem component props
 */
export interface TreeViewItemProps {
    /**
     * Item label text
     */
    label: string
    /**
     * Unique identifier for this item
     */
    id?: string
    /**
     * Whether item has children (is a branch vs leaf)
     */
    hasChildren?: boolean
    /**
     * Whether item is initially expanded
     */
    defaultExpanded?: boolean
    /**
     * Whether item is selectable
     */
    selectable?: boolean
    /**
     * Whether item is initially selected
     */
    defaultSelected?: boolean
    /**
     * Optional icon element
     */
    icon?: unknown
    /**
     * Nested tree items
     */
    children?: unknown
    /**
     * Additional CSS class names
     */
    class?: string
    /**
     * Click handler for item selection
     */
    onClick?: (event: Event) => void
    /**
     * Additional HTML attributes
     */
    [key: string]: unknown
}

/**
 * TreeViewTrigger component props
 */
export interface TreeViewTriggerProps {
    /**
     * Whether the trigger is expanded
     */
    expanded?: boolean
    /**
     * Custom trigger icon
     */
    icon?: unknown
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
 * TreeViewIcon component props
 */
export interface TreeViewIconProps {
    /**
     * Icon content
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
 * TreeViewLabel component props
 */
export interface TreeViewLabelProps {
    /**
     * Label text
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
 * TreeViewContent component props
 */
export interface TreeViewContentProps {
    /**
     * Content (nested tree items)
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
 * Data structure for data-driven tree
 */
export interface TreeViewDataItem {
    /**
     * Unique identifier
     */
    id: string
    /**
     * Display label
     */
    label: string
    /**
     * Optional icon element
     */
    icon?: unknown
    /**
     * Nested children items
     */
    children?: TreeViewDataItem[]
    /**
     * Whether item is initially expanded
     */
    defaultExpanded?: boolean
    /**
     * Whether item is selectable
     */
    selectable?: boolean
    /**
     * Whether item is initially selected
     */
    defaultSelected?: boolean
}

/**
 * Recursively render tree items from data structure
 */
const renderTreeItems = (items: TreeViewDataItem[]): unknown => {
    return items.map((item) => (
        <TreeViewItem
            key={item.id}
            id={item.id}
            label={item.label}
            icon={item.icon}
            hasChildren={!!item.children?.length}
            defaultExpanded={item.defaultExpanded}
            selectable={item.selectable}
            defaultSelected={item.defaultSelected}
        >
            {item.children && renderTreeItems(item.children)}
        </TreeViewItem>
    ))
}

/**
 * Render ASCII tree line with proper connectors
 */
const renderTextTreeLine = (
    label: string,
    prefix: string,
    isLast: boolean,
): string => {
    const connector = isLast ? '└── ' : '├── '
    return `${prefix}${connector}${label}`
}

/**
 * Recursively render tree items as ASCII text
 */
const renderTextTree = (
    items: TreeViewDataItem[],
    prefix: string = '',
): string[] => {
    const lines: string[] = []

    items.forEach((item, index) => {
        const isLast = index === items.length - 1
        lines.push(renderTextTreeLine(item.label, prefix, isLast))

        if (item.children && item.children.length > 0) {
            const childPrefix = prefix + (isLast ? '    ' : '│   ')
            lines.push(...renderTextTree(item.children, childPrefix))
        }
    })

    return lines
}

/**
 * TreeView Component
 *
 * A hierarchical tree structure for displaying nested data.
 * Supports both declarative (JSX children) and data-driven (items prop) APIs.
 * Fully accessible with ARIA attributes and keyboard navigation.
 *
 * @example Declarative API
 * ```tsx
 * <TreeView>
 *   <TreeViewItem label="Parent" hasChildren defaultExpanded>
 *     <TreeViewItem label="Child 1" />
 *     <TreeViewItem label="Child 2" />
 *   </TreeViewItem>
 * </TreeView>
 * ```
 *
 * @example Data-driven API
 * ```tsx
 * const data = [
 *   { id: '1', label: 'Parent', children: [
 *     { id: '1-1', label: 'Child 1' },
 *     { id: '1-2', label: 'Child 2' }
 *   ]}
 * ]
 * <TreeView items={data} />
 * ```
 *
 * @example Text variant (ASCII tree)
 * ```tsx
 * const data = [
 *   { id: '1', label: 'src/', children: [
 *     { id: '1-1', label: 'index.ts' },
 *     { id: '1-2', label: 'utils.ts' }
 *   ]}
 * ]
 * <TreeView items={data} variant="text" rootLabel="my-project/" />
 * ```
 */
export const TreeView: FC<TreeViewProps> = ({
    class: className,
    children,
    items,
    variant = 'interactive',
    rootLabel,
    ...props
}) => {
    // Text variant: render ASCII tree
    if (variant === 'text' && items) {
        const lines = renderTextTree(items)
        const content = rootLabel
            ? [rootLabel, ...lines].join('\n')
            : lines.join('\n')

        return (
            <pre
                class={cn(
                    'font-mono text-sm',
                    'bg-muted/50 rounded-lg p-4',
                    'overflow-x-auto',
                    className,
                )}
                {...props}
            >
                <code>{content}</code>
            </pre>
        )
    }

    // Interactive variant: collapsible tree
    return (
        <>
            <ul
                role='tree'
                class={cn(
                    'w-full',
                    'text-sm',
                    className,
                )}
                {...props}
            >
                {items ? renderTreeItems(items) : children}
            </ul>
            <TreeViewScript />
        </>
    )
}

/**
 * TreeViewItem Component
 *
 * Individual tree node that can be a branch (with children) or leaf.
 * Supports expand/collapse, selection, and custom icons.
 */
export const TreeViewItem: FC<TreeViewItemProps> = ({
    label,
    id,
    hasChildren = false,
    defaultExpanded = false,
    selectable = false,
    defaultSelected = false,
    icon,
    class: className,
    children,
    onClick,
    ...props
}) => {
    const itemId = id || `tree-item-${Math.random().toString(36).slice(2, 11)}`
    const contentId = `${itemId}-content`

    return (
        <li
            role='treeitem'
            aria-expanded={hasChildren ? defaultExpanded : undefined}
            aria-selected={selectable ? defaultSelected : undefined}
            data-tree-item
            data-has-children={hasChildren}
            data-selectable={selectable}
            class={cn(
                'list-none',
                className,
            )}
            {...props}
        >
            <div
                tabindex={0}
                class={cn(
                    'relative inline-flex items-center gap-1 py-1 px-2 rounded',
                    'hover:bg-accent hover:text-accent-foreground',
                    'transition-colors duration-150',
                    'cursor-pointer',
                    'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-inset',
                    selectable &&
                        'aria-selected:bg-primary/10 aria-selected:text-primary',
                )}
                onClick={onClick}
                data-tree-item-wrapper
            >
                {hasChildren && <TreeViewTrigger />}
                {!hasChildren && (
                    <span class='inline-block w-4 h-4' aria-hidden='true' />
                )}
                {icon && <TreeViewIcon>{icon}</TreeViewIcon>}
                <TreeViewLabel>{label}</TreeViewLabel>
            </div>
            {hasChildren && children && (
                <TreeViewContent
                    id={contentId}
                    class={defaultExpanded ? '' : 'hidden'}
                >
                    <ul
                        role='group'
                        class='ml-4 border-l border-(--border) pl-2'
                    >
                        {children}
                    </ul>
                </TreeViewContent>
            )}
        </li>
    )
}

/**
 * TreeViewTrigger Component
 *
 * Expand/collapse button for tree branches.
 */
export const TreeViewTrigger: FC<TreeViewTriggerProps> = ({
    class: className,
    icon,
    ...props
}) => {
    return (
        <button
            type='button'
            class={cn(
                'inline-flex items-center justify-center',
                'w-4 h-4 rounded',
                'transition-transform duration-200',
                'text-muted-foreground hover:text-foreground',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                '[&[aria-expanded=true]>svg]:rotate-90',
                className,
            )}
            aria-label='Toggle'
            data-tree-trigger
            {...props}
        >
            {icon || (
                <svg
                    xmlns='http://www.w3.org/2000/svg'
                    width='16'
                    height='16'
                    viewBox='0 0 24 24'
                    fill='none'
                    stroke='currentColor'
                    stroke-width='2'
                    stroke-linecap='round'
                    stroke-linejoin='round'
                >
                    <polyline points='9 18 15 12 9 6' />
                </svg>
            )}
        </button>
    )
}

/**
 * TreeViewIcon Component
 *
 * Icon displayed before the item label.
 */
export const TreeViewIcon: FC<TreeViewIconProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <span
            class={cn(
                'inline-flex items-center justify-center',
                'w-4 h-4',
                'text-muted-foreground',
                className,
            )}
            {...props}
        >
            {children}
        </span>
    )
}

/**
 * TreeViewLabel Component
 *
 * Label text for tree item.
 */
export const TreeViewLabel: FC<TreeViewLabelProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <span
            class={cn(
                'flex-1',
                'select-none',
                className,
            )}
            {...props}
        >
            {children}
        </span>
    )
}

/**
 * TreeViewContent Component
 *
 * Container for nested tree items (children).
 */
export const TreeViewContent: FC<TreeViewContentProps> = ({
    class: className,
    children,
    ...props
}) => {
    return (
        <div
            class={cn(
                'overflow-hidden',
                'transition-all duration-200',
                className,
            )}
            data-tree-content
            {...props}
        >
            {children}
        </div>
    )
}

/**
 * TreeViewScript Component
 *
 * Client-side JavaScript for expand/collapse and keyboard navigation.
 * Handles:
 * - Click on trigger to expand/collapse
 * - Arrow key navigation (Right: expand, Left: collapse, Up/Down: navigate)
 * - Enter/Space: select item (if selectable)
 */
export const TreeViewScript: FC = () => {
    return (
        <script
            dangerouslySetInnerHTML={{
                __html: `
(function() {
    'use strict';
    
    // Initialize tree view functionality
    function initTreeView() {
        const trees = document.querySelectorAll('[role="tree"]');
        
        trees.forEach(tree => {
            // Handle trigger clicks
            tree.addEventListener('click', (e) => {
                const trigger = e.target.closest('[data-tree-trigger]');
                if (!trigger) return;
                
                e.stopPropagation();
                
                const item = trigger.closest('[data-tree-item]');
                if (!item) return;
                
                const content = item.querySelector('[data-tree-content]');
                if (!content) return;
                
                const isExpanded = item.getAttribute('aria-expanded') === 'true';
                
                // Toggle state
                item.setAttribute('aria-expanded', !isExpanded);
                trigger.setAttribute('aria-expanded', !isExpanded);
                
                if (isExpanded) {
                    content.classList.add('hidden');
                } else {
                    content.classList.remove('hidden');
                }
            });
            
            // Handle item clicks for selection
            tree.addEventListener('click', (e) => {
                const wrapper = e.target.closest('[data-tree-item-wrapper]');
                if (!wrapper) return;
                
                const item = wrapper.closest('[data-tree-item]');
                if (!item) return;
                
                const isSelectable = item.getAttribute('data-selectable') === 'true';
                if (!isSelectable) return;
                
                // Deselect all items first
                tree.querySelectorAll('[data-tree-item][data-selectable="true"]').forEach(i => {
                    i.setAttribute('aria-selected', 'false');
                });
                
                // Select this item
                item.setAttribute('aria-selected', 'true');
            });
            
            // Keyboard navigation
            tree.addEventListener('keydown', (e) => {
                const wrapper = e.target.closest('[data-tree-item-wrapper]');
                if (!wrapper) return;
                
                const currentItem = wrapper.closest('[data-tree-item]');
                if (!currentItem) return;

                switch(e.key) {
                    case 'ArrowRight': {
                        e.preventDefault();
                        const hasChildren = currentItem.getAttribute('data-has-children') === 'true';
                        if (hasChildren) {
                            const isExpanded = currentItem.getAttribute('aria-expanded') === 'true';
                            if (!isExpanded) {
                                const trigger = currentItem.querySelector('[data-tree-trigger]');
                                if (trigger) trigger.click();
                            } else {
                                // Move to first child
                                const firstChild = currentItem.querySelector('[role="group"] > [data-tree-item] > [data-tree-item-wrapper]');
                                if (firstChild) firstChild.focus();
                            }
                        }
                        break;
                    }
                    case 'ArrowLeft': {
                        e.preventDefault();
                        const hasChildren = currentItem.getAttribute('data-has-children') === 'true';
                        const isExpanded = currentItem.getAttribute('aria-expanded') === 'true';
                        
                        if (hasChildren && isExpanded) {
                            const trigger = currentItem.querySelector('[data-tree-trigger]');
                            if (trigger) trigger.click();
                        } else {
                            // Move to parent
                            const parentGroup = currentItem.parentElement.closest('[role="group"]');
                            if (parentGroup) {
                                const parentItem = parentGroup.closest('[data-tree-item]');
                                if (parentItem) {
                                    const parentWrapper = parentItem.querySelector(':scope > [data-tree-item-wrapper]');
                                    if (parentWrapper) parentWrapper.focus();
                                }
                            }
                        }
                        break;
                    }
                    case 'ArrowDown': {
                        e.preventDefault();
                        const nextWrapper = getNextTreeItemWrapper(currentItem);
                        if (nextWrapper) nextWrapper.focus();
                        break;
                    }
                    case 'ArrowUp': {
                        e.preventDefault();
                        const prevWrapper = getPrevTreeItemWrapper(currentItem);
                        if (prevWrapper) prevWrapper.focus();
                        break;
                    }
                    case 'Enter':
                    case ' ': {
                        e.preventDefault();
                        const isSelectable = currentItem.getAttribute('data-selectable') === 'true';
                        if (isSelectable) {
                            wrapper.click();
                        }
                        break;
                    }
                }
            });
        });
    }
    
    // Get next visible tree item wrapper
    function getNextTreeItemWrapper(currentItem) {
        // Check if current has expanded children
        const isExpanded = currentItem.getAttribute('aria-expanded') === 'true';
        if (isExpanded) {
            const firstChild = currentItem.querySelector('[role="group"] > [data-tree-item] > [data-tree-item-wrapper]');
            if (firstChild) return firstChild;
        }
        
        // Check for next sibling
        const nextSibling = currentItem.nextElementSibling;
        if (nextSibling && nextSibling.hasAttribute('data-tree-item')) {
            return nextSibling.querySelector(':scope > [data-tree-item-wrapper]');
        }
        
        // Go up and find next sibling of parent
        let parent = currentItem.parentElement.closest('[data-tree-item]');
        while (parent) {
            const parentNext = parent.nextElementSibling;
            if (parentNext && parentNext.hasAttribute('data-tree-item')) {
                return parentNext.querySelector(':scope > [data-tree-item-wrapper]');
            }
            parent = parent.parentElement.closest('[data-tree-item]');
        }
        
        return null;
    }
    
    // Get previous visible tree item wrapper
    function getPrevTreeItemWrapper(currentItem) {
        const prevSibling = currentItem.previousElementSibling;
        
        if (prevSibling && prevSibling.hasAttribute('data-tree-item')) {
            // Get last visible descendant of previous sibling
            let item = prevSibling;
            while (true) {
                const isExpanded = item.getAttribute('aria-expanded') === 'true';
                if (!isExpanded) break;
                
                const children = item.querySelectorAll(':scope > [data-tree-content] > [role="group"] > [data-tree-item]');
                if (children.length === 0) break;
                
                item = children[children.length - 1];
            }
            return item.querySelector(':scope > [data-tree-item-wrapper]');
        }
        
        // Go to parent
        const parentGroup = currentItem.parentElement.closest('[role="group"]');
        if (parentGroup) {
            const parentItem = parentGroup.closest('[data-tree-item]');
            if (parentItem) return parentItem.querySelector(':scope > [data-tree-item-wrapper]');
        }
        
        return null;
    }
    
    // Initialize on load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTreeView);
    } else {
        initTreeView();
    }
    
    // Re-initialize on Unpoly fragment updates
    if (typeof up !== 'undefined') {
        up.compiler('[role="tree"]', () => {
            initTreeView();
        });
    }
})();
`,
            }}
        />
    )
}
