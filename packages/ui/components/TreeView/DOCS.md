# TreeView

Documentation for the TreeView component.

## Installation

```bash
deno run -A jsr:@lockness/ui add treeview
```

## Usage

```tsx
import { TreeView, TreeViewItem } from '@lockness/ui/components'

<TreeView>
  <TreeViewItem label="Documents" hasChildren defaultExpanded>
    <TreeViewItem label="Work" hasChildren>
      <TreeViewItem label="Report.pdf" />
      <TreeViewItem label="Presentation.pptx" />
    </TreeViewItem>
    <TreeViewItem label="Personal" hasChildren>
      <TreeViewItem label="Resume.pdf" />
    </TreeViewItem>
  </TreeViewItem>
  <TreeViewItem label="README.md" />
</TreeView>
```

## Props

### TreeView

| Prop      | Type                      | Default         | Description                                                                |
| --------- | ------------------------- | --------------- | -------------------------------------------------------------------------- |
| children  | `unknown`                 | -               | Tree items (TreeViewItem components)                                       |
| items     | `TreeViewDataItem[]`      | -               | Data-driven tree structure (alternative to children)                       |
| variant   | `'interactive' \| 'text'` | `'interactive'` | Display variant: 'interactive' for collapsible tree, 'text' for ASCII tree |
| rootLabel | `string`                  | -               | Root label for text variant                                                |
| class     | `string`                  | -               | Additional CSS class names                                                 |

### TreeViewItem

| Prop            | Type                     | Default      | Description                                     |
| --------------- | ------------------------ | ------------ | ----------------------------------------------- |
| label           | `string`                 | **required** | Item label text                                 |
| id              | `string`                 | -            | Unique identifier for this item                 |
| hasChildren     | `boolean`                | -            | Whether item has children (is a branch vs leaf) |
| defaultExpanded | `boolean`                | -            | Whether item is initially expanded              |
| selectable      | `boolean`                | -            | Whether item is selectable                      |
| defaultSelected | `boolean`                | -            | Whether item is initially selected              |
| icon            | `unknown`                | -            | Optional icon element                           |
| children        | `unknown`                | -            | Nested tree items                               |
| class           | `string`                 | -            | Additional CSS class names                      |
| onClick         | `(event: Event) => void` | -            | Click handler for item selection                |

### TreeViewDataItem

| Prop            | Type                 | Default      | Description                        |
| --------------- | -------------------- | ------------ | ---------------------------------- |
| id              | `string`             | **required** | Unique identifier                  |
| label           | `string`             | **required** | Display label                      |
| icon            | `unknown`            | -            | Optional icon element              |
| children        | `TreeViewDataItem[]` | -            | Nested children items              |
| defaultExpanded | `boolean`            | -            | Whether item is initially expanded |
| selectable      | `boolean`            | -            | Whether item is selectable         |
| defaultSelected | `boolean`            | -            | Whether item is initially selected |

## Theming

The TreeView component can be customized using CSS variables. This allows you to
change the appearance of tree structures globally or override specific
instances.

### Available CSS Variables

| Variable                              | Default                    | Description                         |
| ------------------------------------- | -------------------------- | ----------------------------------- |
| `--treeview-item-padding-x`           | `0.5rem`                   | Horizontal padding for tree items   |
| `--treeview-item-padding-y`           | `0.375rem`                 | Vertical padding for tree items     |
| `--treeview-item-border-radius`       | `var(--radius)`            | Border radius for tree items        |
| `--treeview-item-background-hover`    | `var(--accent)`            | Background color on item hover      |
| `--treeview-item-foreground-hover`    | `var(--accent-foreground)` | Text color on item hover            |
| `--treeview-icon-size`                | `1rem`                     | Size of expand/collapse icons       |
| `--treeview-icon-transition-duration` | `200ms`                    | Duration of icon rotation animation |

### Theming Examples

#### Global Customization

Customize all tree views by setting CSS variables in your theme:

```css
/* app/view/assets/app.css */
@theme {
    /* More spacious items */
    --treeview-item-padding-x: 0.75rem;
    --treeview-item-padding-y: 0.5rem;

    /* More rounded items */
    --treeview-item-border-radius: 0.5rem;

    /* Larger icons */
    --treeview-icon-size: 1.25rem;

    /* Faster animation */
    --treeview-icon-transition-duration: 150ms;
}
```

#### Local Overrides

Override CSS variables for specific tree view instances:

```tsx
<div style="--treeview-item-padding-y: 0.25rem;">
    <TreeView>
        {/* Compact tree with less indentation */}
    </TreeView>
</div>

<div style="--treeview-item-padding-x: 1rem; --treeview-item-border-radius: 0.75rem;">
    <TreeView>
        {/* Tree with more padding and rounded items */}
    </TreeView>
</div>
```

#### Component-Specific Theming

Create themed sections with different tree view styles:

```tsx
<div class="file-browser" style={{
    '--treeview-item-padding-x': '0.5rem',
    '--treeview-item-padding-y': '0.25rem',
    '--treeview-item-border-radius': '0.25rem',
    '--treeview-icon-size': '0.875rem'
}}>
    <TreeView>
        {/* Compact file browser tree */}
        <TreeViewItem label="src" hasChildren defaultExpanded>
            <TreeViewItem label="components" hasChildren>
                <TreeViewItem label="Button.tsx" />
            </TreeViewItem>
        </TreeViewItem>
    </TreeView>
</div>

<div class="navigation-tree" style={{
    '--treeview-item-padding-x': '1rem',
    '--treeview-item-padding-y': '0.5rem',
    '--treeview-item-border-radius': '0.5rem',
    '--treeview-icon-size': '1.25rem',
    '--treeview-icon-transition-duration': '250ms'
}}>
    <TreeView>
        {/* Spacious navigation tree with smooth animations */}
        <TreeViewItem label="Documentation" hasChildren>
            <TreeViewItem label="Getting Started" />
            <TreeViewItem label="Components" hasChildren>
                <TreeViewItem label="Button" />
                <TreeViewItem label="Input" />
            </TreeViewItem>
        </TreeViewItem>
    </TreeView>
</div>
```

## Examples

### Basic Example

```tsx
// Add example here
```
