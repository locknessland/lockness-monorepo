# Tabs

A tabbed interface component using Unpoly's `up-switch` directive with hidden
radio buttons for zero-JavaScript tab switching.

## Installation

```bash
deno run -A jsr:@lockness/ui add tabs
```

## Usage

```tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@lockness/ui/components'

<Tabs defaultValue="account">
  <TabsList>
    <TabsTrigger value="account" checked>Account</TabsTrigger>
    <TabsTrigger value="password">Password</TabsTrigger>
  </TabsList>
  <TabsContent value="account">
    <p>Account settings content</p>
  </TabsContent>
  <TabsContent value="password">
    <p>Password settings content</p>
  </TabsContent>
</Tabs>
```

### Vertical Tabs

```tsx
<Tabs orientation='vertical' name='settings'>
    <TabsList orientation='vertical'>
        <TabsTrigger value='profile' name='settings' checked>
            Profile
        </TabsTrigger>
        <TabsTrigger value='account' name='settings'>Account</TabsTrigger>
    </TabsList>
    <TabsContent value='profile' name='settings'>
        Profile content
    </TabsContent>
    <TabsContent value='account' name='settings'>
        Account content
    </TabsContent>
</Tabs>
```

## Components

### Tabs

The root container component.

| Prop           | Type                         | Default        | Description                                             |
| -------------- | ---------------------------- | -------------- | ------------------------------------------------------- |
| `defaultValue` | `string`                     | -              | Default active tab value                                |
| `name`         | `string`                     | `'tab'`        | Unique name for this tab group (used for radio buttons) |
| `orientation`  | `'horizontal' \| 'vertical'` | `'horizontal'` | Orientation of the tabs                                 |
| `class`        | `string`                     | -              | Additional CSS class names                              |
| `children`     | `unknown`                    | -              | Tabs content                                            |

### TabsList

Container for tab triggers.

| Prop          | Type                         | Default        | Description                  |
| ------------- | ---------------------------- | -------------- | ---------------------------- |
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` | Orientation of the tabs list |
| `class`       | `string`                     | -              | Additional CSS class names   |
| `children`    | `unknown`                    | -              | Tab triggers                 |

### TabsTrigger

Individual tab button using a hidden radio button with label.

| Prop       | Type      | Default      | Description                                                 |
| ---------- | --------- | ------------ | ----------------------------------------------------------- |
| `value`    | `string`  | **required** | Tab value (should match TabsContent value)                  |
| `checked`  | `boolean` | -            | Whether this tab is checked by default                      |
| `name`     | `string`  | `'tab'`      | Unique name for radio button group (should match Tabs name) |
| `class`    | `string`  | -            | Additional CSS class names                                  |
| `children` | `unknown` | -            | Trigger label content                                       |

### TabsContent

Tab panel content shown when the corresponding trigger is active.

| Prop       | Type      | Default      | Description                                                  |
| ---------- | --------- | ------------ | ------------------------------------------------------------ |
| `value`    | `string`  | **required** | Tab value (should match TabsTrigger value)                   |
| `name`     | `string`  | `'tab'`      | Unique name for this tab group (must match parent Tabs name) |
| `class`    | `string`  | -            | Additional CSS class names                                   |
| `children` | `unknown` | -            | Panel content                                                |

## Theming

The Tabs component can be customized using CSS variables. This allows you to
change the appearance of tabs globally or override specific instances.

### Available CSS Variables

| Variable                           | Default                     | Description                         |
| ---------------------------------- | --------------------------- | ----------------------------------- |
| `--tabs-padding`                   | `0.25rem`                   | Padding around tabs list            |
| `--tabs-height`                    | `2.5rem`                    | Height of tabs list                 |
| `--tabs-background`                | `var(--muted)`              | Background color for tabs list      |
| `--tabs-foreground`                | `var(--muted-foreground)`   | Text color for inactive tabs        |
| `--tabs-border-radius`             | `var(--radius)`             | Border radius for tabs list         |
| `--tabs-trigger-padding-x`         | `0.75rem`                   | Horizontal padding for tab triggers |
| `--tabs-trigger-padding-y`         | `0.375rem`                  | Vertical padding for tab triggers   |
| `--tabs-trigger-font-size`         | `0.875rem`                  | Font size for tab triggers          |
| `--tabs-trigger-font-weight`       | `500`                       | Font weight for tab triggers        |
| `--tabs-trigger-border-radius`     | `calc(var(--radius) - 2px)` | Border radius for tab triggers      |
| `--tabs-trigger-background-active` | `var(--background)`         | Background color for active tab     |
| `--tabs-trigger-foreground-active` | `var(--foreground)`         | Text color for active tab           |
| `--tabs-content-margin-top`        | `0.5rem`                    | Top margin for tab content          |

### Theming Examples

#### Global Customization

Customize all tabs by setting CSS variables in your theme:

```css
/* app/view/assets/app.css */
@theme {
    /* Make tabs larger */
    --tabs-height: 3rem;
    --tabs-trigger-padding-x: 1rem;
    --tabs-trigger-padding-y: 0.5rem;
    --tabs-trigger-font-size: 1rem;

    /* Make tabs more rounded */
    --tabs-border-radius: 0.75rem;
    --tabs-trigger-border-radius: 0.625rem;

    /* Bold active tabs */
    --tabs-trigger-font-weight: 600;

    /* Add spacing between tabs and content */
    --tabs-content-margin-top: 1rem;
}
```

#### Local Overrides

Override CSS variables for specific tabs instances:

```tsx
<div style="--tabs-trigger-font-size: 1rem; --tabs-height: 3rem;">
    <Tabs defaultValue="account">
        <TabsList>
            {/* Larger tabs */}
        </TabsList>
    </Tabs>
</div>

<div style="--tabs-border-radius: 9999px; --tabs-trigger-border-radius: 9999px;">
    <Tabs defaultValue="profile">
        <TabsList>
            {/* Pill-shaped tabs */}
        </TabsList>
    </Tabs>
</div>
```

#### Component-Specific Theming

Create themed sections with different tab styles:

```tsx
<div class="settings-tabs" style={{
    '--tabs-background': 'hsl(var(--primary) / 0.1)',
    '--tabs-trigger-background-active': 'hsl(var(--primary))',
    '--tabs-trigger-foreground-active': 'hsl(var(--primary-foreground))',
    '--tabs-border-radius': '0.5rem'
}}>
    <Tabs defaultValue="general">
        <TabsList>
            {/* Tabs with primary-colored active state */}
        </TabsList>
    </Tabs>
</div>

<div class="compact-tabs" style={{
    '--tabs-padding': '0.125rem',
    '--tabs-height': '2rem',
    '--tabs-trigger-padding-x': '0.5rem',
    '--tabs-trigger-padding-y': '0.25rem',
    '--tabs-trigger-font-size': '0.8125rem'
}}>
    <Tabs defaultValue="tab1">
        <TabsList>
            {/* Compact tabs for sidebar navigation */}
        </TabsList>
    </Tabs>
</div>
```

## Features

- **Zero JavaScript** - Uses Unpoly's `up-switch` with hidden radio buttons
- **Accessible** - Proper ARIA roles and keyboard navigation
- **Vertical layout** - Support for vertical tab orientation
- **Themeable** - Uses CSS variables for styling
- **Multiple groups** - Use different `name` props for multiple tab groups on
  one page

## Notes

- Make sure to use the same `name` prop on `Tabs`, `TabsTrigger`, and
  `TabsContent` when using multiple tab groups
- Set `checked` on one `TabsTrigger` to define the default active tab
- Requires Unpoly for the `up-switch` functionality
