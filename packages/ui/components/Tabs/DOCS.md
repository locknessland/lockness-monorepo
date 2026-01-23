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

## CSS Variables

| Variable             | Description                              |
| -------------------- | ---------------------------------------- |
| `--radius`           | Border radius for tabs list and triggers |
| `--muted`            | Background color for tabs list           |
| `--muted-foreground` | Text color for inactive tabs             |
| `--background`       | Background color for active tab          |
| `--foreground`       | Text color for active tab                |
| `--ring`             | Focus ring color                         |
| `--ring-offset`      | Focus ring offset                        |

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
