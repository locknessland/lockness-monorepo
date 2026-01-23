# Newsletter

Documentation for the Newsletter component.

## Installation

```bash
deno run -A jsr:@lockness/ui add newsletter
```

## Usage

```tsx
import { Newsletter } from '@lockness/ui/components'

<Newsletter
    action='/subscribe'
    placeholder='Enter your email'
    buttonText='Subscribe'
    showIcon
/>
```

## Props

| Prop        | Type                                           | Default              | Description                            |
| ----------- | ---------------------------------------------- | -------------------- | -------------------------------------- |
| variant     | `'inline' \| 'stacked' \| 'card' \| 'minimal'` | `'inline'`           | Layout variant                         |
| action      | `string`                                       | `'#'`                | Form action URL                        |
| method      | `'get' \| 'post'`                              | `'post'`             | Form method                            |
| placeholder | `string`                                       | `'Enter your email'` | Input placeholder text                 |
| buttonText  | `string`                                       | `'Subscribe'`        | Submit button text                     |
| title       | `string`                                       | -                    | Title text (for stacked/card variants) |
| description | `string`                                       | -                    | Description text                       |
| showIcon    | `boolean`                                      | `false`              | Show email icon in input               |
| class       | `string`                                       | -                    | Additional CSS class names             |
| inputName   | `string`                                       | `'email'`            | Input name attribute                   |
| up-target   | `string`                                       | -                    | Unpoly target for form submission      |

## Examples

### Basic Example

```tsx
// Add example here
```
