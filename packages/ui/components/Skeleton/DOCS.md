# Skeleton

Animated pulse placeholder component for content loading states. Provides
multiple preset variants for common UI patterns.

## Installation

```bash
deno run -A jsr:@lockness/ui add skeleton
```

## Usage

```tsx
import { Skeleton } from '@lockness/ui/components'

// Default skeleton with custom dimensions
<Skeleton class="h-12 w-12" />

// Text skeleton
<Skeleton variant="text" />

// Multiple lines of text
<Skeleton variant="text" lines={3} />

// Heading skeleton
<Skeleton variant="heading" />

// Avatar skeleton
<Skeleton variant="avatar" />

// Button skeleton
<Skeleton variant="button" />

// Image skeleton
<Skeleton variant="image" />

// Card skeleton
<Skeleton variant="card" />

// Without animation
<Skeleton variant="text" animate={false} />
```

## Props

| Prop      | Type              | Default     | Description                        |
| --------- | ----------------- | ----------- | ---------------------------------- |
| `variant` | `SkeletonVariant` | `'default'` | Skeleton variant for common shapes |
| `lines`   | `number`          | `1`         | Number of lines (for text variant) |
| `animate` | `boolean`         | `true`      | Whether to animate the skeleton    |
| `class`   | `string`          | -           | Additional CSS class names         |
| `id`      | `string`          | -           | Element id attribute               |

## Variants

| Variant   | Description                                | Dimensions               |
| --------- | ------------------------------------------ | ------------------------ |
| `default` | Base skeleton, requires custom dimensions  | Set via `class`          |
| `text`    | Single or multiple text lines              | Full width, h-4 per line |
| `heading` | Heading placeholder                        | 75% width, h-8           |
| `avatar`  | Circular avatar placeholder                | 48x48px, rounded-full    |
| `button`  | Button placeholder                         | 96x40px                  |
| `image`   | Image placeholder                          | Full width, h-48         |
| `card`    | Complete card with header, image, and text | Full card layout         |

## CSS Variables

| Variable                   | Description                           |
| -------------------------- | ------------------------------------- |
| `--skeleton-background`    | Background color of skeleton elements |
| `--skeleton-border-radius` | Border radius of skeleton elements    |
| `--border`                 | Border color (for card variant)       |

## Examples

### Loading Card

```tsx
<div class='flex items-center space-x-4'>
    <Skeleton variant='avatar' />
    <div class='space-y-2'>
        <Skeleton variant='heading' class='w-62.5' />
        <Skeleton variant='text' class='w-50' />
    </div>
</div>
```

### Loading Article

```tsx
<div class='space-y-4'>
    <Skeleton variant='heading' />
    <Skeleton variant='text' lines={4} />
    <Skeleton variant='image' />
    <Skeleton variant='text' lines={3} />
</div>
```

### Loading Table Row

```tsx
<div class='flex space-x-4'>
    <Skeleton class='h-4 w-25' />
    <Skeleton class='h-4 w-37.5' />
    <Skeleton class='h-4 w-20' />
</div>
```

## Features

- **Animated pulse** - Smooth CSS animation for loading indication
- **Multiple variants** - Pre-built shapes for common UI patterns
- **Multi-line text** - Support for multiple text lines with varying widths
- **Disable animation** - Option to turn off animation
- **Themeable** - Uses CSS variables for styling
