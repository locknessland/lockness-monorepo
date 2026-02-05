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

## Theming

The Navbar component can be customized using CSS variables. This allows you to
change the appearance of the navigation bar, including its height, padding,
colors, and link styles globally or override specific instances.

### Available CSS Variables

| Variable                    | Default             | Description                         |
| --------------------------- | ------------------- | ----------------------------------- |
| `--navbar-height`           | `4rem`              | Height of the navbar                |
| `--navbar-padding-x`        | `1rem`              | Horizontal padding of the navbar    |
| `--navbar-padding-y`        | `0.75rem`           | Vertical padding of the navbar      |
| `--navbar-background`       | `var(--background)` | Background color of the navbar      |
| `--navbar-foreground`       | `var(--foreground)` | Text color of the navbar            |
| `--navbar-border-color`     | `var(--border)`     | Border color of the navbar          |
| `--navbar-link-padding-x`   | `0.75rem`           | Horizontal padding for navbar links |
| `--navbar-link-padding-y`   | `0.5rem`            | Vertical padding for navbar links   |
| `--navbar-link-font-weight` | `500`               | Font weight for navbar links        |

### Theming Examples

#### Global Customization

Customize all navbars by setting CSS variables in your theme:

```css
/* app/view/assets/app.css */
@theme {
    --navbar-height: 5rem;
    --navbar-padding-x: 2rem;
    --navbar-background: hsl(220 20% 10%);
    --navbar-foreground: hsl(0 0% 100%);
    --navbar-link-font-weight: 600;
}
```

#### Local Overrides

Override CSS variables for specific navbar instances:

```tsx
<div style='--navbar-height: 6rem; --navbar-background: hsl(200 50% 20%);'>
    <Navbar position='sticky'>
        <NavbarBrand href='/'>
            <span>My App</span>
        </NavbarBrand>
        <NavbarContent position='right'>
            <NavbarMenuItem href='/login'>Login</NavbarMenuItem>
        </NavbarContent>
    </Navbar>
</div>
```

#### Component-Specific Theming

Create themed sections with different navbar styles:

```tsx
<section class="dark-navbar">
    <style>
        .dark-navbar {
            --navbar-background: hsl(0 0% 10%);
            --navbar-foreground: hsl(0 0% 95%);
            --navbar-border-color: hsl(0 0% 20%);
            --navbar-link-padding-x: 1rem;
            --navbar-link-padding-y: 0.75rem;
        }
    </style>
    <Navbar position="sticky">
        <NavbarBrand href="/">Brand</NavbarBrand>
        <NavbarContent position="center">
            <NavbarMenuItem href="/docs">Docs</NavbarMenuItem>
            <NavbarMenuItem href="/about">About</NavbarMenuItem>
        </NavbarContent>
    </Navbar>
</section>
```

## Examples

### Basic Example

```tsx
// Add example here
```
