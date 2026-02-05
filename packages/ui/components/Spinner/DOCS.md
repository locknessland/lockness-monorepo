# Spinner

Animated loading spinner indicator. Uses CSS animations with a rotating circle
and multiple size and color variants.

## Installation

```bash
deno run -A jsr:@lockness/ui add spinner
```

## Usage

```tsx
import { Spinner } from '@lockness/ui/components'

<Spinner />
```

## Props

| Prop    | Type                                                                                       | Default     | Description                           |
| ------- | ------------------------------------------------------------------------------------------ | ----------- | ------------------------------------- |
| size    | `'sm' \| 'md' \| 'lg' \| 'xl'`                                                             | `'md'`      | Size of the spinner                   |
| variant | `'primary' \| 'secondary' \| 'muted' \| 'destructive' \| 'success' \| 'warning' \| 'info'` | `'primary'` | Color variant                         |
| label   | `string`                                                                                   | `'Loading'` | Screen reader label for accessibility |
| class   | `string`                                                                                   | -           | Additional CSS class names            |
| id      | `string`                                                                                   | -           | Element id attribute                  |

## Sizes

### Small (sm)

```tsx
<Spinner size='sm' /> // 16px with 2px border
```

### Medium (md) - Default

```tsx
<Spinner size='md' /> // 24px with 3px border
```

### Large (lg)

```tsx
<Spinner size='lg' /> // 32px with 3px border
```

### Extra Large (xl)

```tsx
<Spinner size='xl' /> // 48px with 4px border
```

### All Sizes

```tsx
<div class='flex items-center gap-4'>
    <Spinner size='sm' />
    <Spinner size='md' />
    <Spinner size='lg' />
    <Spinner size='xl' />
</div>
```

## Variants

### Primary (default)

Uses the primary theme color.

```tsx
<Spinner variant='primary' />
```

### Secondary

Uses the secondary foreground color.

```tsx
<Spinner variant='secondary' />
```

### Muted

Uses the muted foreground color for subtle loading indicators.

```tsx
<Spinner variant='muted' />
```

### Destructive

Red color for error or critical loading states.

```tsx
<Spinner variant='destructive' />
```

### Success

Green color for success-related loading states.

```tsx
<Spinner variant='success' />
```

### Warning

Yellow/amber color for warning-related loading states.

```tsx
<Spinner variant='warning' />
```

### Info

Blue color for informational loading states.

```tsx
<Spinner variant='info' />
```

### All Variants

```tsx
<div class='flex items-center gap-4'>
    <Spinner variant='primary' />
    <Spinner variant='secondary' />
    <Spinner variant='muted' />
    <Spinner variant='destructive' />
    <Spinner variant='success' />
    <Spinner variant='warning' />
    <Spinner variant='info' />
</div>
```

## Accessibility

The Spinner includes proper ARIA attributes for screen readers:

- `role="status"` announces the loading state
- `aria-label` provides a descriptive label (customizable via `label` prop)
- Hidden text content for screen readers

```tsx
// Custom accessibility label
<Spinner label="Saving your changes" />
<Spinner label="Processing payment" />
```

## Examples

### Loading Button

```tsx
<Button disabled>
    <Spinner size='sm' class='mr-2' />
    Loading...
</Button>
```

### Page Loading State

```tsx
<div class='flex items-center justify-center min-h-screen'>
    <div class='text-center'>
        <Spinner size='xl' />
        <p class='mt-4 text-muted-foreground'>Loading your content...</p>
    </div>
</div>
```

### Inline Loading

```tsx
<p class='flex items-center gap-2'>
    <Spinner size='sm' variant='muted' />
    Updating...
</p>
```

### Card Loading State

```tsx
<Card>
    <CardContent class='flex items-center justify-center py-12'>
        <Spinner size='lg' />
    </CardContent>
</Card>
```

## Theming

The Spinner component can be customized using CSS variables. This allows you to
change the appearance of spinners, including size, colors, border width, and
animation duration globally or override specific instances.

### Available CSS Variables

| Variable                       | Default            | Description                          |
| ------------------------------ | ------------------ | ------------------------------------ |
| `--spinner-size-sm`            | `1rem`             | Size for small spinner               |
| `--spinner-size-md`            | `1.5rem`           | Size for medium spinner              |
| `--spinner-size-lg`            | `2rem`             | Size for large spinner               |
| `--spinner-size-xl`            | `3rem`             | Size for extra large spinner         |
| `--spinner-border-width-sm`    | `2px`              | Border width for small spinner       |
| `--spinner-border-width-md`    | `3px`              | Border width for medium spinner      |
| `--spinner-border-width-lg`    | `3px`              | Border width for large spinner       |
| `--spinner-border-width-xl`    | `4px`              | Border width for extra large spinner |
| `--spinner-default-color`      | `var(--primary)`   | Default spinner color                |
| `--spinner-success-color`      | `hsl(142 76% 36%)` | Success variant color                |
| `--spinner-warning-color`      | `hsl(38 92% 50%)`  | Warning variant color                |
| `--spinner-info-color`         | `hsl(221 83% 53%)` | Info variant color                   |
| `--spinner-animation-duration` | `0.75s`            | Duration of the rotation animation   |

### Theming Examples

#### Global Customization

Customize all spinners by setting CSS variables in your theme:

```css
/* app/view/assets/app.css */
@theme {
    --spinner-size-md: 2rem;
    --spinner-border-width-md: 4px;
    --spinner-default-color: hsl(280 70% 50%);
    --spinner-animation-duration: 1s;
}
```

#### Local Overrides

Override CSS variables for specific spinner instances:

```tsx
<div style='--spinner-size-md: 3rem; --spinner-border-width-md: 5px;'>
    <Spinner size='md' />
</div>
```

#### Component-Specific Theming

Create themed sections with different spinner styles:

```tsx
<section class="fast-spinners">
    <style>
        .fast-spinners {
            --spinner-animation-duration: 0.5s;
            --spinner-default-color: hsl(200 100% 50%);
            --spinner-border-width-sm: 3px;
            --spinner-border-width-md: 4px;
            --spinner-border-width-lg: 5px;
        }
    </style>
    <div class="flex items-center gap-4">
        <Spinner size="sm" />
        <Spinner size="md" />
        <Spinner size="lg" />
    </div>
</section>
```

## Styling

The spinner uses a CSS keyframe animation for smooth rotation:

```css
@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}
```

Customize with additional classes:

```tsx
// Slower animation
<Spinner class="[animation-duration:2s]" />

// Custom size
<Spinner class="size-20 border-8" />
```
