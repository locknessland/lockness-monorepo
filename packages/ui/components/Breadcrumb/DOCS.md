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

## Examples

### Basic Example

```tsx
// Add example here
```
