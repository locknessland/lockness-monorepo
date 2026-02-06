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

## Gauge Types

### Full Gauge (270°)

The default gauge type displays a 270° arc.

```tsx
<GaugeProgress value={75} label='Score' />
```

### Half Circle (180°)

A semicircle gauge for a different visual style.

```tsx
<GaugeProgress value={75} type='half' label='Score' />
```

## Variants

| Variant       | Description                       |
| ------------- | --------------------------------- |
| `default`     | Primary color                     |
| `success`     | Teal color for positive states    |
| `warning`     | Yellow color for warning states   |
| `destructive` | Red color for error/danger states |

```tsx
<GaugeProgress value={60} label="Default" />
<GaugeProgress value={90} variant="success" label="Health" />
<GaugeProgress value={45} variant="warning" label="Warning" />
<GaugeProgress value={25} variant="destructive" label="Risk" />
```

## Sizes

| Size      | Dimension |
| --------- | --------- |
| `sm`      | 5rem      |
| `default` | 8rem      |
| `lg`      | 10rem     |
| `xl`      | 12rem     |

```tsx
<GaugeProgress value={60} size="sm" label="SM" />
<GaugeProgress value={60} size="default" label="Default" />
<GaugeProgress value={60} size="lg" label="LG" />
<GaugeProgress value={60} size="xl" label="XL" />
```

## Stroke Width

Customize the thickness of the progress arc.

```tsx
<GaugeProgress value={70} strokeWidth={1} label="Thin" />
<GaugeProgress value={70} strokeWidth={2} label="Medium" />
<GaugeProgress value={70} strokeWidth={3} label="Thick" />
```

### Independent Track Width

Set a different stroke width for the background track.

```tsx
<GaugeProgress value={50} strokeWidth={1} trackStrokeWidth={3} label="Thick track" />
<GaugeProgress value={75} strokeWidth={2} trackStrokeWidth={1} label="Thin track" />
```

## Stroke Line Cap

### Round (default)

Rounded stroke ends.

```tsx
<GaugeProgress value={25} strokeLinecap='round' />
```

### Butt

Flat/square stroke ends.

```tsx
<GaugeProgress value={25} strokeLinecap='butt' />
```

## Custom Colors

Override the variant colors with custom Tailwind classes.

```tsx
<GaugeProgress
    value={75}
    progressColor='text-purple-600 dark:text-purple-500'
    trackColor='text-purple-200 dark:text-neutral-700'
    label='Score'
/>
```

## Props

| Prop             | Type                                           | Default   | Description                                 |
| ---------------- | ---------------------------------------------- | --------- | ------------------------------------------- |
| value            | `number`                                       | `0`       | Current progress value (0-100)              |
| max              | `number`                                       | `100`     | Maximum value                               |
| type             | `gauge \| half`                                | `gauge`   | Gauge type: 270° arc or 180° half circle    |
| variant          | `default \| success \| warning \| destructive` | `default` | Visual style variant                        |
| size             | `sm \| default \| lg \| xl`                    | `default` | Size of the gauge                           |
| strokeWidth      | `number`                                       | `1.5`     | Stroke width of the progress arc            |
| trackStrokeWidth | `number`                                       | -         | Stroke width of the background track        |
| strokeLinecap    | `round \| butt \| square`                      | `round`   | Shape of the stroke ends                    |
| progressColor    | `string`                                       | -         | Custom color class for the progress arc     |
| trackColor       | `string`                                       | -         | Custom color class for the background track |
| showLabel        | `boolean`                                      | `true`    | Show the value label in the center          |
| label            | `string`                                       | -         | Custom label to display below the value     |
| class            | `string`                                       | -         | Additional CSS class names                  |
| id               | `string`                                       | -         | Element id attribute                        |

## Accessibility

The component includes proper ARIA attributes:

- `role="meter"` for semantic meaning
- `aria-valuenow` for the current value
- `aria-valuemin` and `aria-valuemax` for the range
- `aria-label` for screen reader description

## Examples

### Dashboard Metrics

```tsx
<div class='flex gap-8'>
    <GaugeProgress value={85} variant='success' label='Performance' />
    <GaugeProgress value={62} label='Progress' />
    <GaugeProgress value={23} variant='destructive' label='Errors' />
</div>
```

### Speed Indicator

```tsx
<GaugeProgress
    value={75}
    type='half'
    strokeWidth={2}
    progressColor='text-blue-500'
    trackColor='text-gray-200 dark:text-gray-700'
    label='mph'
/>
```

### Score Display

```tsx
<GaugeProgress
    value={92}
    size='xl'
    variant='success'
    label='Score'
/>
```
