# Button

Flexible button component with multiple variants and sizes, featuring full
Unpoly integration for SPA-like navigation.

## Installation

```bash
deno run -A jsr:@lockness/ui add button
```

## Usage

```tsx
import { Button } from '@lockness/ui/components'

<Button variant="primary">Click me</Button>
```

## Variants

The Button component supports multiple visual styles:

- **primary**: Main action button (default)
- **secondary**: Secondary actions
- **outline**: Bordered with transparent background
- **ghost**: Minimal styling with hover effect
- **danger**: Destructive actions (delete, remove)

## Sizes

Available sizes for different use cases:

- **xl**: Extra large
- **lg**: Large
- **md**: Medium (default)
- **sm**: Small

## Unpoly Props

Props for configuring Unpoly behavior:

| Prop             | Type               | Description                        |
| ---------------- | ------------------ | ---------------------------------- |
| `href`           | `string`           | Renders as anchor with `up-follow` |
| `preload`        | `boolean`          | Preload page on hover              |
| `target`         | `UnpolyTarget`     | CSS selector to update             |
| `transition`     | `UnpolyTransition` | Transition animation               |
| `duration`       | `number`           | Transition duration in ms          |
| `easing`         | `UnpolyEasing`     | CSS timing function                |
| `failTransition` | `UnpolyTransition` | Transition on server error         |

## Transitions

Available Unpoly transitions:

| Value        | Description               |
| ------------ | ------------------------- |
| `cross-fade` | Simultaneous fade old/new |
| `move-left`  | Slide left (forward nav)  |
| `move-right` | Slide right (back nav)    |
| `move-up`    | Slide up                  |
| `move-down`  | Slide down                |
| `none`       | No animation              |

## Targets

Special selectors for the `target` prop:

| Value     | Description                   |
| --------- | ----------------------------- |
| `:main`   | Main content area             |
| `:layer`  | Current layer (modal, popup)  |
| `:origin` | Element that triggered action |
| `:none`   | No element (request only)     |

## Easing Functions

CSS timing functions for the `easing` prop:

| Value         | Description                |
| ------------- | -------------------------- |
| `linear`      | Constant speed             |
| `ease`        | Slow start, fast, slow end |
| `ease-in`     | Slow start                 |
| `ease-out`    | Slow end                   |
| `ease-in-out` | Slow start and end         |

## Examples

### Basic Buttons

```tsx
<Button variant="primary">Primary</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="danger">Delete</Button>
<Button disabled>Disabled</Button>
```

### Button Sizes

```tsx
<Button size="xl" variant="primary">Extra Large</Button>
<Button size="lg" variant="primary">Large</Button>
<Button size="md" variant="primary">Medium</Button>
<Button size="sm" variant="primary">Small</Button>
```

### Link Buttons with Unpoly

```tsx
<Button href="/users" target=":main">View Users</Button>
<Button href="/dashboard" preload transition="cross-fade">Dashboard</Button>
<Button href="/settings" target=".content" transition="move-left">Settings</Button>
```

### Custom Styling

```tsx
<Button class="w-full">Full Width</Button>
<Button variant="outline" class="border-2 border-primary">Custom Border</Button>
```
