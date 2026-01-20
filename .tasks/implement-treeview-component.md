# Technical Task: Implement TreeView Component

## 📋 Task Overview

Implement a new TreeView component for the @lockness/ui library. The TreeView is
a hierarchical data visualization component that allows users to expand/collapse
nested items, similar to file explorers or navigation trees. The component
should be fully accessible, support multiple visual variants, and work with pure
CSS/JS (no external dependencies).

## 🎯 Objectives

1. **Primary Objective**: Create a recursive TreeView component with
   expand/collapse functionality
2. **API Design**: Provide both declarative (JSX children) and data-driven
   (items prop) APIs
3. **Accessibility**: Full ARIA support with `role="tree"`, `role="treeitem"`,
   `aria-expanded`
4. **Customization**: Support custom icons, multiple variants (basic, chevron),
   and selectable items
5. **Documentation**: Complete JSDoc, demo page, and LLM documentation

## 📁 Affected File Paths

### Core Files to Create

- `/packages/ui/components/TreeView.tsx` - Main TreeView component with all
  sub-components
- `/packages/ui/components/index.ts` - Export new TreeView components

### Demo Files to Create

- `/app/view/pages/ui/treeview.tsx` - Demo page showcasing all variants and
  features

### Documentation Files to Update

> ⚠️ **Important**: Follow the architecture and conventions documented in
> [GEMINI.md](../GEMINI.md)

#### User Documentation (Web)

- `/app/view/components/ui-sidebar.tsx` - Add TreeView link to sidebar
  navigation

#### LLM Documentation

- `/public/llms/ui-treeview.txt` - Create LLM-optimized documentation

## 🏗️ Architecture Principles

### Component Structure

```
TreeView (Root)
├── TreeViewItem (Branch/Leaf)
│   ├── TreeViewTrigger (Expand/Collapse button)
│   ├── TreeViewIcon (Item icon)
│   ├── TreeViewLabel (Item text)
│   └── TreeViewContent (Children container)
└── TreeViewScript (Client-side interactivity)
```

### SOLID Principles Application

**1. Single Responsibility Principle (SRP)**

- **TreeView**: Container root with `role="tree"`
- **TreeViewItem**: Individual tree node (branch or leaf)
- **TreeViewTrigger**: Expand/collapse toggle button
- **TreeViewContent**: Children wrapper with animation
- **TreeViewScript**: Client-side expand/collapse logic

**2. Open/Closed Principle (OCP)**

- Support custom icons via `icon` prop
- Support custom trigger via `triggerIcon` prop
- Allow full className customization on all sub-components

**3. Interface Segregation Principle (ISP)**

```typescript
// Separate interfaces for different concerns
interface TreeViewRootProps { ... }
interface TreeViewItemProps { ... }
interface TreeViewTriggerProps { ... }
interface TreeViewContentProps { ... }
```

**4. Dependency Inversion Principle (DIP)**

- Icons passed as props, not hardcoded
- Variant styles defined via CSS variables
- No external JS dependencies

### Layered Architecture

```
┌─────────────────────────────────────────┐
│  User Application Layer                  │  ← <TreeView>, <TreeViewItem>
├─────────────────────────────────────────┤
│  Component API Layer                     │  ← Props, Types, Variants
├─────────────────────────────────────────┤
│  Core Implementation Layer               │  ← Rendering, CSS Classes
├─────────────────────────────────────────┤
│  Client Script Layer                     │  ← TreeViewScript (interactivity)
└─────────────────────────────────────────┘
```

## 🎨 Proposed API Design

### Target User-Facing API (Declarative)

```tsx
import { 
    TreeView, 
    TreeViewItem, 
    TreeViewScript 
} from '@lockness/ui/components'

<TreeView>
    <TreeViewItem label="src" icon={<FolderIcon />} defaultExpanded>
        <TreeViewItem label="components" icon={<FolderIcon />}>
            <TreeViewItem label="Button.tsx" icon={<FileIcon />} />
            <TreeViewItem label="Card.tsx" icon={<FileIcon />} />
        </TreeViewItem>
        <TreeViewItem label="utils" icon={<FolderIcon />}>
            <TreeViewItem label="helpers.ts" icon={<FileIcon />} />
        </TreeViewItem>
    </TreeViewItem>
    <TreeViewItem label="package.json" icon={<FileIcon />} />
</TreeView>
<TreeViewScript />
```

### Target User-Facing API (Data-Driven)

