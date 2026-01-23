# ThemeSwitch

Documentation for the ThemeSwitch component.

## Installation

```bash
deno run -A jsr:@lockness/ui add themeswitch
```

## Usage

```tsx
import { ThemeSwitch, ThemeSwitchScript } from '@lockness/ui/components'

// Include the script once in your layout
<ThemeSwitchScript />

// Classic two-button variant
<ThemeSwitch variant="classic" />

// Toggle icon button
<ThemeSwitch variant="toggle" />

// Switch slider
<ThemeSwitch variant="switch" />
```

## Props

| Prop          | Type                                | Default     | Description                                                             |
| ------------- | ----------------------------------- | ----------- | ----------------------------------------------------------------------- |
| class         | `string`                            | -           | Additional CSS classes for the container element                        |
| variant       | `'classic' \| 'toggle' \| 'switch'` | `'classic'` | Visual variant of the theme switcher                                    |
| size          | `'sm' \| 'md' \| 'lg'`              | `'md'`      | Size variant affecting padding, font size, and icon dimensions          |
| darkLabel     | `string`                            | `'Dark'`    | Label displayed on the button when in light mode (classic variant only) |
| lightLabel    | `string`                            | `'Light'`   | Label displayed on the button when in dark mode (classic variant only)  |
| sunIconClass  | `string`                            | -           | Custom CSS class for the sun icon                                       |
| moonIconClass | `string`                            | -           | Custom CSS class for the moon icon                                      |
| ...props      | `unknown`                           | -           | Additional HTML attributes passed to the root element                   |

## Examples

### Basic Example

```tsx
// Add example here
```
