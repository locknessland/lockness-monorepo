# Progress

A progress bar component for displaying completion status. Pure CSS
implementation with multiple variants, sizes, label positioning options, striped
effects, and outlined wrapper.

## Installation

```bash
deno run -A jsr:@lockness/ui add progress
```

## Usage

```tsx
import { Progress } from '@lockness/ui/components'

// Basic usage
<Progress value={50} />

// With label
<Progress value={75} showLabel />

// Success variant
<Progress value={100} variant="success" />

// Different sizes
<Progress value={30} size="sm" />
<Progress value={60} size="lg" />
```

### Label Options

```tsx
// Label above the bar (left-right layout)
<Progress value={50} showLabel />

// Floating label that follows the progress
<Progress value={50} floatingLabel />

// Label inside the bar
<Progress value={50} innerLabel size="lg" />

// Label at the end (right side)
<Progress value={50} endLabel />
```

### Vertical Progress

```tsx
<Progress value={50} vertical />
```

### Custom Thickness

```tsx
// Thickness in Tailwind spacing units (1 = 0.25rem)
<Progress value={50} thickness={6} />
<Progress value={50} vertical thickness={4} />
```

### Striped Progress

```tsx
// Static stripes
<Progress value={50} striped />

// Animated stripes
<Progress value={70} striped animated />

// With variant
<Progress value={80} striped animated variant="success" />
```

### Outlined Progress

```tsx
// Outlined wrapper around the bar
<Progress value={50} outlined />

// Outlined with variant
<Progress value={75} outlined variant="success" />

// Combine with striped and animated
<Progress value={80} outlined striped animated variant="success" />
```

## Props

| Prop            | Type                                                   | Default     | Description                                                 |
| --------------- | ------------------------------------------------------ | ----------- | ----------------------------------------------------------- |
| `value`         | `number`                                               | `0`         | Current progress value (0-100)                              |
| `max`           | `number`                                               | `100`       | Maximum value                                               |
| `variant`       | `'default' \| 'success' \| 'warning' \| 'destructive'` | `'default'` | Visual style variant                                        |
| `size`          | `'sm' \| 'default' \| 'lg'`                            | `'default'` | Size of the progress bar                                    |
| `showLabel`     | `boolean`                                              | `false`     | Show percentage label above the bar                         |
| `floatingLabel` | `boolean`                                              | `false`     | Show floating label that follows the progress               |
| `innerLabel`    | `boolean`                                              | `false`     | Show label inside the progress bar                          |
| `endLabel`      | `boolean`                                              | `false`     | Show label at the end (right side)                          |
| `vertical`      | `boolean`                                              | `false`     | Display progress bar vertically                             |
| `striped`       | `boolean`                                              | `false`     | Display progress with diagonal stripes effect               |
| `animated`      | `boolean`                                              | `false`     | Animate the stripes (requires striped=true)                 |
| `outlined`      | `boolean`                                              | `false`     | Add an outlined wrapper around the progress bar             |
| `thickness`     | `number`                                               | -           | Custom thickness in Tailwind spacing units (overrides size) |
| `class`         | `string`                                               | -           | Additional CSS class names                                  |
| `id`            | `string`                                               | -           | Element id attribute                                        |

## Variants

| Variant       | Description                                 |
| ------------- | ------------------------------------------- |
| `default`     | Primary color (uses `--primary`)            |
| `success`     | Green color for completed/successful states |
| `warning`     | Yellow color for warning states             |
| `destructive` | Red color for error/danger states           |

## Sizes

| Size      | Height        |
| --------- | ------------- |
| `sm`      | 0.25rem (h-1) |
| `default` | 0.5rem (h-2)  |
| `lg`      | 1rem (h-4)    |

## CSS Variables

