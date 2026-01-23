# Card

Compound components for building flexible card layouts. Cards provide a
structured container with header, title, description, content, and footer
sections.

## Installation

```bash
deno run -A jsr:@lockness/ui add card
```

## Usage

```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@lockness/ui/components'

<Card>
  <CardHeader>
    <CardTitle>User Profile</CardTitle>
    <CardDescription>Manage your account settings</CardDescription>
  </CardHeader>
  <CardContent>
    <p>Your content here</p>
  </CardContent>
  <CardFooter>
    <Button>Save</Button>
  </CardFooter>
</Card>
```

## Components

### Card

The main container component with border, rounded corners, and shadow.

```tsx
<Card>
    {/* Card sections go here */}
</Card>
```

### CardHeader

Header section of the card. Supports optional icons with configurable
positioning.

```tsx
// Basic header
<CardHeader>
  <CardTitle>Title</CardTitle>
</CardHeader>

// With icon on the left (default)
<CardHeader icon="🎨">
  <CardTitle>Design</CardTitle>
</CardHeader>

// With icon on top
<CardHeader icon="📊" iconPosition="top">
  <CardTitle>Statistics</CardTitle>
</CardHeader>

// With icon on the right
<CardHeader icon="→" iconPosition="right">
  <CardTitle>Next Step</CardTitle>
</CardHeader>
```

### CardTitle

Title typography for card headers.

```tsx
<CardTitle>Dashboard</CardTitle>
```

### CardDescription

Muted description text for additional context.

```tsx
<CardDescription>Manage your account settings</CardDescription>
```

### CardContent

Main content area of the card.

```tsx
<CardContent>
    <p>Your content here</p>
</CardContent>
```

### CardFooter

Footer section for actions, displayed as a flex row.

```tsx
<CardFooter>
    <Button>Save</Button>
    <Button variant='outline'>Cancel</Button>
</CardFooter>
```

## Props

### CardProps

| Prop     | Type      | Default | Description                |
| -------- | --------- | ------- | -------------------------- |
| children | `unknown` | -       | Card content               |
| class    | `string`  | -       | Additional CSS class names |
| id       | `string`  | -       | Element id attribute       |

### CardHeaderProps

| Prop         | Type                         | Default  | Description                              |
| ------------ | ---------------------------- | -------- | ---------------------------------------- |
| children     | `unknown`                    | -        | Header content                           |
| class        | `string`                     | -        | Additional CSS class names               |
| icon         | `string`                     | -        | Optional icon or emoji to display        |
| iconPosition | `'left' \| 'top' \| 'right'` | `'left'` | Position of the icon relative to content |
| id           | `string`                     | -        | Element id attribute                     |

## Complete Example

```tsx
<Card class='w-87.5'>
    <CardHeader icon='👤'>
        <CardTitle>Account Settings</CardTitle>
        <CardDescription>
            Update your personal information and preferences.
        </CardDescription>
    </CardHeader>
    <CardContent>
        <div class='space-y-4'>
            <div>
                <Label for='name'>Name</Label>
                <Input id='name' placeholder='Your name' />
            </div>
            <div>
                <Label for='email'>Email</Label>
                <Input id='email' type='email' placeholder='your@email.com' />
            </div>
        </div>
    </CardContent>
    <CardFooter class='justify-between'>
        <Button variant='outline'>Cancel</Button>
        <Button>Save Changes</Button>
    </CardFooter>
</Card>
```

## CSS Variables

```css
@theme {
    --card-header-padding: 1.5rem;
    --card-content-padding: 1.5rem;
    --card-footer-padding: 1.5rem;
    --card-title-font-size: 1.5rem;
    --radius: 0.5rem;
}
```
