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

## CSS Variables

| Variable             | Description                                  |
| -------------------- | -------------------------------------------- |
| `--border`           | Border color for table cells                 |
| `--muted`            | Background color for striped rows and footer |
| `--muted-foreground` | Text color for header cells                  |
| `--radius`           | Border radius for bordered tables            |

## Features

- **Responsive** - Horizontal scrolling on overflow
- **Striped rows** - Zebra striping for better readability
- **Hoverable** - Row highlight on hover
- **Bordered** - Full cell borders option
- **Sortable** - Column sorting with Unpoly navigation
- **Clickable rows** - Navigate on row click with Unpoly
- **Selection state** - Visual indication for selected rows