```tsx
import { TreeView, TreeViewScript } from '@lockness/ui/components'

const items = [
    {
        id: 'src',
        label: 'src',
        icon: <FolderIcon />,
        defaultExpanded: true,
        children: [
            { id: 'btn', label: 'Button.tsx', icon: <FileIcon /> },
            { id: 'card', label: 'Card.tsx', icon: <FileIcon /> },
        ],
    },
    { id: 'pkg', label: 'package.json', icon: <FileIcon /> },
]

<TreeView items={items} />
<TreeViewScript />
```

### Props Interface

```typescript
/**
 * Available visual variants for the TreeView component.
 */
export type TreeViewVariant = 'default' | 'chevron'

/**
 * Props for the TreeView root component.
 */
export interface TreeViewProps {
    /** Additional CSS classes */
    readonly class?: string
    /** Visual variant */
    readonly variant?: TreeViewVariant
    /** Data-driven items (alternative to children) */
    readonly items?: TreeViewItemData[]
    /** Whether to show connecting lines */
    readonly showLines?: boolean
    /** Children (declarative API) */
    readonly children?: unknown
}

/**
 * Props for a TreeView item.
 */
export interface TreeViewItemProps {
    /** Unique identifier */
    readonly id?: string
    /** Display label */
    readonly label: string
    /** Icon element */
    readonly icon?: unknown
    /** Whether expanded by default */
    readonly defaultExpanded?: boolean
    /** Whether item is selectable */
    readonly selectable?: boolean
    /** Whether item is currently selected */
    readonly selected?: boolean
    /** Click handler */
    readonly onClick?: string
    /** Additional CSS classes */
    readonly class?: string
    /** Nested children */
    readonly children?: unknown
}

/**
 * Data structure for data-driven API.
 */
export interface TreeViewItemData {
    readonly id: string
    readonly label: string
    readonly icon?: unknown
    readonly defaultExpanded?: boolean
    readonly selectable?: boolean
    readonly children?: readonly TreeViewItemData[]
}
```

## 📝 Detailed Implementation Steps

### Phase 1: Core Components

**Step 1.1: Create TreeView.tsx**

File: `/packages/ui/components/TreeView.tsx`

