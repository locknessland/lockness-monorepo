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

## Theming

The SearchBar component can be customized using CSS variables. This allows you
to change the appearance of the search input, including its size, colors, and
icon styles globally or override specific instances.

### Available CSS Variables

| Variable                    | Default                   | Description                              |
| --------------------------- | ------------------------- | ---------------------------------------- |
| `--searchbar-height`        | `2.5rem`                  | Height of the search bar                 |
| `--searchbar-padding-x`     | `0.75rem`                 | Horizontal padding inside the search bar |
| `--searchbar-padding-y`     | `0.5rem`                  | Vertical padding inside the search bar   |
| `--searchbar-font-size`     | `0.875rem`                | Font size of search text                 |
| `--searchbar-border-radius` | `var(--radius)`           | Border radius of the search bar          |
| `--searchbar-background`    | `var(--background)`       | Background color of the search bar       |
| `--searchbar-border-color`  | `var(--border)`           | Border color of the search bar           |
| `--searchbar-icon-color`    | `var(--muted-foreground)` | Color of the search icon                 |

### Theming Examples

#### Global Customization

Customize all search bars by setting CSS variables in your theme:

```css
/* app/view/assets/app.css */
@theme {
    --searchbar-height: 3rem;
    --searchbar-padding-x: 1rem;
    --searchbar-font-size: 1rem;
    --searchbar-border-radius: 0.5rem;
}
```

#### Local Overrides

Override CSS variables for specific search bar instances:

```tsx
<div style='--searchbar-height: 3.5rem; --searchbar-background: hsl(220 20% 95%);'>
    <SearchBar
        placeholder='Search documentation...'
        name='search'
        showIcon
        showShortcut
        shortcut='⌘K'
    />
</div>
```

#### Component-Specific Theming

Create themed sections with different search bar styles:

```tsx
<section class="large-searchbar">
    <style>
        .large-searchbar {
            --searchbar-height: 4rem;
            --searchbar-padding-x: 1.5rem;
            --searchbar-font-size: 1.125rem;
            --searchbar-border-radius: 2rem;
            --searchbar-icon-color: hsl(220 70% 50%);
        }
    </style>
    <SearchBar
        placeholder="Search..."
        name="search"
        showIcon
        size="lg"
    />
</section>
```
