# CircularProgress

A circular progress indicator using SVG. Pure CSS implementation with smooth
animations, multiple variants, and sizes.

## Installation

```bash
deno run -A jsr:@lockness/ui add circularprogress
```

## Usage

```tsx
import { CircularProgress } from '@lockness/ui/components'

// Basic usage
<CircularProgress value={50} />

// With label
<CircularProgress value={75} showLabel />

// Success variant
<CircularProgress value={100} variant="success" showLabel />

// Different sizes
<CircularProgress value={60} size="sm" />
<CircularProgress value={60} size="xl" showLabel />
```

### Custom Stroke Width

```tsx
<CircularProgress value={60} strokeWidth={1} showLabel />
<CircularProgress value={60} strokeWidth={4} showLabel />
```

## Props

| Prop          | Type                                                   | Default     | Description                         |
| ------------- | ------------------------------------------------------ | ----------- | ----------------------------------- |
| `value`       | `number`                                               | `0`         | Current progress value (0-100)      |
| `max`         | `number`                                               | `100`       | Maximum value                       |
| `variant`     | `'default' \| 'success' \| 'warning' \| 'destructive'` | `'default'` | Visual style variant                |
| `size`        | `'sm' \| 'default' \| 'lg' \| 'xl'`                    | `'default'` | Size of the circular progress       |
| `strokeWidth` | `number`                                               | `2`         | Stroke width of the progress circle |
| `showLabel`   | `boolean`                                              | `false`     | Show percentage label in the center |
| `class`       | `string`                                               | -           | Additional CSS class names          |
| `id`          | `string`                                               | -           | Element id attribute                |

## Variants

| Variant       | Description                                 |
| ------------- | ------------------------------------------- |
| `default`     | Primary color (uses `--primary`)            |
| `success`     | Green color for completed/successful states |
| `warning`     | Yellow color for warning states             |
| `destructive` | Red color for error/danger states           |

## Sizes

| Size      | Dimension |
| --------- | --------- |
| `sm`      | 4rem      |
| `default` | 6rem      |
| `lg`      | 8rem      |
| `xl`      | 10rem     |

## Features

- **SVG-based** - Crisp rendering at any size
- **Pure CSS** - Smooth animated transitions
- **Multiple sizes** - 4 preset sizes
- **Multiple variants** - 4 color variants
- **Custom stroke width** - Adjustable line thickness
- **Accessible** - Proper ARIA attributes (`progressbar` role)
