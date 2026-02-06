# Label

Documentation for the Label component.

## Installation

```bash
deno run -A jsr:@lockness/ui add label
```

## Usage

```tsx
import { Label } from '@lockness/ui/components'

<Label for="email">Email Address</Label>
<input type="email" id="email" />
```

## Props

| Prop | Type | Default | Description |
| ---- | ---- | ------- | ----------- |
| TBD  | TBD  | TBD     | TBD         |

## Theming

The Label component can be customized using CSS variables. This allows you to
change the appearance of form labels globally or override specific instances.

### Available CSS Variables

| Variable                   | Default    | Description                    |
| -------------------------- | ---------- | ------------------------------ |
| `--label-font-size`        | `0.875rem` | Font size for label text       |
| `--label-font-weight`      | `500`      | Font weight for label text     |
| `--label-line-height`      | `1`        | Line height for label text     |
| `--label-disabled-opacity` | `0.7`      | Opacity when label is disabled |

### Theming Examples

#### Global Customization

Customize all labels by setting CSS variables in your theme:

```css
/* app/view/assets/app.css */
@theme {
    --label-font-size: 1rem;
    --label-font-weight: 600;
    --label-line-height: 1.2;
}
```

#### Local Overrides

Override CSS variables for specific label instances:

```tsx
<div style='--label-font-size: 1.125rem; --label-font-weight: 700;'>
    <Label for='email'>Email Address</Label>
    <input type='email' id='email' />
</div>
```

#### Component-Specific Theming

Create themed sections with different label styles:

```tsx
<section class="bold-labels">
    <style>
        .bold-labels {
            --label-font-size: 1rem;
            --label-font-weight: 700;
            --label-line-height: 1.5;
        }
    </style>
    <Label for="username">Username</Label>
    <input type="text" id="username" />
</section>
```
