# Link

Documentation for the Link component.

## Installation

```bash
deno run -A jsr:@lockness/ui add link
```

## Usage

```tsx
import { Link } from '@lockness/ui/components'

<Link href="/dashboard">Go to Dashboard</Link>
<Link href="/settings" variant="primary">Settings</Link>
```

## Props

| Prop | Type | Default | Description |
| ---- | ---- | ------- | ----------- |
| TBD  | TBD  | TBD     | TBD         |

## Theming

The Link component can be customized using CSS variables. This allows you to
change the appearance of links and their variants globally or override specific
instances.

### Available CSS Variables

| Variable                            | Default                         | Description                                  |
| ----------------------------------- | ------------------------------- | -------------------------------------------- |
| `--link-primary-background`         | `var(--primary)`                | Background color for primary variant         |
| `--link-primary-background-hover`   | `var(--primary) / 0.9`          | Hover background color for primary variant   |
| `--link-primary-foreground`         | `var(--primary-foreground)`     | Text color for primary variant               |
| `--link-secondary-background`       | `var(--secondary)`              | Background color for secondary variant       |
| `--link-secondary-background-hover` | `var(--secondary) / 0.8`        | Hover background color for secondary variant |
| `--link-secondary-foreground`       | `var(--secondary-foreground)`   | Text color for secondary variant             |
| `--link-danger-background`          | `var(--destructive)`            | Background color for danger variant          |
| `--link-danger-background-hover`    | `var(--destructive) / 0.9`      | Hover background color for danger variant    |
| `--link-danger-foreground`          | `var(--destructive-foreground)` | Text color for danger variant                |
| `--link-default-color`              | `var(--foreground)`             | Text color for default link                  |
| `--link-default-underline-offset`   | `4px`                           | Underline offset for default link            |
| `--link-padding-x`                  | `1rem`                          | Horizontal padding for button-style links    |
| `--link-padding-y`                  | `0.5rem`                        | Vertical padding for button-style links      |
| `--link-border-radius`              | `var(--radius)`                 | Border radius for button-style links         |
| `--link-font-weight`                | `500`                           | Font weight for links                        |

### Theming Examples

#### Global Customization

Customize all links by setting CSS variables in your theme:

```css
/* app/view/assets/app.css */
@theme {
    --link-default-color: hsl(220 70% 50%);
    --link-default-underline-offset: 2px;
    --link-font-weight: 600;
    --link-padding-x: 1.5rem;
    --link-padding-y: 0.75rem;
}
```

#### Local Overrides

Override CSS variables for specific link instances:

```tsx
<div style='--link-primary-background: hsl(200 100% 40%); --link-padding-x: 2rem;'>
    <Link href='/dashboard' variant='primary'>Go to Dashboard</Link>
</div>
```

#### Component-Specific Theming

Create themed sections with different link styles:

```tsx
<section class="custom-links">
    <style>
        .custom-links {
            --link-primary-background: hsl(280 70% 50%);
            --link-primary-background-hover: hsl(280 70% 40%);
            --link-border-radius: 0.5rem;
            --link-font-weight: 700;
        }
    </style>
    <Link href="/settings" variant="primary">Settings</Link>
    <Link href="/help">Help Center</Link>
</section>
```

## Examples

### Basic Example

```tsx
// Add example here
```
