# Navbar

Documentation for the Navbar component.

## Installation

```bash
deno run -A jsr:@lockness/ui add navbar
```

## Usage

```tsx
import {
  Navbar,
  NavbarBrand,
  NavbarContent,
  NavbarMenuItem
} from '@lockness/ui/components'

<Navbar position="sticky">
  <NavbarBrand href="/">
    <span>My App</span>
  </NavbarBrand>
  <NavbarContent position="center">
    <NavbarMenuItem href="/docs">Docs</NavbarMenuItem>
    <NavbarMenuItem href="/about">About</NavbarMenuItem>
  </NavbarContent>
  <NavbarContent position="right">
    <NavbarMenuItem href="/login">Login</NavbarMenuItem>
  </NavbarContent>
</Navbar>
```

## Props

### Navbar

| Prop     | Type                              | Default    | Description            |
| -------- | --------------------------------- | ---------- | ---------------------- |
| class    | `string`                          | -          | Additional CSS classes |
| children | `unknown`                         | -          | Navbar content         |
| position | `'sticky' \| 'fixed' \| 'static'` | `'sticky'` | Position type          |

### NavbarBrand

| Prop     | Type      | Default | Description                      |
| -------- | --------- | ------- | -------------------------------- |
| class    | `string`  | -       | Additional CSS classes           |
| children | `unknown` | -       | Brand content (logo, text, etc.) |
| href     | `string`  | `'/'`   | Link href                        |

### NavbarContent

| Prop     | Type                            | Default    | Description            |
| -------- | ------------------------------- | ---------- | ---------------------- |
| class    | `string`                        | -          | Additional CSS classes |
| children | `unknown`                       | -          | Content items          |
| position | `'left' \| 'center' \| 'right'` | `'center'` | Position               |

### NavbarMenu

| Prop     | Type      | Default | Description            |
| -------- | --------- | ------- | ---------------------- |
| class    | `string`  | -       | Additional CSS classes |
| children | `unknown` | -       | Menu items             |
| open     | `boolean` | -       | Open state             |

### NavbarMenuItem

| Prop     | Type      | Default | Description            |
| -------- | --------- | ------- | ---------------------- |
| class    | `string`  | -       | Additional CSS classes |
| children | `unknown` | -       | Item content           |
| href     | `string`  | -       | Link href              |
| active   | `boolean` | -       | Active state           |

### NavbarToggle

| Prop    | Type         | Default | Description            |
| ------- | ------------ | ------- | ---------------------- |
| class   | `string`     | -       | Additional CSS classes |
| onClick | `() => void` | -       | Toggle callback        |
| open    | `boolean`    | -       | Open state             |

## Examples

### Basic Example

```tsx
// Add example here
```
