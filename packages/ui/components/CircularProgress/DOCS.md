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
| `sm`      | 2.5rem    |
| `default` | 4rem      |
| `lg`      | 6rem      |
| `xl`      | 8rem      |

## Theming

The CircularProgress component can be customized using CSS variables. Override
these variables to match your design system.

### Available CSS Variables

| Variable                                | Default            | Description                      |
| --------------------------------------- | ------------------ | -------------------------------- |
| `--circular-progress-size-sm`           | `2.5rem`           | Size for sm variant              |
| `--circular-progress-size-md`           | `4rem`             | Size for default/md variant      |
| `--circular-progress-size-lg`           | `6rem`             | Size for lg variant              |
| `--circular-progress-size-xl`           | `8rem`             | Size for xl variant              |
| `--circular-progress-stroke-width-sm`   | `2`                | Stroke width for sm size         |
| `--circular-progress-stroke-width-md`   | `3`                | Stroke width for default/md size |
| `--circular-progress-stroke-width-lg`   | `4`                | Stroke width for lg size         |
| `--circular-progress-stroke-width-xl`   | `5`                | Stroke width for xl size         |
| `--circular-progress-track-color`       | `var(--secondary)` | Background track color           |
| `--circular-progress-indicator-color`   | `var(--primary)`   | Progress indicator color         |
| `--circular-progress-text-font-size-sm` | `0.75rem`          | Text size for sm variant         |
| `--circular-progress-text-font-size-md` | `1rem`             | Text size for default/md variant |
| `--circular-progress-text-font-size-lg` | `1.5rem`           | Text size for lg variant         |
| `--circular-progress-text-font-size-xl` | `2rem`             | Text size for xl variant         |

### Theming Examples

#### Custom Sizes

```css
:root {
    --circular-progress-size-sm: 3rem;
    --circular-progress-size-md: 5rem;
    --circular-progress-size-lg: 7rem;
    --circular-progress-size-xl: 10rem;
}
```

#### Custom Stroke Widths

```css
:root {
    --circular-progress-stroke-width-sm: 1.5;
    --circular-progress-stroke-width-md: 2.5;
    --circular-progress-stroke-width-lg: 3.5;
    --circular-progress-stroke-width-xl: 4.5;
}
```

#### Custom Colors

```css
:root {
    --circular-progress-track-color: hsl(240 5% 85%);
    --circular-progress-indicator-color: hsl(262 83% 58%);
}

.dark {
    --circular-progress-track-color: hsl(240 5% 20%);
    --circular-progress-indicator-color: hsl(262 83% 68%);
}
```

#### Custom Label Font Sizes

```css
:root {
    --circular-progress-text-font-size-sm: 0.875rem;
    --circular-progress-text-font-size-md: 1.125rem;
    --circular-progress-text-font-size-lg: 1.75rem;
    --circular-progress-text-font-size-xl: 2.5rem;
}
```

#### Complete Custom Theme

```css
:root {
    /* Sizes */
    --circular-progress-size-sm: 3rem;
    --circular-progress-size-md: 5rem;
    --circular-progress-size-lg: 8rem;
    --circular-progress-size-xl: 12rem;

    /* Stroke widths */
    --circular-progress-stroke-width-sm: 2;
    --circular-progress-stroke-width-md: 3;
    --circular-progress-stroke-width-lg: 4;
    --circular-progress-stroke-width-xl: 6;

    /* Colors */
    --circular-progress-track-color: hsl(210 40% 90%);
    --circular-progress-indicator-color: hsl(220 90% 56%);

    /* Text sizes */
    --circular-progress-text-font-size-sm: 0.75rem;
    --circular-progress-text-font-size-md: 1.25rem;
    --circular-progress-text-font-size-lg: 2rem;
    --circular-progress-text-font-size-xl: 3rem;
}

.dark {
    --circular-progress-track-color: hsl(210 40% 15%);
    --circular-progress-indicator-color: hsl(220 90% 66%);
}
```

## Features

- **SVG-based** - Crisp rendering at any size
- **Pure CSS** - Smooth animated transitions
- **Multiple sizes** - 4 preset sizes
- **Multiple variants** - 4 color variants
- **Custom stroke width** - Adjustable line thickness
- **Fully customizable** - CSS variables for theming
- **Accessible** - Proper ARIA attributes (`progressbar` role)
