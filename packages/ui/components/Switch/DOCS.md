# Switch

Documentation for the Switch component.

## Installation

```bash
deno run -A jsr:@lockness/ui add switch
```

## Usage

```tsx
import { Switch, Label } from '@lockness/ui/components'

<div class="flex items-center space-x-2">
  <Switch id="notifications" name="notifications" />
  <Label for="notifications">Enable notifications</Label>
</div>
```

## Props

| Prop | Type | Default | Description |
| ---- | ---- | ------- | ----------- |
| TBD  | TBD  | TBD     | TBD         |

## Theming

The Switch component can be customized using CSS variables. This allows you to
change the appearance of toggle switches, including size, colors, and animation
globally or override specific instances.

### Available CSS Variables

| Variable                       | Default             | Description                      |
| ------------------------------ | ------------------- | -------------------------------- |
| `--switch-width`               | `2.75rem`           | Width of the switch              |
| `--switch-height`              | `1.5rem`            | Height of the switch             |
| `--switch-knob-size`           | `1.25rem`           | Size of the switch knob          |
| `--switch-knob-offset`         | `0.125rem`          | Offset of the knob from the edge |
| `--switch-border-radius`       | `9999px`            | Border radius for rounded switch |
| `--switch-background`          | `var(--input)`      | Background color when unchecked  |
| `--switch-background-checked`  | `var(--primary)`    | Background color when checked    |
| `--switch-knob-background`     | `var(--background)` | Background color of the knob     |
| `--switch-transition-duration` | `200ms`             | Duration of the toggle animation |

### Theming Examples

#### Global Customization

Customize all switches by setting CSS variables in your theme:

```css
/* app/view/assets/app.css */
@theme {
    --switch-width: 3rem;
    --switch-height: 1.75rem;
    --switch-knob-size: 1.5rem;
    --switch-background-checked: hsl(142 76% 36%);
    --switch-transition-duration: 300ms;
}
```

#### Local Overrides

Override CSS variables for specific switch instances:

```tsx
<div style='--switch-background-checked: hsl(280 70% 50%); --switch-width: 3.5rem;'>
    <div class='flex items-center space-x-2'>
        <Switch id='custom' name='custom' />
        <Label for='custom'>Custom styled switch</Label>
    </div>
</div>
```

#### Component-Specific Theming

Create themed sections with different switch styles:

```tsx
<section class="large-switches">
    <style>
        .large-switches {
            --switch-width: 4rem;
            --switch-height: 2rem;
            --switch-knob-size: 1.75rem;
            --switch-knob-offset: 0.125rem;
            --switch-background: hsl(220 20% 90%);
            --switch-background-checked: hsl(200 100% 40%);
        }
    </style>
    <div class="flex items-center space-x-2">
        <Switch id="large" name="large" />
        <Label for="large">Large switch</Label>
    </div>
</section>
```

## Examples

### Basic Example

```tsx
// Add example here
```