```tsx
/**
 * TreeView Component
 *
 * A hierarchical tree view component for displaying nested data structures.
 * Supports expand/collapse, custom icons, selection, and multiple variants.
 *
 * @module TreeView
 * @packageDocumentation
 */

import type { FC } from '@lockness/core'
import { cn } from '../lib/utils.ts'

// Types
export type TreeViewVariant = 'default' | 'chevron'
export type TreeViewSize = 'sm' | 'md' | 'lg'

export interface TreeViewProps {
    readonly class?: string
    readonly variant?: TreeViewVariant
    readonly showLines?: boolean
    readonly children?: unknown
}

export interface TreeViewItemProps {
    readonly id?: string
    readonly label: string
    readonly icon?: unknown
    readonly defaultExpanded?: boolean
    readonly selectable?: boolean
    readonly class?: string
    readonly children?: unknown
}

// Internal ID generator
let treeItemCounter = 0
const generateTreeItemId = () => `tree-item-${++treeItemCounter}`

/**
 * Plus/Minus toggle icon (default variant)
 * @internal
 */
const PlusMinusIcon: FC<{ class?: string }> = ({ class: className }) => (
    <svg
        class={cn('size-4 text-foreground', className)}
        xmlns='http://www.w3.org/2000/svg'
        width='24'
        height='24'
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        stroke-width='1.5'
        stroke-linecap='round'
        stroke-linejoin='round'
        aria-hidden='true'
    >
        <path d='M5 12h14' />
        <path class='tree-item-plus-icon' d='M12 5v14' />
    </svg>
)

/**
 * Chevron toggle icon (chevron variant)
 * @internal
 */
const ChevronIcon: FC<{ class?: string }> = ({ class: className }) => (
    <svg
        class={cn(
            'size-2.5 text-muted-foreground tree-item-chevron',
            className,
        )}
        xmlns='http://www.w3.org/2000/svg'
        width='16'
        height='16'
        fill='currentColor'
        viewBox='0 0 16 16'
        aria-hidden='true'
    >
        <path d='m12.14 8.753-5.482 4.796c-.646.566-1.658.106-1.658-.753V3.204a1 1 0 0 1 1.659-.753l5.48 4.796a1 1 0 0 1 0 1.506z' />
    </svg>
)

/**
 * TreeView root component.
 */
export const TreeView: FC<TreeViewProps> = ({
    class: className,
    variant = 'default',
    showLines = true,
    children,
}) => (
    <div
        class={cn('tree-view', `tree-view-${variant}`, className)}
        role='tree'
        aria-orientation='vertical'
        data-show-lines={showLines}
    >
        <div class='tree-view-group' role='group' data-tree-always-open>
            {children}
        </div>
    </div>
)

/**
 * TreeView item component (branch or leaf).
 */
export const TreeViewItem: FC<TreeViewItemProps> = ({
    id,
    label,
    icon,
    defaultExpanded = false,
    selectable = false,
    class: className,
    children,
}) => {
    const itemId = id || generateTreeItemId()
    const hasChildren = !!children
    const isExpanded = defaultExpanded && hasChildren

    return (
        <div
            class={cn('tree-view-item', isExpanded && 'expanded', className)}
            role='treeitem'
            aria-expanded={hasChildren ? isExpanded : undefined}
            id={`${itemId}-heading`}
            data-tree-item
        >
            {/* Item Header */}
            <div class='tree-view-heading py-0.5 flex items-center gap-x-0.5 w-full'>
                {/* Toggle Button (only for branches) */}
                {hasChildren
                    ? (
                        <button
                            type='button'
                            class='tree-view-toggle size-6 flex justify-center items-center hover:bg-accent rounded-md focus:outline-hidden focus:bg-accent'
                            aria-expanded={isExpanded}
                            aria-controls={`${itemId}-content`}
                            data-tree-toggle
                        >
                            <PlusMinusIcon />
                        </button>
                    )
                    : <span class='size-6' aria-hidden='true' />}

                {/* Item Content */}
                <div
                    class={cn(
                        'grow px-1.5 rounded-md',
                        selectable &&
                            'tree-view-selectable cursor-pointer hover:bg-accent',
                    )}
                    data-tree-selectable={selectable || undefined}
                >
                    <div class='flex items-center gap-x-3 py-1'>
                        {icon && (
                            <span class='shrink-0 size-4 text-muted-foreground'>
                                {icon}
                            </span>
                        )}
                        <span class='text-sm text-foreground'>{label}</span>
                    </div>
                </div>
            </div>

            {/* Children Content */}
            {hasChildren && (
                <div
                    id={`${itemId}-content`}
                    class={cn(
                        'tree-view-content w-full overflow-hidden transition-[height] duration-300',
                        !isExpanded && 'hidden',
                    )}
                    role='group'
                    aria-labelledby={`${itemId}-heading`}
                >
                    <div class='tree-view-children ps-7 relative before:absolute before:top-0 before:start-3 before:w-0.5 before:-ms-px before:h-full before:bg-border'>
                        {children}
                    </div>
                </div>
            )}
        </div>
    )
}

/**
 * TreeView client-side script for interactivity.
 */
export const TreeViewScript: FC = () => (
    <script
        dangerouslySetInnerHTML={{
            __html: `
                (function() {
                    function initTreeView() {
                        document.querySelectorAll('[data-tree-toggle]').forEach(toggle => {
                            if (toggle.dataset.treeInitialized) return;
                            toggle.dataset.treeInitialized = 'true';
                            
                            toggle.addEventListener('click', function(e) {
                                e.stopPropagation();
                                const item = this.closest('[data-tree-item]');
                                const content = item.querySelector('.tree-view-content');
                                const isExpanded = item.classList.contains('expanded');
                                
                                if (isExpanded) {
                                    item.classList.remove('expanded');
                                    item.setAttribute('aria-expanded', 'false');
                                    this.setAttribute('aria-expanded', 'false');
                                    content.classList.add('hidden');
                                } else {
                                    item.classList.add('expanded');
                                    item.setAttribute('aria-expanded', 'true');
                                    this.setAttribute('aria-expanded', 'true');
                                    content.classList.remove('hidden');
                                }
                            });
                        });

                        // Handle selectable items
                        document.querySelectorAll('[data-tree-selectable]').forEach(selectable => {
                            if (selectable.dataset.selectableInitialized) return;
                            selectable.dataset.selectableInitialized = 'true';
                            
                            selectable.addEventListener('click', function() {
                                // Remove previous selection
                                document.querySelectorAll('.tree-view-selected').forEach(el => {
                                    el.classList.remove('tree-view-selected');
                                });
                                // Add selection to clicked item
                                this.classList.add('tree-view-selected');
                            });
                        });
                    }

                    initTreeView();
                    
                    // Re-init on Unpoly navigation
                    window.addEventListener('up:content:updated', initTreeView);
                })();
            `,
        }}
    />
)
```

**Step 1.2: Add CSS Variables**

File: `/app/view/assets/app.css` (add to @theme block)

