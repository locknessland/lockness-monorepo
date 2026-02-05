# GaugeProgress

A gauge/dial progress component for displaying metrics like scores, performance
indicators, or completion status. SVG-based with 270° and 180° arc types.

## Installation

```bash
deno run -A jsr:@lockness/ui add gaugeprogress
```

## Usage

```tsx
import { GaugeProgress } from '@lockness/ui/components'

// Basic gauge (270°)
<GaugeProgress value={50} />

// With label
<GaugeProgress value={75} label="Score" />

// Half circle gauge (180°)
<GaugeProgress value={75} type="half" label="Score" />

// Different variants
<GaugeProgress value={90} variant="success" label="Health" />
<GaugeProgress value={30} variant="destructive" label="Risk" />
```

### Gauge Types

```tsx
// 270° gauge (default)
<GaugeProgress value={75} label="Score" />

// 180° half circle
<GaugeProgress value={75} type="half" label="Score" />
```

### Custom Stroke Width

```tsx
<GaugeProgress value={70} strokeWidth={1} />
<GaugeProgress value={70} strokeWidth={3} />

// Different track stroke width
<GaugeProgress value={50} strokeWidth={1} trackStrokeWidth={3} />
```

### Custom Colors

```tsx
// Override variant with custom colors
<GaugeProgress
    value={75}
    progressColor='text-purple-600 dark:text-purple-500'
    trackColor='text-purple-200 dark:text-neutral-700'
/>
```

### Stroke Line Cap

```tsx
// Rounded ends (default)
<GaugeProgress value={25} strokeLinecap="round" />

// Flat ends
<GaugeProgress value={25} strokeLinecap="butt" />
```

## Props

| Prop               | Type                                                   | Default     | Description                                 |
| ------------------ | ------------------------------------------------------ | ----------- | ------------------------------------------- |
| `value`            | `number`                                               | `0`         | Current progress value (0-100)              |
| `max`              | `number`                                               | `100`       | Maximum value                               |
| `type`             | `'gauge' \| 'half'`                                    | `'gauge'`   | Gauge type: 270° arc or 180° half circle    |
| `variant`          | `'default' \| 'success' \| 'warning' \| 'destructive'` | `'default'` | Visual style variant                        |
| `size`             | `'sm' \| 'default' \| 'lg' \| 'xl'`                    | `'default'` | Size of the gauge                           |
| `strokeWidth`      | `number`                                               | `1.5`       | Stroke width of the progress arc            |
| `trackStrokeWidth` | `number`                                               | -           | Stroke width of the background track        |
| `strokeLinecap`    | `'round' \| 'butt' \| 'square'`                        | `'round'`   | Shape of the stroke ends                    |
| `progressColor`    | `string`                                               | -           | Custom color class for the progress arc     |
| `trackColor`       | `string`                                               | -           | Custom color class for the background track |
| `showLabel`        | `boolean`                                              | `true`      | Show the value label in the center          |
| `label`            | `string`                                               | -           | Custom label to display below the value     |
| `class`            | `string`                                               | -           | Additional CSS class names                  |
| `id`               | `string`                                               | -           | Element id attribute                        |

## Variants

| Variant       | Description                       |
| ------------- | --------------------------------- |
| `default`     | Primary color (uses `--primary`)  |
| `success`     | Teal color for positive states    |
| `warning`     | Yellow color for warning states   |
| `destructive` | Red color for error/danger states |

## Sizes

| Size      | Dimension |
| --------- | --------- |
| `sm`      | 6rem      |
| `default` | 8rem      |
| `lg`      | 12rem     |
| `xl`      | 16rem     |

## Theming

The GaugeProgress component can be customized using CSS variables. Override
these variables to match your design system.

### Available CSS Variables

