# Breadcrumb

Documentation for the Breadcrumb component.

## Installation

```bash
deno run -A jsr:@lockness/ui add breadcrumb
```

## Usage

```tsx
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@lockness/ui/components'

<Breadcrumb>
  <BreadcrumbList>
    <BreadcrumbItem>
      <BreadcrumbLink href="/">Home</BreadcrumbLink>
    </BreadcrumbItem>
    <BreadcrumbSeparator />
    <BreadcrumbItem>
      <BreadcrumbLink href="/docs">Docs</BreadcrumbLink>
    </BreadcrumbItem>
    <BreadcrumbSeparator />
    <BreadcrumbItem>
      <BreadcrumbPage>Current Page</BreadcrumbPage>
    </BreadcrumbItem>
  </BreadcrumbList>
</Breadcrumb>
```

## Props

### Breadcrumb

| Prop     | Type      | Default | Description                |
| -------- | --------- | ------- | -------------------------- |
| children | `unknown` | -       | Breadcrumb items           |
| class    | `string`  | -       | Additional CSS class names |

### BreadcrumbList

| Prop     | Type      | Default | Description                |
| -------- | --------- | ------- | -------------------------- |
| children | `unknown` | -       | List items                 |
| class    | `string`  | -       | Additional CSS class names |

### BreadcrumbItem

| Prop     | Type      | Default | Description                |
| -------- | --------- | ------- | -------------------------- |
| children | `unknown` | -       | Item content               |
| class    | `string`  | -       | Additional CSS class names |

### BreadcrumbLink

| Prop     | Type      | Default | Description                |
| -------- | --------- | ------- | -------------------------- |
| href     | `string`  | -       | Link href                  |
| children | `unknown` | -       | Link content               |
| class    | `string`  | -       | Additional CSS class names |

### BreadcrumbSeparator

| Prop     | Type      | Default | Description                |
| -------- | --------- | ------- | -------------------------- |
| children | `unknown` | `'/'`   | Separator content          |
| class    | `string`  | -       | Additional CSS class names |

### BreadcrumbPage

| Prop     | Type      | Default | Description                |
| -------- | --------- | ------- | -------------------------- |
| children | `unknown` | -       | Current page content       |
| class    | `string`  | -       | Additional CSS class names |

## Theming

The Breadcrumb component can be customized using CSS variables. This allows you
to change the appearance of breadcrumb navigation, links, separators, and the
current page globally or override specific instances.

### Available CSS Variables

| Variable                        | Default                   | Description                         |
| ------------------------------- | ------------------------- | ----------------------------------- |
| `--breadcrumb-gap`              | `0.5rem`                  | Gap between breadcrumb items        |
| `--breadcrumb-font-size`        | `0.875rem`                | Font size for breadcrumb text       |
| `--breadcrumb-separator-color`  | `var(--muted-foreground)` | Color of the separator              |
| `--breadcrumb-link-color`       | `var(--foreground)`       | Color of breadcrumb links           |
| `--breadcrumb-link-hover-color` | `var(--foreground)`       | Color of breadcrumb links on hover  |
| `--breadcrumb-current-color`    | `var(--foreground)`       | Color of the current page indicator |

### Theming Examples

#### Global Customization

Customize all breadcrumbs by setting CSS variables in your theme:

```css
/* app/view/assets/app.css */
@theme {
    --breadcrumb-gap: 0.75rem;
    --breadcrumb-font-size: 1rem;
    --breadcrumb-link-color: hsl(220 70% 50%);
    --breadcrumb-link-hover-color: hsl(220 70% 40%);
}
```

#### Local Overrides

Override CSS variables for specific breadcrumb instances:

```tsx
<div style='--breadcrumb-font-size: 1rem; --breadcrumb-gap: 1rem;'>
    <Breadcrumb>
        <BreadcrumbList>
            <BreadcrumbItem>
                <BreadcrumbLink href='/'>Home</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
                <BreadcrumbPage>Current</BreadcrumbPage>
            </BreadcrumbItem>
        </BreadcrumbList>
    </Breadcrumb>
</div>
```

#### Component-Specific Theming

Create themed sections with different breadcrumb styles:

```tsx
<section class="large-breadcrumb">
    <style>
        .large-breadcrumb {
            --breadcrumb-font-size: 1.125rem;
            --breadcrumb-gap: 1rem;
            --breadcrumb-link-color: hsl(200 100% 40%);
            --breadcrumb-link-hover-color: hsl(200 100% 30%);
            --breadcrumb-separator-color: hsl(200 50% 50%);
        }
    </style>
    <Breadcrumb>
        <BreadcrumbList>
            <BreadcrumbItem>
                <BreadcrumbLink href="/">Home</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
                <BreadcrumbPage>Current</BreadcrumbPage>
            </BreadcrumbItem>
        </BreadcrumbList>
    </Breadcrumb>
</section>
```
