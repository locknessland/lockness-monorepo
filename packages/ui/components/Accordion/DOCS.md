# Accordion

A vertically stacked set of collapsible content sections. Uses native HTML
`<details>` and `<summary>` elements for accessibility and zero-JavaScript
functionality.

## Installation

```bash
deno run -A jsr:@lockness/ui add accordion
```

## Usage

```tsx
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@lockness/ui/components'

<Accordion>
  <AccordionItem value="item-1">
    <AccordionTrigger>Is it accessible?</AccordionTrigger>
    <AccordionContent>
      Yes. It adheres to the WAI-ARIA design pattern.
    </AccordionContent>
  </AccordionItem>
  <AccordionItem value="item-2">
    <AccordionTrigger>Is it styled?</AccordionTrigger>
    <AccordionContent>
      Yes. It comes with default styles using CSS variables.
    </AccordionContent>
  </AccordionItem>
</Accordion>
```

## Components

### Accordion

The root container component.

| Prop       | Type      | Default | Description                |
| ---------- | --------- | ------- | -------------------------- |
| `class`    | `string`  | -       | Additional CSS class names |
| `children` | `unknown` | -       | Accordion items            |

### AccordionItem

Individual collapsible section using the native `<details>` element.

| Prop       | Type      | Default      | Description                               |
| ---------- | --------- | ------------ | ----------------------------------------- |
| `value`    | `string`  | **required** | Unique identifier for this accordion item |
| `class`    | `string`  | -            | Additional CSS class names                |
| `children` | `unknown` | -            | Item content (trigger and content)        |

### AccordionTrigger

The clickable header using the native `<summary>` element. Includes a chevron
icon that rotates when expanded.

| Prop       | Type      | Default | Description                |
| ---------- | --------- | ------- | -------------------------- |
| `class`    | `string`  | -       | Additional CSS class names |
| `children` | `unknown` | -       | Trigger label content      |

### AccordionContent

The collapsible content panel.

| Prop       | Type      | Default | Description                      |
| ---------- | --------- | ------- | -------------------------------- |
| `class`    | `string`  | -       | Additional CSS class names       |
| `children` | `unknown` | -       | Content to display when expanded |

## Theming

The Accordion component can be customized using CSS variables. This allows you
to change the appearance of accordion items, triggers, and content globally or
override specific instances.

### Available CSS Variables

| Variable                               | Default         | Description                                |
| -------------------------------------- | --------------- | ------------------------------------------ |
| `--accordion-item-padding`             | `1rem`          | Padding for each accordion item            |
| `--accordion-trigger-font-size`        | `1rem`          | Font size for accordion trigger text       |
| `--accordion-trigger-font-weight`      | `500`           | Font weight for accordion trigger text     |
| `--accordion-content-padding-bottom`   | `1rem`          | Bottom padding for accordion content       |
| `--accordion-content-padding-top`      | `0`             | Top padding for accordion content          |
| `--accordion-content-font-size`        | `0.875rem`      | Font size for accordion content            |
| `--accordion-icon-transition-duration` | `200ms`         | Duration of the chevron rotation animation |
| `--accordion-border-color`             | `var(--border)` | Border color between accordion items       |

### Theming Examples

#### Global Customization

Customize all accordions by setting CSS variables in your theme:

```css
/* app/view/assets/app.css */
@theme {
    --accordion-item-padding: 1.5rem;
    --accordion-trigger-font-size: 1.125rem;
    --accordion-trigger-font-weight: 600;
    --accordion-content-font-size: 1rem;
    --accordion-icon-transition-duration: 300ms;
}
```

#### Local Overrides

Override CSS variables for specific accordion instances:

```tsx
<div style='--accordion-item-padding: 2rem; --accordion-trigger-font-weight: 700;'>
    <Accordion>
        <AccordionItem value='item-1'>
            <AccordionTrigger>Larger padding and bolder text</AccordionTrigger>
            <AccordionContent>
                This accordion has custom padding and trigger font weight.
            </AccordionContent>
        </AccordionItem>
    </Accordion>
</div>
```

#### Component-Specific Theming

Create themed sections with different accordion styles:

```tsx
<section class="compact-accordion">
    <style>
        .compact-accordion {
            --accordion-item-padding: 0.5rem;
            --accordion-trigger-font-size: 0.875rem;
            --accordion-content-font-size: 0.75rem;
            --accordion-content-padding-bottom: 0.5rem;
        }
    </style>
    <Accordion>
        <AccordionItem value="item-1">
            <AccordionTrigger>Compact Style</AccordionTrigger>
            <AccordionContent>
                This accordion uses a more compact styling.
            </AccordionContent>
        </AccordionItem>
    </Accordion>
</section>
```

## Features

- **Zero JavaScript** - Uses native HTML details/summary elements
- **Accessible** - Adheres to WAI-ARIA design patterns
- **Animated** - Chevron rotates on expand/collapse
- **Themeable** - Uses CSS variables for styling
