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
| `sm`      | 5rem      |
| `default` | 8rem      |
| `lg`      | 10rem     |
| `xl`      | 12rem     |

## Features

- **SVG-based** - Crisp rendering at any size
- **Two gauge types** - 270° and 180° arcs
- **Custom colors** - Override variant with Tailwind classes
- **Customizable stroke** - Width and line cap options
- **Separate track width** - Different thickness for track vs progress
- **Multiple sizes** - 4 preset sizes
- **Multiple variants** - 4 color variants
- **Label support** - Value and custom label display
- **Accessible** - Proper ARIA attributes (`progressbar` role)
