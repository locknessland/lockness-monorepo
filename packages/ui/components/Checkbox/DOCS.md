# Checkbox

Documentation for the Checkbox component.

## Installation

```bash
deno run -A jsr:@lockness/ui add checkbox
```

## Usage

```tsx
import { Checkbox, Label } from '@lockness/ui/components'

<div class="flex items-center space-x-2">
  <Checkbox id="terms" name="terms" />
  <Label for="terms">Accept terms and conditions</Label>
</div>
```

## Props

| Prop | Type | Default | Description |
| ---- | ---- | ------- | ----------- |
| TBD  | TBD  | TBD     | TBD         |

## Examples

### Basic Example

```tsx
// Add example here
```

## Theming

The Checkbox component can be fully customized using CSS variables. This allows
you to adjust size, colors, and border styling to match your design system while
maintaining consistent behavior and accessibility.

### Available CSS Variables

| Variable                   | Default                     | Description                           |
| -------------------------- | --------------------------- | ------------------------------------- |
| `--checkbox-size`          | `1rem`                      | Width and height of the checkbox      |
| `--checkbox-border-radius` | `calc(var(--radius) - 2px)` | Border radius of the checkbox corners |
| `--checkbox-border-color`  | `var(--primary)`            | Border color of the checkbox          |
| `--checkbox-accent-color`  | `var(--primary)`            | Accent color used for checked state   |

### Theming Examples

#### Global Customization

Add these styles to your `app.css` to customize all Checkbox components across
your application:

```css
:root {
    /* Larger checkbox */
    --checkbox-size: 1.25rem;

    /* More rounded corners */
    --checkbox-border-radius: 0.375rem;

    /* Custom brand colors */
    --checkbox-border-color: hsl(260 100% 60%);
    --checkbox-accent-color: hsl(260 100% 60%);
}
```

#### Local Overrides

Override theming for specific checkboxes using inline styles:

```tsx
{/* Large checkbox */}
<Checkbox
    id='large'
    style={{
        '--checkbox-size': '1.5rem',
        '--checkbox-border-radius': '0.25rem',
    }}
/>

{/* Circular checkbox with custom color */}
<Checkbox
    id='circular'
    style={{
        '--checkbox-size': '1.25rem',
        '--checkbox-border-radius': '9999px',
        '--checkbox-accent-color': 'hsl(160 60% 45%)',
        '--checkbox-border-color': 'hsl(160 60% 45%)',
    }}
/>

{/* Small compact checkbox */}
<Checkbox
    id='compact'
    style={{
        '--checkbox-size': '0.875rem',
        '--checkbox-border-radius': '0.125rem',
    }}
/>

{/* Colored checkbox variants */}
<div class='flex gap-4'>
    <Checkbox
        id='red'
        style={{
            '--checkbox-accent-color': 'hsl(0 72% 51%)',
            '--checkbox-border-color': 'hsl(0 72% 51%)',
        }}
    />
    <Checkbox
        id='blue'
        style={{
            '--checkbox-accent-color': 'hsl(221 83% 53%)',
            '--checkbox-border-color': 'hsl(221 83% 53%)',
        }}
    />
    <Checkbox
        id='green'
        style={{
            '--checkbox-accent-color': 'hsl(142 71% 45%)',
            '--checkbox-border-color': 'hsl(142 71% 45%)',
        }}
    />
</div>
```
