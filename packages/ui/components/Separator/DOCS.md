# Separator

A visual divider component for separating content. Supports horizontal and
vertical orientations with accessibility support.

## Installation

```bash
deno run -A jsr:@lockness/ui add separator
```

## Usage

```tsx
import { Separator } from '@lockness/ui/components'

// Horizontal separator (default)
<Separator />

// With spacing
<Separator class="my-4" />

// Vertical separator
<div class="flex h-5 items-center">
  <span>Item 1</span>
  <Separator orientation="vertical" class="mx-2" />
  <span>Item 2</span>
</div>

// Semantic separator (not decorative)
<Separator decorative={false} />
```

## Props

| Prop          | Type                         | Default        | Description                                             |
| ------------- | ---------------------------- | -------------- | ------------------------------------------------------- |
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` | Separator orientation                                   |
| `decorative`  | `boolean`                    | `true`         | Whether the separator is decorative (for accessibility) |
| `class`       | `string`                     | -              | Additional CSS class names                              |
| `id`          | `string`                     | -              | Element id attribute                                    |

## Orientation

### Horizontal

```tsx
<div class='space-y-4'>
    <p>Content above</p>
    <Separator />
    <p>Content below</p>
</div>
```

### Vertical

```tsx
<div class='flex h-5 items-center space-x-4 text-sm'>
    <span>Blog</span>
    <Separator orientation='vertical' />
    <span>Docs</span>
    <Separator orientation='vertical' />
    <span>Source</span>
</div>
```

## CSS Variables

| Variable                | Description                     |
| ----------------------- | ------------------------------- |
| `--separator-color`     | Color of the separator line     |
| `--separator-thickness` | Thickness of the separator line |

## Accessibility

- When `decorative={true}` (default): Uses `role="none"` to indicate it's purely
  visual
- When `decorative={false}`: Uses `role="separator"` with `aria-orientation` for
  semantic separation

## Features

- **Accessible** - Proper ARIA roles for screen readers
- **Orientations** - Horizontal and vertical layouts
- **Themeable** - Uses CSS variables for styling
- **Flexible** - Works in flexbox and grid layouts
