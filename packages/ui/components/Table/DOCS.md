# Table

A responsive table component for displaying tabular data with support for
sorting, striping, hover effects, and borders.

## Installation

```bash
deno run -A jsr:@lockness/ui add table
```

## Usage

```tsx
import { 
  Table, 
  TableHeader, 
  TableBody, 
  TableFooter,
  TableRow, 
  TableHead, 
  TableCell, 
  TableCaption 
} from '@lockness/ui/components'

<Table>
  <TableCaption>A list of your recent invoices.</TableCaption>
  <TableHeader>
    <TableRow>
      <TableHead class="w-25">Invoice</TableHead>
      <TableHead>Status</TableHead>
      <TableHead>Method</TableHead>
      <TableHead class="text-right">Amount</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell class="font-medium">INV001</TableCell>
      <TableCell>Paid</TableCell>
      <TableCell>Credit Card</TableCell>
      <TableCell class="text-right">$250.00</TableCell>
    </TableRow>
  </TableBody>
  <TableFooter>
    <TableRow>
      <TableCell colSpan={3}>Total</TableCell>
      <TableCell class="text-right">$2,500.00</TableCell>
    </TableRow>
  </TableFooter>
</Table>
```

### With Options

```tsx
<Table striped hoverable bordered>
    {/* ... */}
</Table>
```

### Sortable Headers

```tsx
<TableHead sortable sortDirection='asc' sortHref='/users?sort=name&dir=desc'>
    Name
</TableHead>
```

### Clickable Rows

```tsx
<TableRow href='/users/1'>
    <TableCell>John Doe</TableCell>
</TableRow>
```

## Components

### Table

The root table component with responsive scrolling wrapper.

| Prop        | Type      | Default | Description                                     |
| ----------- | --------- | ------- | ----------------------------------------------- |
| `class`     | `string`  | -       | Additional CSS class names                      |
| `striped`   | `boolean` | `false` | Add zebra-striping to table rows                |
| `hoverable` | `boolean` | `false` | Add hover effect to table rows                  |
| `bordered`  | `boolean` | `false` | Add borders on all sides of the table and cells |
| `children`  | `unknown` | -       | Table content                                   |

### TableHeader

Container for table header rows.

| Prop       | Type      | Default | Description                |
| ---------- | --------- | ------- | -------------------------- |
| `class`    | `string`  | -       | Additional CSS class names |
| `children` | `unknown` | -       | Header rows                |

### TableBody

Container for table body rows.

| Prop       | Type      | Default | Description                |
| ---------- | --------- | ------- | -------------------------- |
| `class`    | `string`  | -       | Additional CSS class names |
| `children` | `unknown` | -       | Body rows                  |

### TableFooter

Container for table footer rows.

| Prop       | Type      | Default | Description                |
| ---------- | --------- | ------- | -------------------------- |
| `class`    | `string`  | -       | Additional CSS class names |
| `children` | `unknown` | -       | Footer rows                |

### TableRow

A table row with hover and selection states.

| Prop       | Type      | Default | Description                                          |
| ---------- | --------- | ------- | ---------------------------------------------------- |
| `class`    | `string`  | -       | Additional CSS class names                           |
| `selected` | `boolean` | `false` | Whether the row is selected                          |
| `href`     | `string`  | -       | Make row clickable with navigation URL (uses Unpoly) |
| `children` | `unknown` | -       | Row cells                                            |

### TableHead

A table header cell with optional sorting.

| Prop            | Type                      | Default | Description                            |
| --------------- | ------------------------- | ------- | -------------------------------------- |
| `class`         | `string`                  | -       | Additional CSS class names             |
| `sortable`      | `boolean`                 | `false` | Enable sorting (adds visual indicator) |
| `sortDirection` | `'asc' \| 'desc' \| null` | `null`  | Current sort direction                 |
| `sortHref`      | `string`                  | -       | Sort URL for Unpoly navigation         |
| `children`      | `unknown`                 | -       | Header content                         |

### TableCell

A table data cell.

| Prop       | Type      | Default | Description                |
| ---------- | --------- | ------- | -------------------------- |
| `class`    | `string`  | -       | Additional CSS class names |
| `children` | `unknown` | -       | Cell content               |

### TableCaption

A table caption for accessibility.

| Prop       | Type      | Default | Description                |
| ---------- | --------- | ------- | -------------------------- |
| `class`    | `string`  | -       | Additional CSS class names |
| `children` | `unknown` | -       | Caption content            |

## Theming

The Table component can be customized using CSS variables. This allows you to
change the appearance of tables globally or override specific instances.

### Available CSS Variables

| Variable                        | Default                   | Description                       |
| ------------------------------- | ------------------------- | --------------------------------- |
| `--table-padding-x`             | `0.7rem`                  | Horizontal padding for cells      |
| `--table-padding-y`             | `0.7rem`                  | Vertical padding for cells        |
| `--table-header-height`         | `2.5rem`                  | Height of header cells            |
| `--table-row-height`            | `2.5rem`                  | Height of body rows               |
| `--table-font-size`             | `0.875rem`                | Font size for table text          |
| `--table-header-font-weight`    | `500`                     | Font weight for header cells      |
| `--table-border-radius`         | `var(--radius)`           | Border radius for bordered tables |
| `--table-border-color`          | `var(--border)`           | Border color for table cells      |
| `--table-header-background`     | `var(--muted)`            | Background color for header       |
| `--table-header-foreground`     | `var(--muted-foreground)` | Text color for header cells       |
| `--table-row-hover-background`  | `var(--muted)`            | Background color on row hover     |
| `--table-row-stripe-background` | `var(--muted)`            | Background color for striped rows |

### Theming Examples

#### Global Customization

Customize all tables by setting CSS variables in your theme:

```css
/* app/view/assets/app.css */
@theme {
    /* Make tables more spacious */
    --table-padding-x: 1.5rem;
    --table-padding-y: 1rem;
    --table-row-height: 3rem;

    /* Increase font size */
    --table-font-size: 1rem;
    --table-header-font-weight: 600;

    /* Customize colors */
    --table-header-background: hsl(210 40% 96%);
    --table-row-hover-background: hsl(210 40% 98%);
}
```

#### Local Overrides

Override CSS variables for specific table instances:

```tsx
<div style="--table-padding-x: 0.5rem; --table-padding-y: 0.5rem;">
    <Table>
        {/* Compact table with less padding */}
    </Table>
</div>

<div style="--table-font-size: 1.125rem; --table-row-height: 4rem;">
    <Table>
        {/* Large table for better readability */}
    </Table>
</div>
```

#### Component-Specific Theming

Create themed sections with different table styles:

```tsx
<div class="data-tables" style={{
    '--table-header-background': 'hsl(var(--primary))',
    '--table-header-foreground': 'hsl(var(--primary-foreground))',
    '--table-border-radius': '0.75rem'
}}>
    <Table bordered>
        {/* Tables with primary-colored headers */}
    </Table>
</div>

<div class="compact-tables" style={{
    '--table-padding-x': '0.75rem',
    '--table-padding-y': '0.5rem',
    '--table-row-height': '2rem',
    '--table-font-size': '0.8125rem'
}}>
    <Table striped>
        {/* Compact tables for dense data */}
    </Table>
</div>
```

## Features

- **Responsive** - Horizontal scrolling on overflow
- **Striped rows** - Zebra striping for better readability
- **Hoverable** - Row highlight on hover
- **Bordered** - Full cell borders option
- **Sortable** - Column sorting with Unpoly navigation
- **Clickable rows** - Navigate on row click with Unpoly
- **Selection state** - Visual indication for selected rows
