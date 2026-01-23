# Badge

Inline badge component for labels, tags, and status indicators. Supports
multiple visual variants for different use cases.

## Installation

```bash
deno run -A jsr:@lockness/ui add badge
```

## Usage

```tsx
import { Badge } from '@lockness/ui/components'

<Badge>New</Badge>
```

## Props

| Prop     | Type                                                     | Default     | Description                |
| -------- | -------------------------------------------------------- | ----------- | -------------------------- |
| variant  | `'default' \| 'secondary' \| 'destructive' \| 'outline'` | `'default'` | Visual style variant       |
| children | `unknown`                                                | -           | Badge content              |
| class    | `string`                                                 | -           | Additional CSS class names |
| id       | `string`                                                 | -           | Element id attribute       |

## Variants

### Default

Primary colored badge for highlighting important items.

```tsx
<Badge>New</Badge>
<Badge variant="default">Featured</Badge>
```

### Secondary

Subtle badge using secondary colors for less prominent labels.

```tsx
<Badge variant="secondary">Beta</Badge>
<Badge variant="secondary">Draft</Badge>
```

### Destructive

Alert/error style badge for warnings or critical status.

```tsx
<Badge variant="destructive">Error</Badge>
<Badge variant="destructive">Expired</Badge>
```

### Outline

Bordered badge with transparent background.

```tsx
<Badge variant="outline">Draft</Badge>
<Badge variant="outline">Pending</Badge>
```

## Examples

### Status Indicators

```tsx
<div class='flex gap-2'>
    <Badge>Active</Badge>
    <Badge variant='secondary'>Pending</Badge>
    <Badge variant='destructive'>Inactive</Badge>
    <Badge variant='outline'>Draft</Badge>
</div>
```

### In a Card

```tsx
<Card>
    <CardHeader>
        <div class='flex items-center justify-between'>
            <CardTitle>Project Alpha</CardTitle>
            <Badge variant='secondary'>In Progress</Badge>
        </div>
    </CardHeader>
    <CardContent>
        <p>Project description here...</p>
    </CardContent>
</Card>
```

### Custom Styling

```tsx
// Smaller badge
<Badge class="text-xs px-1.5 py-0.5">Small</Badge>

// Larger badge
<Badge class="text-base px-4 py-1.5">Large</Badge>

// Custom colors
<Badge class="bg-green-500 text-white">Success</Badge>
```

### Tags List

```tsx
<div class='flex flex-wrap gap-2'>
    <Badge variant='outline'>React</Badge>
    <Badge variant='outline'>TypeScript</Badge>
    <Badge variant='outline'>Tailwind</Badge>
    <Badge variant='outline'>Deno</Badge>
</div>
```

## CSS Variables

```css
@theme {
    --badge-padding-x: 0.625rem;
    --badge-padding-y: 0.125rem;
    --badge-font-size: 0.75rem;
    --badge-font-weight: 500;
    --radius: 0.5rem;
}
```
