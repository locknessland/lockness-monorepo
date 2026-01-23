# SearchBar

Documentation for the SearchBar component.

## Installation

```bash
deno run -A jsr:@lockness/ui add searchbar
```

## Usage

```tsx
import { SearchBar } from '@lockness/ui/components'

<SearchBar
    placeholder='Search...'
    name='search'
    showIcon
    showShortcut
    shortcut='⌘K'
/>
```

## Props

| Prop           | Type                                            | Default       | Description                               |
| -------------- | ----------------------------------------------- | ------------- | ----------------------------------------- |
| variant        | `'default' \| 'ghost' \| 'outline' \| 'filled'` | `'default'`   | Visual style variant                      |
| size           | `'sm' \| 'md' \| 'lg' \| 'xl'`                  | `'md'`        | Component size                            |
| placeholder    | `string`                                        | `'Search...'` | Placeholder text                          |
| name           | `string`                                        | -             | Input name attribute                      |
| value          | `string`                                        | -             | Input value                               |
| showIcon       | `boolean`                                       | `true`        | Show search icon                          |
| iconPosition   | `'left' \| 'right'`                             | `'left'`      | Icon position                             |
| showClear      | `boolean`                                       | `false`       | Show clear button when input has value    |
| shortcut       | `string`                                        | -             | Keyboard shortcut to display (e.g., '⌘K') |
| showShortcut   | `boolean`                                       | `false`       | Show keyboard shortcut badge              |
| loading        | `boolean`                                       | `false`       | Loading state                             |
| disabled       | `boolean`                                       | `false`       | Disable input                             |
| fullWidth      | `boolean`                                       | `false`       | Full width mode                           |
| class          | `string`                                        | -             | Additional CSS class names                |
| containerClass | `string`                                        | -             | Container class names                     |
| id             | `string`                                        | -             | Element id attribute                      |
| autocomplete   | `string`                                        | `'off'`       | Autocomplete attribute                    |
| ...props       | `unknown`                                       | -             | Additional HTML attributes                |

## Examples

### Basic Example

```tsx
// Add example here
```
