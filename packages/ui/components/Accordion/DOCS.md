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

## CSS Variables

| Variable   | Description                          |
| ---------- | ------------------------------------ |
| `--border` | Border color between accordion items |

## Features

- **Zero JavaScript** - Uses native HTML details/summary elements
- **Accessible** - Adheres to WAI-ARIA design patterns
- **Animated** - Chevron rotates on expand/collapse
- **Themeable** - Uses CSS variables for styling
