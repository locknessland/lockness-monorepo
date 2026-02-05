# Pagination

Documentation for the Pagination component.

## Installation

```bash
deno run -A jsr:@lockness/ui add pagination
```

## Usage

```tsx
import { Pagination } from '@lockness/ui/components'

<Pagination
    currentPage={5}
    totalPages={10}
    baseUrl='/users'
/>
```

## Props

### Pagination

| Prop          | Type      | Default      | Description                                                  |
| ------------- | --------- | ------------ | ------------------------------------------------------------ |
| currentPage   | `number`  | **required** | Current page number (1-indexed)                              |
| totalPages    | `number`  | **required** | Total number of pages                                        |
| baseUrl       | `string`  | **required** | Base URL for pagination links (page number will be appended) |
| pageParam     | `string`  | `'page'`     | Query parameter name for page                                |
| siblingCount  | `number`  | -            | Number of page numbers to show around current page           |
| showFirstLast | `boolean` | -            | Show first/last page buttons                                 |
| class         | `string`  | -            | Additional CSS classes                                       |
| up-target     | `string`  | -            | Unpoly target selector                                       |
| up-preload    | `boolean` | -            | Enable Unpoly preload on hover                               |
| up-transition | `string`  | -            | Unpoly transition                                            |

### PaginationItem

| Prop          | Type      | Default | Description            |
| ------------- | --------- | ------- | ---------------------- |
| href          | `string`  | -       | Link href              |
| isActive      | `boolean` | `false` | Is current page        |
| disabled      | `boolean` | `false` | Is disabled            |
| class         | `string`  | -       | Additional CSS classes |
| children      | `unknown` | -       | Item content           |
| up-target     | `string`  | -       | Unpoly target selector |
| up-preload    | `boolean` | -       | Enable Unpoly preload  |
| up-transition | `string`  | -       | Unpoly transition      |

## Theming

The Pagination component can be customized using CSS variables. This allows you
to change the appearance of pagination globally or override specific instances.

### Available CSS Variables

| Variable                              | Default                     | Description                              |
| ------------------------------------- | --------------------------- | ---------------------------------------- |
| `--pagination-gap`                    | `0.25rem`                   | Gap between pagination items             |
| `--pagination-item-size`              | `2.5rem`                    | Width and height of pagination items     |
| `--pagination-item-font-size`         | `0.875rem`                  | Font size for pagination items           |
| `--pagination-item-border-radius`     | `var(--radius)`             | Border radius for pagination items       |
| `--pagination-item-background`        | `var(--background)`         | Background color for pagination items    |
| `--pagination-item-background-hover`  | `var(--accent)`             | Background color on hover                |
| `--pagination-item-foreground`        | `var(--foreground)`         | Text color for pagination items          |
| `--pagination-item-foreground-hover`  | `var(--accent-foreground)`  | Text color on hover                      |
| `--pagination-item-active-background` | `var(--primary)`            | Background color for active/current page |
| `--pagination-item-active-foreground` | `var(--primary-foreground)` | Text color for active/current page       |

### Theming Examples

#### Global Customization

Customize all pagination by setting CSS variables in your theme:

```css
/* app/view/assets/app.css */
@theme {
    /* Make pagination items larger */
    --pagination-item-size: 3rem;
    --pagination-item-font-size: 1rem;
    --pagination-gap: 0.5rem;

    /* Make items more rounded */
    --pagination-item-border-radius: 0.5rem;

    /* Customize hover colors */
    --pagination-item-background-hover: hsl(210 40% 96%);
    --pagination-item-foreground-hover: hsl(222.2 47.4% 11.2%);
}
```

#### Local Overrides

Override CSS variables for specific pagination instances:

```tsx
<div style="--pagination-item-size: 2rem; --pagination-item-font-size: 0.8125rem;">
    <Pagination
        currentPage={5}
        totalPages={10}
        baseUrl="/users"
    />
    {/* Compact pagination */}
</div>

<div style="--pagination-item-border-radius: 9999px;">
    <Pagination
        currentPage={3}
        totalPages={20}
        baseUrl="/products"
    />
    {/* Circular pagination items */}
</div>
```

#### Component-Specific Theming

Create themed sections with different pagination styles:

```tsx
<div class="primary-pagination" style={{
    '--pagination-item-background': 'transparent',
    '--pagination-item-background-hover': 'hsl(var(--primary) / 0.1)',
    '--pagination-item-active-background': 'hsl(var(--primary))',
    '--pagination-item-active-foreground': 'hsl(var(--primary-foreground))',
    '--pagination-gap': '0.5rem'
}}>
    <Pagination
        currentPage={5}
        totalPages={10}
        baseUrl="/users"
    />
    {/* Pagination with primary theme */}
</div>

<div class="compact-pagination" style={{
    '--pagination-item-size': '2rem',
    '--pagination-item-font-size': '0.75rem',
    '--pagination-gap': '0.125rem',
    '--pagination-item-border-radius': '0.25rem'
}}>
    <Pagination
        currentPage={2}
        totalPages={50}
        baseUrl="/posts"
        siblingCount={1}
    />
    {/* Compact pagination for mobile */}
</div>
```

## Examples

### Basic Example

```tsx
<Pagination
    currentPage={5}
    totalPages={10}
    baseUrl='/users'
/>
```

### With Custom Styling

```tsx
<Pagination
    currentPage={3}
    totalPages={20}
    baseUrl='/products'
    class='my-4'
    siblingCount={2}
    showFirstLast
/>
```

### With Unpoly Integration

```tsx
<Pagination
    currentPage={1}
    totalPages={15}
    baseUrl='/posts'
    up-target='.content'
    up-preload
    up-transition='cross-fade'
/>
```
