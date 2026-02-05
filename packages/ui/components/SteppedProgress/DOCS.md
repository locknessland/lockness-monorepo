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

SteppedProgress uses the same CSS variables as Progress, plus additional
step-specific variables:

| Variable                              | Default                     | Description                        |
| ------------------------------------- | --------------------------- | ---------------------------------- |
| `--progress-border-radius`            | `var(--radius)`             | Border radius of each segment      |
| `--progress-outline-border-width`     | `2px`                       | Border width for outlined wrapper  |
| `--progress-outline-padding`          | `0.25rem`                   | Padding inside outlined wrapper    |
| `--progress-outline-border-radius`    | `calc(var(--radius) + 4px)` | Border radius for outlined wrapper |
| `--progress-stripe-size`              | `1rem`                      | Size of diagonal stripes           |
| `--progress-animation-duration`       | `1s`                        | Duration of stripe animation       |
| `--stepped-progress-step-size`        | `2rem`                      | Size of step indicators            |
| `--stepped-progress-step-font-size`   | `0.875rem`                  | Font size for step numbers         |
| `--stepped-progress-step-font-weight` | `600`                       | Font weight for step numbers       |
| `--stepped-progress-connector-height` | `2px`                       | Height of connecting line          |
| `--stepped-progress-connector-color`  | `var(--border)`             | Color of connecting line           |
| `--stepped-progress-active-color`     | `var(--primary)`            | Color of active step               |
| `--stepped-progress-inactive-color`   | `var(--muted)`              | Color of inactive steps            |
| `--stepped-progress-completed-color`  | `var(--primary)`            | Color of completed steps           |
| `--stepped-progress-label-font-size`  | `0.875rem`                  | Font size for step labels          |
| `--stepped-progress-label-margin-top` | `0.5rem`                    | Spacing above step labels          |

## Theming

The SteppedProgress component can be customized using CSS variables. Override
these variables to match your design system.

### Available CSS Variables

| Variable                              | Default                     | Description                        |
| ------------------------------------- | --------------------------- | ---------------------------------- |
| `--progress-border-radius`            | `var(--radius)`             | Border radius of each segment      |
| `--progress-outline-border-width`     | `2px`                       | Border width for outlined wrapper  |
| `--progress-outline-padding`          | `0.25rem`                   | Padding inside outlined wrapper    |
| `--progress-outline-border-radius`    | `calc(var(--radius) + 4px)` | Border radius for outlined wrapper |
| `--progress-stripe-size`              | `1rem`                      | Size of diagonal stripes           |
| `--progress-animation-duration`       | `1s`                        | Duration of stripe animation       |
| `--stepped-progress-step-size`        | `2rem`                      | Size of step indicators            |
| `--stepped-progress-step-font-size`   | `0.875rem`                  | Font size for step numbers         |
| `--stepped-progress-step-font-weight` | `600`                       | Font weight for step numbers       |
| `--stepped-progress-connector-height` | `2px`                       | Height of connecting line          |
| `--stepped-progress-connector-color`  | `var(--border)`             | Color of connecting line           |
| `--stepped-progress-active-color`     | `var(--primary)`            | Color of active step               |
| `--stepped-progress-inactive-color`   | `var(--muted)`              | Color of inactive steps            |
| `--stepped-progress-completed-color`  | `var(--primary)`            | Color of completed steps           |
| `--stepped-progress-label-font-size`  | `0.875rem`                  | Font size for step labels          |
| `--stepped-progress-label-margin-top` | `0.5rem`                    | Spacing above step labels          |

### Theming Examples

#### Custom Step Size and Typography

```css
:root {
    --stepped-progress-step-size: 2.5rem;
    --stepped-progress-step-font-size: 1rem;
    --stepped-progress-step-font-weight: 700;
}
```

#### Custom Connector Style

```css
:root {
    --stepped-progress-connector-height: 3px;
    --stepped-progress-connector-color: hsl(240 5% 80%);
}

.dark {
    --stepped-progress-connector-color: hsl(240 5% 30%);
}
```

#### Custom Step Colors

```css
:root {
    --stepped-progress-active-color: hsl(220 90% 56%);
    --stepped-progress-inactive-color: hsl(240 5% 65%);
    --stepped-progress-completed-color: hsl(142 76% 36%);
}

.dark {
    --stepped-progress-active-color: hsl(220 90% 66%);
    --stepped-progress-inactive-color: hsl(240 5% 45%);
    --stepped-progress-completed-color: hsl(142 76% 46%);
}
```

#### Custom Label Style

```css
:root {
    --stepped-progress-label-font-size: 1rem;
    --stepped-progress-label-margin-top: 0.75rem;
}
```

#### Complete Custom Theme

```css
:root {
    /* Segment styling */
    --progress-border-radius: 0.5rem;

    /* Outline styling */
    --progress-outline-border-width: 1px;
    --progress-outline-padding: 0.375rem;
    --progress-outline-border-radius: 0.75rem;

    /* Stripe styling */
    --progress-stripe-size: 0.75rem;
    --progress-animation-duration: 1.5s;

    /* Step indicators */
    --stepped-progress-step-size: 3rem;
    --stepped-progress-step-font-size: 1rem;
    --stepped-progress-step-font-weight: 700;

    /* Connector */
    --stepped-progress-connector-height: 3px;
    --stepped-progress-connector-color: hsl(210 40% 85%);

    /* Colors */
    --stepped-progress-active-color: hsl(262 83% 58%);
    --stepped-progress-inactive-color: hsl(240 5% 70%);
    --stepped-progress-completed-color: hsl(160 60% 45%);

    /* Labels */
    --stepped-progress-label-font-size: 1rem;
    --stepped-progress-label-margin-top: 1rem;
}

.dark {
    --stepped-progress-connector-color: hsl(210 40% 25%);
    --stepped-progress-active-color: hsl(262 83% 68%);
    --stepped-progress-inactive-color: hsl(240 5% 40%);
    --stepped-progress-completed-color: hsl(160 60% 55%);
}
```

## Features

- **Segmented display** - Shows progress as discrete steps
- **Multiple label options** - Inner label or end label
- **Checkmark completion** - Optional checkmark when 100%
- **Striped effect** - Diagonal stripes with optional animation
- **Outlined wrapper** - Border wrapper with padding
- **Customizable thickness** - Control segment height
- **Fully customizable** - CSS variables for theming
- **Accessible** - Proper ARIA attributes for each segment
