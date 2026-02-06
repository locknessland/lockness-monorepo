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

## Theming

The Newsletter component can be customized using CSS variables. This allows you
to change the appearance of newsletter forms globally or override specific
instances.

### Available CSS Variables

| Variable                     | Default         | Description                             |
| ---------------------------- | --------------- | --------------------------------------- |
| `--newsletter-padding`       | `2rem`          | Inner padding for card/stacked variants |
| `--newsletter-gap`           | `1rem`          | Gap between form elements               |
| `--newsletter-input-height`  | `2.5rem`        | Height of the email input               |
| `--newsletter-border-radius` | `var(--radius)` | Border radius for input and button      |

### Theming Examples

#### Global Customization

Customize all newsletter forms by setting CSS variables in your theme:

```css
/* app/view/assets/app.css */
@theme {
    /* More spacious newsletter forms */
    --newsletter-padding: 2.5rem;
    --newsletter-gap: 1.5rem;

    /* Larger input height */
    --newsletter-input-height: 3rem;

    /* More rounded corners */
    --newsletter-border-radius: 0.75rem;
}
```

#### Local Overrides

Override CSS variables for specific newsletter instances:

```tsx
<div style="--newsletter-padding: 1.5rem; --newsletter-gap: 0.75rem;">
    <Newsletter variant="card" title="Subscribe" />
    {/* Compact newsletter form */}
</div>

<div style="--newsletter-input-height: 3.5rem; --newsletter-border-radius: 2rem;">
    <Newsletter variant="inline" />
    {/* Large newsletter with rounded pill-style input */}
</div>
```

#### Component-Specific Theming

Create themed sections with different newsletter styles:

```tsx
<div class="footer-newsletter" style={{
    '--newsletter-padding': '3rem',
    '--newsletter-gap': '1.5rem',
    '--newsletter-input-height': '3rem',
    '--newsletter-border-radius': '0.5rem'
}}>
    <Newsletter
        variant="stacked"
        title="Stay Updated"
        description="Get the latest news delivered to your inbox"
    />
</div>

<div class="inline-newsletter" style={{
    '--newsletter-gap': '0.5rem',
    '--newsletter-input-height': '2.25rem',
    '--newsletter-border-radius': '0.25rem'
}}>
    <Newsletter
        variant="inline"
        placeholder="Your email"
        buttonText="Sign up"
    />
</div>
```
