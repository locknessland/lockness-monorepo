# Sidebar

Documentation for the Sidebar component.

## Installation

```bash
deno run -A jsr:@lockness/ui add sidebar
```

## Usage

```tsx
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset
} from '@lockness/ui/components'

<SidebarProvider>
  <Sidebar>
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton href="/">Home</SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
    <SidebarContent>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton href="/docs">Docs</SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton href="/settings">Settings</SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarContent>
  </Sidebar>
  <SidebarInset>Main content</SidebarInset>
</SidebarProvider>
```

## Props

### SidebarProvider

| Prop        | Type                               | Default  | Description                                     |
| ----------- | ---------------------------------- | -------- | ----------------------------------------------- |
| defaultOpen | `boolean`                          | `true`   | Whether the sidebar is open by default          |
| side        | `'left' \| 'right'`                | `'left'` | Which side the sidebar appears on               |
| class       | `string`                           | -        | Additional CSS class names                      |
| style       | `Record<string, string \| number>` | -        | Inline styles (including CSS custom properties) |
| children    | `unknown`                          | -        | Provider content (Sidebar and SidebarInset)     |

### Sidebar

| Prop        | Type                                 | Default       | Description                                             |
| ----------- | ------------------------------------ | ------------- | ------------------------------------------------------- |
| side        | `'left' \| 'right'`                  | `'left'`      | Which side the sidebar appears on                       |
| variant     | `'sidebar' \| 'floating' \| 'inset'` | `'sidebar'`   | Visual style variant                                    |
| collapsible | `'offcanvas' \| 'icon' \| 'none'`    | `'offcanvas'` | Collapse behavior                                       |
| topOffset   | `string`                             | -             | Top offset for navbar (e.g., '16' for 4rem/64px navbar) |
| class       | `string`                             | -             | Additional CSS class names                              |
| children    | `unknown`                            | -             | Sidebar content                                         |

### SidebarTrigger

| Prop     | Type      | Default | Description                                       |
| -------- | --------- | ------- | ------------------------------------------------- |
| class    | `string`  | -       | Additional CSS class names                        |
| children | `unknown` | -       | Custom trigger content (defaults to sidebar icon) |

### SidebarRail

| Prop  | Type     | Default | Description                |
| ----- | -------- | ------- | -------------------------- |
| class | `string` | -       | Additional CSS class names |
