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

## Examples

### Basic Example

```tsx
// Add example here
```