| Variable                                 | Default            | Description                      |
| ---------------------------------------- | ------------------ | -------------------------------- |
| `--gauge-progress-size-sm`               | `6rem`             | Size for sm variant              |
| `--gauge-progress-size-md`               | `8rem`             | Size for default/md variant      |
| `--gauge-progress-size-lg`               | `12rem`            | Size for lg variant              |
| `--gauge-progress-size-xl`               | `16rem`            | Size for xl variant              |
| `--gauge-progress-stroke-width-sm`       | `8`                | Stroke width for sm size         |
| `--gauge-progress-stroke-width-md`       | `10`               | Stroke width for default/md size |
| `--gauge-progress-stroke-width-lg`       | `12`               | Stroke width for lg size         |
| `--gauge-progress-stroke-width-xl`       | `14`               | Stroke width for xl size         |
| `--gauge-progress-track-color`           | `var(--secondary)` | Background track color           |
| `--gauge-progress-indicator-color`       | `var(--primary)`   | Progress indicator color         |
| `--gauge-progress-label-font-size-sm`    | `1.5rem`           | Value label size for sm variant  |
| `--gauge-progress-label-font-size-md`    | `2rem`             | Value label size for md variant  |
| `--gauge-progress-label-font-size-lg`    | `2.5rem`           | Value label size for lg variant  |
| `--gauge-progress-label-font-size-xl`    | `3rem`             | Value label size for xl variant  |
| `--gauge-progress-sublabel-font-size-sm` | `0.75rem`          | Sub-label size for sm variant    |
| `--gauge-progress-sublabel-font-size-md` | `0.875rem`         | Sub-label size for md variant    |
| `--gauge-progress-sublabel-font-size-lg` | `1rem`             | Sub-label size for lg variant    |
| `--gauge-progress-sublabel-font-size-xl` | `1.125rem`         | Sub-label size for xl variant    |

### Theming Examples

#### Custom Sizes

```css
:root {
    --gauge-progress-size-sm: 7rem;
    --gauge-progress-size-md: 10rem;
    --gauge-progress-size-lg: 14rem;
    --gauge-progress-size-xl: 18rem;
}
```

#### Custom Stroke Widths

```css
:root {
    --gauge-progress-stroke-width-sm: 6;
    --gauge-progress-stroke-width-md: 8;
    --gauge-progress-stroke-width-lg: 10;
    --gauge-progress-stroke-width-xl: 12;
}
```

#### Custom Colors

```css
:root {
    --gauge-progress-track-color: hsl(240 5% 85%);
    --gauge-progress-indicator-color: hsl(142 76% 36%);
}

.dark {
    --gauge-progress-track-color: hsl(240 5% 20%);
    --gauge-progress-indicator-color: hsl(142 76% 46%);
}
```

#### Custom Label Sizes

```css
:root {
    /* Main value labels */
    --gauge-progress-label-font-size-sm: 1.25rem;
    --gauge-progress-label-font-size-md: 1.75rem;
    --gauge-progress-label-font-size-lg: 2.25rem;
    --gauge-progress-label-font-size-xl: 2.75rem;

    /* Sub-labels */
    --gauge-progress-sublabel-font-size-sm: 0.625rem;
    --gauge-progress-sublabel-font-size-md: 0.75rem;
    --gauge-progress-sublabel-font-size-lg: 0.875rem;
    --gauge-progress-sublabel-font-size-xl: 1rem;
}
```

#### Complete Custom Theme

```css
:root {
    /* Sizes */
    --gauge-progress-size-sm: 7rem;
    --gauge-progress-size-md: 10rem;
    --gauge-progress-size-lg: 15rem;
    --gauge-progress-size-xl: 20rem;

    /* Stroke widths */
    --gauge-progress-stroke-width-sm: 7;
    --gauge-progress-stroke-width-md: 9;
    --gauge-progress-stroke-width-lg: 11;
    --gauge-progress-stroke-width-xl: 13;

    /* Colors */
    --gauge-progress-track-color: hsl(210 40% 90%);
    --gauge-progress-indicator-color: hsl(160 60% 45%);

    /* Main labels */
    --gauge-progress-label-font-size-sm: 1.5rem;
    --gauge-progress-label-font-size-md: 2.25rem;
    --gauge-progress-label-font-size-lg: 3rem;
    --gauge-progress-label-font-size-xl: 3.75rem;

    /* Sub-labels */
    --gauge-progress-sublabel-font-size-sm: 0.75rem;
    --gauge-progress-sublabel-font-size-md: 1rem;
    --gauge-progress-sublabel-font-size-lg: 1.25rem;
    --gauge-progress-sublabel-font-size-xl: 1.5rem;
}

.dark {
    --gauge-progress-track-color: hsl(210 40% 15%);
    --gauge-progress-indicator-color: hsl(160 60% 55%);
}
```

## Features

- **SVG-based** - Crisp rendering at any size
- **Two gauge types** - 270° and 180° arcs
- **Custom colors** - Override variant with Tailwind classes
- **Customizable stroke** - Width and line cap options
- **Separate track width** - Different thickness for track vs progress
- **Multiple sizes** - 4 preset sizes
- **Multiple variants** - 4 color variants
- **Label support** - Value and custom label display
- **Fully customizable** - CSS variables for theming
- **Accessible** - Proper ARIA attributes (`progressbar` role)
