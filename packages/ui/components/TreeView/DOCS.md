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

## Examples

### Basic Example

```tsx
// Add example here
```
