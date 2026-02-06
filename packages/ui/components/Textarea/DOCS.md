# Textarea

Documentation for the Textarea component.

## Installation

```bash
deno run -A jsr:@lockness/ui add textarea
```

## Usage

```tsx
import { Textarea, Label } from '@lockness/ui/components'

<Label for="message">Message</Label>
<Textarea id="message" rows={5} placeholder="Enter your message..." />
```

## Props

| Prop | Type | Default | Description |
| ---- | ---- | ------- | ----------- |
| TBD  | TBD  | TBD     | TBD         |

## Examples

## Theming

The Textarea component can be fully customized using CSS variables. This allows
you to adjust dimensions, colors, spacing, and borders to match your design
system while maintaining consistent behavior across your application.

### Available CSS Variables

| Variable                   | Default             | Description                            |
| -------------------------- | ------------------- | -------------------------------------- |
| `--textarea-min-height`    | `5rem`              | Minimum height of the textarea         |
| `--textarea-padding-x`     | `0.75rem`           | Horizontal padding inside the textarea |
| `--textarea-padding-y`     | `0.5rem`            | Vertical padding inside the textarea   |
| `--textarea-font-size`     | `0.875rem`          | Font size of the textarea text         |
| `--textarea-border-radius` | `var(--radius)`     | Border radius of the textarea corners  |
| `--textarea-border-color`  | `var(--input)`      | Border color of the textarea           |
| `--textarea-background`    | `var(--background)` | Background color of the textarea       |

### Theming Examples

#### Global Customization

Add these styles to your `app.css` to customize all Textarea components across
your application:

```css
:root {
    /* Larger textarea with more padding */
    --textarea-min-height: 8rem;
    --textarea-padding-x: 1rem;
    --textarea-padding-y: 0.75rem;
    --textarea-font-size: 1rem;

    /* Custom border styling */
    --textarea-border-radius: 0.5rem;
    --textarea-border-color: hsl(210 40% 80%);

    /* Dark mode theme */
    --textarea-background: hsl(222 47% 11%);
}
```

#### Local Overrides

Override theming for specific textareas using inline styles:

```tsx
{/* Compact textarea */}
<Textarea
    placeholder='Compact message'
    style={{
        '--textarea-min-height': '3rem',
        '--textarea-padding-x': '0.5rem',
        '--textarea-padding-y': '0.5rem',
        '--textarea-font-size': '0.75rem',
    }}
/>

{/* Large textarea with custom colors */}
<Textarea
    placeholder='Large comment area'
    style={{
        '--textarea-min-height': '12rem',
        '--textarea-padding-x': '1.25rem',
        '--textarea-padding-y': '1rem',
        '--textarea-font-size': '1.125rem',
        '--textarea-border-color': 'hsl(260 100% 70%)',
        '--textarea-background': 'hsl(260 100% 95%)',
    }}
/>

{/* Code-style textarea */}
<Textarea
    placeholder='Enter code...'
    style={{
        '--textarea-min-height': '10rem',
        '--textarea-padding-x': '1rem',
        '--textarea-padding-y': '1rem',
        '--textarea-font-size': '0.875rem',
        '--textarea-border-radius': '0.25rem',
        '--textarea-background': 'hsl(0 0% 5%)',
    }}
/>
```