```css
/* TreeView Component */
--tree-view-line-color: var(--border);
--tree-view-hover-bg: var(--accent);
--tree-view-selected-bg: var(--accent);
--tree-view-icon-color: var(--muted-foreground);
--tree-view-toggle-size: 1.5rem;
--tree-view-indent: 1.75rem;
```

**Step 1.3: Add CSS Styles**

File: `/app/view/assets/app.css` (add to components section)

```css
/* TreeView Styles */
.tree-view-item.expanded .tree-item-plus-icon {
    display: none;
}

.tree-view-item.expanded .tree-item-chevron {
    transform: rotate(90deg);
}

.tree-item-chevron {
    transition: transform 0.2s ease;
}

.tree-view-selected {
    background-color: var(--tree-view-selected-bg);
}
```

**Step 1.4: Export Components**

File: `/packages/ui/components/index.ts`

```typescript
// Add exports
export {
    TreeView,
    TreeViewItem,
    type TreeViewItemProps,
    type TreeViewProps,
    TreeViewScript,
    type TreeViewVariant,
} from './TreeView.tsx'
```

### Phase 2: Demo Page

**Step 2.1: Create Demo Page**

File: `/app/view/pages/ui/treeview.tsx`

Create a comprehensive demo page with:

- Basic usage example
- Chevron variant
- With custom icons
- Selectable items
- Deeply nested structure
- Props reference table

### Phase 3: Icons

**Step 3.1: Add Required Icons**

File: `/packages/ui/icons.tsx`

Add if missing:

- `FolderIcon`
- `FolderOpenIcon`
- `FileCodeIcon`
- `FileTextIcon`

### Phase 4: Documentation

**Step 4.1: Update Sidebar Navigation**

File: `/app/view/components/ui-sidebar.tsx`

Add TreeView link in LAYOUT section:

```typescript
{ title: 'Tree View', href: '/ui/treeview' },
```

**Step 4.2: Create LLM Documentation**

File: `/public/llms/ui-treeview.txt`

## 🧪 Testing Strategy

### Manual Testing

- [ ] Basic expand/collapse works
- [ ] Chevron variant rotates correctly
- [ ] Deep nesting (5+ levels) renders correctly
- [ ] Selectable items highlight on click
- [ ] Keyboard navigation works (Enter/Space to toggle)
- [ ] Screen reader announces tree structure correctly
- [ ] Works in dark mode
- [ ] Works with Unpoly navigation

### Accessibility Testing

- [ ] `role="tree"` on root
- [ ] `role="treeitem"` on items
- [ ] `aria-expanded` updates on toggle
- [ ] `aria-controls` links toggle to content
- [ ] Focus indicators visible
- [ ] Keyboard navigable

## 🔍 Quality Checks

```bash
# Type check
deno check packages/ui/components/TreeView.tsx

# Lint
deno lint packages/ui/components/TreeView.tsx

# Check exports
deno check packages/ui/components/index.ts
```

## ✅ Definition of Done

- [ ] TreeView, TreeViewItem, TreeViewScript components created
- [ ] Both declarative and data-driven APIs work
- [ ] Default and chevron variants implemented
- [ ] Connecting lines between nested items
- [ ] Selectable items with visual feedback
- [ ] Full ARIA accessibility support
- [ ] CSS variables for customization
- [ ] Icons (Folder, File) available or added
- [ ] Demo page with all examples
- [ ] Sidebar navigation updated
- [ ] JSDoc documentation complete
- [ ] LLM documentation created
- [ ] Manual testing completed
- [ ] Dark mode tested
- [ ] `deno check` passes
- [ ] `deno lint` passes

## 🔗 Related Components

- `Accordion` - Similar expand/collapse pattern
- `Sidebar` - Uses tree-like navigation
- `FileIcon`, `FolderIcon` - Common icons for TreeView

## 📅 Timeline

- **Estimated Effort**: 4-6 hours
- **Complexity**: Medium

## 📝 Notes

### Design Decisions

1. **No external dependencies**: Pure CSS transitions + vanilla JS script
2. **Server-side rendering**: Initial state rendered on server, JS enhances
3. **Unique IDs**: Auto-generated if not provided to avoid collisions
4. **CSS-first animations**: Use `transition-[height]` for smooth collapse

### Performance Considerations

- Lazy rendering for very deep trees (future enhancement)
- Event delegation for large trees (future enhancement)

### Future Enhancements

- Drag and drop reordering
- Virtual scrolling for large trees
- Search/filter functionality
- Multi-select mode
- Async loading of children

---

_Task created: 2026-01-20_