| Variable                           | Default                     | Description                        |
| ---------------------------------- | --------------------------- | ---------------------------------- |
| `--progress-border-radius`         | `var(--radius)`             | Border radius of the bar           |
| `--progress-background`            | `var(--secondary)`          | Background color of the track      |
| `--progress-height-sm`             | `0.25rem`                   | Height for sm size                 |
| `--progress-height-default`        | `0.5rem`                    | Height for default size            |
| `--progress-height-lg`             | `1rem`                      | Height for lg size                 |
| `--progress-outline-border-width`  | `2px`                       | Border width for outlined wrapper  |
| `--progress-outline-padding`       | `0.25rem`                   | Padding inside outlined wrapper    |
| `--progress-outline-border-radius` | `calc(var(--radius) + 4px)` | Border radius for outlined wrapper |
| `--progress-stripe-size`           | `1rem`                      | Size of diagonal stripes           |
| `--progress-animation-duration`    | `1s`                        | Duration of stripe animation       |

## Theming

The Progress component can be customized using CSS variables. Override these
variables to match your design system.

### Available CSS Variables

| Variable                           | Default                     | Description                        |
| ---------------------------------- | --------------------------- | ---------------------------------- |
| `--progress-border-radius`         | `var(--radius)`             | Border radius of the bar           |
| `--progress-background`            | `var(--secondary)`          | Background color of the track      |
| `--progress-height-sm`             | `0.25rem`                   | Height for sm size                 |
| `--progress-height-default`        | `0.5rem`                    | Height for default size            |
| `--progress-height-lg`             | `1rem`                      | Height for lg size                 |
| `--progress-outline-border-width`  | `2px`                       | Border width for outlined wrapper  |
| `--progress-outline-padding`       | `0.25rem`                   | Padding inside outlined wrapper    |
| `--progress-outline-border-radius` | `calc(var(--radius) + 4px)` | Border radius for outlined wrapper |
| `--progress-stripe-size`           | `1rem`                      | Size of diagonal stripes           |
| `--progress-animation-duration`    | `1s`                        | Duration of stripe animation       |

### Theming Examples

#### Custom Heights

```css
:root {
    --progress-height-sm: 0.125rem; /* Thinner small size */
    --progress-height-default: 0.75rem; /* Thicker default */
    --progress-height-lg: 1.5rem; /* Larger large size */
}
```

#### Custom Border Radius

```css
:root {
    --progress-border-radius: 0; /* Square corners */
}

/* or */
:root {
    --progress-border-radius: 9999px; /* Fully rounded */
}
```

#### Custom Track Background

```css
:root {
    --progress-background: hsl(240 5% 85%); /* Custom gray */
}

.dark {
    --progress-background: hsl(240 5% 20%); /* Darker for dark mode */
}
```

#### Custom Outline Style

```css
:root {
    --progress-outline-border-width: 3px; /* Thicker border */
    --progress-outline-padding: 0.5rem; /* More padding */
    --progress-outline-border-radius: 1rem; /* More rounded */
}
```

#### Custom Stripe Animation

```css
:root {
    --progress-stripe-size: 1.5rem; /* Larger stripes */
    --progress-animation-duration: 2s; /* Slower animation */
}
```

#### Complete Custom Theme

```css
:root {
    /* Heights */
    --progress-height-sm: 0.25rem;
    --progress-height-default: 0.625rem;
    --progress-height-lg: 1.25rem;

    /* Appearance */
    --progress-border-radius: 0.5rem;
    --progress-background: hsl(210 40% 90%);

    /* Outline */
    --progress-outline-border-width: 1px;
    --progress-outline-padding: 0.375rem;
    --progress-outline-border-radius: 0.75rem;

    /* Stripes */
    --progress-stripe-size: 0.75rem;
    --progress-animation-duration: 1.5s;
}

.dark {
    --progress-background: hsl(210 40% 15%);
}
```

## Features

- **Pure CSS** - No JavaScript required
- **Smooth animations** - Animated transitions on value change
- **Multiple label options** - Above, floating, inner, or end position
- **Vertical support** - Can be displayed vertically
- **Custom thickness** - Override size with exact thickness
- **Striped effect** - Diagonal stripes with optional animation
- **Outlined wrapper** - Border wrapper with padding
- **Fully customizable** - CSS variables for theming
- **Accessible** - Proper ARIA attributes (`progressbar` role)
