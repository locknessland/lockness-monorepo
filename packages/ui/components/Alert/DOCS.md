# Alert

Alert component for displaying important notifications, warnings, and status
messages to users. Includes support for title, description, icons, and multiple
visual variants. Fully customizable via CSS variables.

## Installation

```bash
deno run -A jsr:@lockness/ui add alert
```

## Usage

```tsx
import { Alert, AlertTitle, AlertDescription } from '@lockness/ui/components'

<Alert>
  <AlertTitle>Heads up!</AlertTitle>
  <AlertDescription>
    You can add components to your app using the CLI.
  </AlertDescription>
</Alert>
```

## Components

### Alert

The main alert container with variant styling.

```tsx
<Alert variant='success' showIcon>
    <AlertTitle>Information</AlertTitle>
    <AlertDescription>Here's some useful information.</AlertDescription>
</Alert>
```

### AlertTitle

The title of the alert message.

```tsx
<AlertTitle>Important Notice</AlertTitle>
```

### AlertDescription

The description or body text of the alert.

```tsx
<AlertDescription>
    Your changes have been saved successfully.
</AlertDescription>
```

## Props

### AlertProps

| Prop     | Type                                                   | Default     | Description                             |
| -------- | ------------------------------------------------------ | ----------- | --------------------------------------- |
| variant  | `'default' \| 'success' \| 'warning' \| 'destructive'` | `'default'` | Visual style variant                    |
| showIcon | `boolean`                                              | `false`     | Show variant icon automatically         |
| icon     | `unknown`                                              | -           | Custom icon element (overrides default) |
| children | `unknown`                                              | -           | Alert content                           |
| class    | `string`                                               | -           | Additional CSS class names              |
| id       | `string`                                               | -           | Element id attribute                    |
| role     | `string`                                               | `'alert'`   | ARIA role for accessibility             |

### AlertTitleProps

| Prop     | Type      | Default | Description                |
| -------- | --------- | ------- | -------------------------- |
| children | `unknown` | -       | Title content              |
| class    | `string`  | -       | Additional CSS class names |

### AlertDescriptionProps

| Prop     | Type      | Default | Description                |
| -------- | --------- | ------- | -------------------------- |
| children | `unknown` | -       | Description content        |
| class    | `string`  | -       | Additional CSS class names |

## Variants

### Default

Standard alert with neutral styling for general messages.

```tsx
<Alert showIcon>
    <AlertTitle>Note</AlertTitle>
    <AlertDescription>
        This is a general informational message.
    </AlertDescription>
</Alert>
```

### Success

Green-styled alert for success messages.

```tsx
<Alert variant='success' showIcon>
    <AlertTitle>Success!</AlertTitle>
    <AlertDescription>
        Your changes have been saved successfully.
    </AlertDescription>
</Alert>
```

### Warning

Yellow/amber-styled alert for warning messages.

```tsx
<Alert variant='warning' showIcon>
    <AlertTitle>Warning</AlertTitle>
    <AlertDescription>
        Your session will expire in 5 minutes.
    </AlertDescription>
</Alert>
```

### Destructive

Red-styled alert for errors and critical messages.

```tsx
<Alert variant='destructive' showIcon>
    <AlertTitle>Error</AlertTitle>
    <AlertDescription>
        Your session has expired. Please log in again.
    </AlertDescription>
</Alert>
```

## With Icons

Use `showIcon` to display the default icon for each variant, or provide a custom
icon.

```tsx
// Default variant icon
<Alert variant='success' showIcon>
    <AlertTitle>Saved!</AlertTitle>
    <AlertDescription>Your profile has been updated.</AlertDescription>
</Alert>

// Custom icon
<Alert
    icon={
        <svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'>
            <path d='M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z'/>
            <path d='m9 12 2 2 4-4'/>
        </svg>
    }
>
    <AlertTitle>Custom Icon</AlertTitle>
    <AlertDescription>This alert uses a custom icon.</AlertDescription>
</Alert>
```

## Complete Example

```tsx
// All variants with icons
<div class='space-y-4'>
    <Alert showIcon>
        <AlertTitle>Default</AlertTitle>
        <AlertDescription>A neutral informational message.</AlertDescription>
    </Alert>

    <Alert variant='success' showIcon>
        <AlertTitle>Success</AlertTitle>
        <AlertDescription>
            Your operation completed successfully!
        </AlertDescription>
    </Alert>

    <Alert variant='warning' showIcon>
        <AlertTitle>Warning</AlertTitle>
        <AlertDescription>Please review before proceeding.</AlertDescription>
    </Alert>

    <Alert variant='destructive' showIcon>
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>
            Something went wrong. Please try again.
        </AlertDescription>
    </Alert>
</div>
```

## CSS Variables

Customize the Alert component using these CSS variables in your theme:

```css
@theme {
    /* Base Alert styling */
    --alert-padding: 1rem;
    --alert-border-radius: var(--radius);
    --alert-border-width: 1px;
    --alert-icon-size: 1.25rem;
    --alert-icon-gap: 0.75rem;
    --alert-title-font-size: 0.875rem;
    --alert-title-font-weight: 600;
    --alert-description-font-size: 0.875rem;

    /* Default variant */
    --alert-default-bg: var(--muted);
    --alert-default-fg: var(--foreground);
    --alert-default-border: var(--border);
    --alert-default-icon: var(--muted-foreground);

    /* Success variant */
    --alert-success-bg: oklch(95% 0.03 145);
    --alert-success-fg: oklch(35% 0.12 145);
    --alert-success-border: oklch(85% 0.08 145);
    --alert-success-icon: oklch(50% 0.15 145);

    /* Warning variant */
    --alert-warning-bg: oklch(95% 0.04 85);
    --alert-warning-fg: oklch(40% 0.12 60);
    --alert-warning-border: oklch(85% 0.10 85);
    --alert-warning-icon: oklch(55% 0.15 70);

    /* Destructive variant */
    --alert-destructive-bg: oklch(95% 0.03 25);
    --alert-destructive-fg: oklch(45% 0.15 25);
    --alert-destructive-border: oklch(85% 0.08 25);
    --alert-destructive-icon: oklch(55% 0.18 25);
}
```

### Dark Mode

Override these variables in the `.dark` selector for dark mode:

```css
.dark {
    /* Success variant - Dark mode */
    --alert-success-bg: oklch(25% 0.05 145);
    --alert-success-fg: oklch(80% 0.08 145);
    --alert-success-border: oklch(35% 0.06 145);
    --alert-success-icon: oklch(65% 0.12 145);

    /* Warning variant - Dark mode */
    --alert-warning-bg: oklch(25% 0.05 85);
    --alert-warning-fg: oklch(85% 0.10 85);
    --alert-warning-border: oklch(40% 0.08 80);
    --alert-warning-icon: oklch(70% 0.14 75);

    /* Destructive variant - Dark mode */
    --alert-destructive-bg: oklch(25% 0.05 25);
    --alert-destructive-fg: oklch(80% 0.10 25);
    --alert-destructive-border: oklch(40% 0.08 25);
    --alert-destructive-icon: oklch(65% 0.15 25);
}
```
