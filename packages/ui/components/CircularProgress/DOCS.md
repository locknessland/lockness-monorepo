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

## Variants

| Variant       | Description                                 |
| ------------- | ------------------------------------------- |
| `default`     | Primary color                               |
| `success`     | Green color for completed/successful states |
| `warning`     | Yellow color for warning states             |
| `destructive` | Red color for error/danger states           |

```tsx
<CircularProgress value={60} showLabel />
<CircularProgress value={100} variant="success" showLabel />
<CircularProgress value={45} variant="warning" showLabel />
<CircularProgress value={25} variant="destructive" showLabel />
```

## Sizes

| Size      | Dimension |
| --------- | --------- |
| `sm`      | 2.5rem    |
| `default` | 4rem      |
| `lg`      | 6rem      |
| `xl`      | 8rem      |

```tsx
<CircularProgress value={60} size="sm" showLabel />
<CircularProgress value={60} size="default" showLabel />
<CircularProgress value={60} size="lg" showLabel />
<CircularProgress value={60} size="xl" showLabel />
```

## Stroke Width

Customize the thickness of the progress circle.

```tsx
<CircularProgress value={60} strokeWidth={1} showLabel />
<CircularProgress value={60} strokeWidth={2} showLabel />
<CircularProgress value={60} strokeWidth={4} showLabel />
```

## Props

| Prop        | Type                                           | Default   | Description                         |
| ----------- | ---------------------------------------------- | --------- | ----------------------------------- |
| value       | `number`                                       | `0`       | Current progress value (0-100)      |
| max         | `number`                                       | `100`     | Maximum value                       |
| variant     | `default \| success \| warning \| destructive` | `default` | Visual style variant                |
| size        | `sm \| default \| lg \| xl`                    | `default` | Size of the circular progress       |
| strokeWidth | `number`                                       | `3`       | Stroke width of the progress circle |
| showLabel   | `boolean`                                      | `false`   | Show percentage label in the center |
| class       | `string`                                       | -         | Additional CSS class names          |
| id          | `string`                                       | -         | Element id attribute                |

## Accessibility

The component includes proper ARIA attributes:

- `role="progressbar"` for semantic meaning
- `aria-valuenow` for the current value
- `aria-valuemin` and `aria-valuemax` for the range

## Examples

### Loading State

```tsx
<div class='flex items-center gap-4'>
    <CircularProgress value={75} showLabel />
    <span>Loading...</span>
</div>
```

### Dashboard Metrics

```tsx
<div class='flex gap-8'>
    <div class='text-center'>
        <CircularProgress value={85} variant='success' size='lg' showLabel />
        <p class='mt-2 text-sm'>Performance</p>
    </div>
    <div class='text-center'>
        <CircularProgress value={62} size='lg' showLabel />
        <p class='mt-2 text-sm'>Progress</p>
    </div>
    <div class='text-center'>
        <CircularProgress
            value={23}
            variant='destructive'
            size='lg'
            showLabel
        />
        <p class='mt-2 text-sm'>Errors</p>
    </div>
</div>
```

### Completion Indicator

```tsx
<CircularProgress
    value={100}
    variant='success'
    size='xl'
    showLabel
/>
```
