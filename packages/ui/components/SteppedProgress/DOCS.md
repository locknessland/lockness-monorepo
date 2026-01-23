# SteppedProgress

A segmented progress bar showing discrete steps. Useful for multi-step forms,
onboarding flows, or displaying progress in stages.

## Installation

```bash
deno run -A jsr:@lockness/ui add steppedprogress
```

## Usage

```tsx
import { SteppedProgress } from '@lockness/ui/components'

// Basic usage (2 of 4 steps completed)
<SteppedProgress value={2} steps={4} />

// With end label (percentage at the end)
<SteppedProgress value={2} steps={4} endLabel />

// With inner label (step X of Y inside the bar)
<SteppedProgress value={2} steps={4} innerLabel thickness={6} />

// With checkmark when complete
<SteppedProgress value={4} steps={4} variant="success" showCheck />
```

### Variants

```tsx
<SteppedProgress value={2} steps={4} />
<SteppedProgress value={2} steps={4} variant="success" />
<SteppedProgress value={2} steps={4} variant="warning" />
<SteppedProgress value={2} steps={4} variant="destructive" />
```

### Custom Thickness

```tsx
// Thickness in Tailwind spacing units (1 = 0.25rem)
<SteppedProgress value={2} steps={4} thickness={1} />
<SteppedProgress value={2} steps={4} thickness={4} />
```

### Striped Progress

```tsx
// Static stripes
<SteppedProgress value={3} steps={5} striped />

// Animated stripes
<SteppedProgress value={3} steps={5} striped animated />

// With variant
<SteppedProgress value={3} steps={5} striped animated variant="success" />
```

### Outlined Progress

```tsx
// Outlined wrapper around the bar
<SteppedProgress value={3} steps={5} outlined />

// Outlined with variant
<SteppedProgress value={4} steps={5} outlined variant="success" />

// Combine with striped and animated
<SteppedProgress value={8} steps={10} outlined striped animated variant="success" thickness={4} />
```

## Props

| Prop         | Type                                                   | Default     | Description                                      |
| ------------ | ------------------------------------------------------ | ----------- | ------------------------------------------------ |
| `value`      | `number`                                               | `0`         | Current step (1-based index)                     |
| `steps`      | `number`                                               | `4`         | Total number of steps                            |
| `variant`    | `'default' \| 'success' \| 'warning' \| 'destructive'` | `'default'` | Visual style variant                             |
| `thickness`  | `number`                                               | `2.5`       | Custom thickness in Tailwind spacing units       |
| `innerLabel` | `boolean`                                              | `false`     | Show label inside the progress bar (step X of Y) |
| `endLabel`   | `boolean`                                              | `false`     | Show percentage label at the end                 |
| `showCheck`  | `boolean`                                              | `false`     | Show checkmark icon when complete                |
| `striped`    | `boolean`                                              | `false`     | Display progress with diagonal stripes effect    |
| `animated`   | `boolean`                                              | `false`     | Animate the stripes (requires striped=true)      |
| `outlined`   | `boolean`                                              | `false`     | Add an outlined wrapper around the progress bar  |
| `class`      | `string`                                               | -           | Additional CSS class names                       |
| `id`         | `string`                                               | -           | Element id attribute                             |

## Variants

| Variant       | Description                                |
| ------------- | ------------------------------------------ |
| `default`     | Primary color (uses `--primary`)           |
| `success`     | Teal color for completed/successful states |
| `warning`     | Yellow color for warning states            |
| `destructive` | Red color for error/danger states          |

## CSS Variables

SteppedProgress uses the same CSS variables as Progress:

| Variable                           | Default                     | Description                        |
| ---------------------------------- | --------------------------- | ---------------------------------- |
| `--progress-border-radius`         | `var(--radius)`             | Border radius of each segment      |
| `--progress-outline-border-width`  | `2px`                       | Border width for outlined wrapper  |
| `--progress-outline-padding`       | `0.25rem`                   | Padding inside outlined wrapper    |
| `--progress-outline-border-radius` | `calc(var(--radius) + 4px)` | Border radius for outlined wrapper |
| `--progress-stripe-size`           | `1rem`                      | Size of diagonal stripes           |
| `--progress-animation-duration`    | `1s`                        | Duration of stripe animation       |

## Features

- **Segmented display** - Shows progress as discrete steps
- **Multiple label options** - Inner label or end label
- **Checkmark completion** - Optional checkmark when 100%
- **Striped effect** - Diagonal stripes with optional animation
- **Outlined wrapper** - Border wrapper with padding
- **Customizable thickness** - Control segment height
- **Fully customizable** - CSS variables for theming
- **Accessible** - Proper ARIA attributes for each segment
