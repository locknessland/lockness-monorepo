# Input

Text input component with consistent styling. Supports all standard HTML input
types with proper focus states and accessibility features.

## Installation

```bash
deno run -A jsr:@lockness/ui add input
```

## Usage

```tsx
import { Input } from '@lockness/ui/components'

<Input type='text' placeholder='Enter your name' />
```

## Props

| Prop         | Type                                                                                                                                                           | Default  | Description                |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------- |
| type         | `'text' \| 'email' \| 'password' \| 'number' \| 'tel' \| 'url' \| 'search' \| 'date' \| 'time' \| 'datetime-local' \| 'month' \| 'week' \| 'file' \| 'hidden'` | `'text'` | Input type                 |
| name         | `string`                                                                                                                                                       | -        | Input name attribute       |
| value        | `string \| number`                                                                                                                                             | -        | Input value                |
| placeholder  | `string`                                                                                                                                                       | -        | Placeholder text           |
| disabled     | `boolean`                                                                                                                                                      | `false`  | Disable input              |
| readonly     | `boolean`                                                                                                                                                      | `false`  | Read-only input            |
| required     | `boolean`                                                                                                                                                      | `false`  | Required field             |
| autocomplete | `string`                                                                                                                                                       | -        | Autocomplete attribute     |
| class        | `string`                                                                                                                                                       | -        | Additional CSS class names |
| id           | `string`                                                                                                                                                       | -        | Element id attribute       |

## Input Types

### Text (default)

```tsx
<Input type='text' placeholder='Enter text' />
```

### Email

```tsx
<Input type='email' placeholder='you@example.com' />
```

### Password

```tsx
<Input type='password' placeholder='Enter password' />
```

### Number

```tsx
<Input type='number' placeholder='0' min='0' max='100' />
```

### Search

```tsx
<Input type='search' placeholder='Search...' />
```

### Date & Time

```tsx
<Input type="date" />
<Input type="time" />
<Input type="datetime-local" />
<Input type="month" />
<Input type="week" />
```

### File

```tsx
<Input type="file" />
<Input type="file" accept="image/*" />
```

### Telephone & URL

```tsx
<Input type="tel" placeholder="+1 (555) 000-0000" />
<Input type="url" placeholder="https://example.com" />
```

## States

### Disabled

```tsx
<Input disabled placeholder='Disabled input' />
```

### Read-only

```tsx
<Input readonly value='Read-only value' />
```

### Required

```tsx
<Input required placeholder='Required field' />
```

## Examples

### With Label

```tsx
<div class='space-y-2'>
    <Label for='email'>Email</Label>
    <Input id='email' type='email' placeholder='you@example.com' />
</div>
```

### Form Group

```tsx
<div class='space-y-4'>
    <div>
        <Label for='name'>Name</Label>
        <Input id='name' placeholder='Your name' required />
    </div>
    <div>
        <Label for='email'>Email</Label>
        <Input id='email' type='email' placeholder='you@example.com' required />
    </div>
    <div>
        <Label for='password'>Password</Label>
        <Input id='password' type='password' placeholder='••••••••' required />
    </div>
</div>
```

### With Custom Width

```tsx
<Input class="max-w-sm" placeholder="Limited width" />
<Input class="w-64" placeholder="Fixed width" />
```

### With Error State

```tsx
<div class='space-y-2'>
    <Label for='email'>Email</Label>
    <Input
        id='email'
        type='email'
        class='border-destructive focus-visible:ring-destructive'
        placeholder='Invalid email'
    />
    <p class='text-sm text-destructive'>Please enter a valid email address.</p>
</div>
```

### Input with Button

```tsx
<div class='flex gap-2'>
    <Input type='email' placeholder='Enter your email' class='flex-1' />
    <Button>Subscribe</Button>
</div>
```

### Search Input

```tsx
<div class='relative'>
    <svg
        class='absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground'
        xmlns='http://www.w3.org/2000/svg'
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        stroke-width='2'
    >
        <circle cx='11' cy='11' r='8' />
        <path d='m21 21-4.3-4.3' />
    </svg>
    <Input type='search' placeholder='Search...' class='pl-10' />
</div>
```

## Accessibility

- Uses semantic `<input>` element
- Proper focus ring styling with `focus-visible`
- Supports all standard input attributes (`aria-*`, `required`, etc.)
- Placeholder text uses muted color for contrast
- Disabled state has reduced opacity and blocked interactions

## CSS Variables

```css
@theme {
    --radius: 0.5rem;
    --input: 220 13% 91%;
    --background: 0 0% 100%;
    --muted-foreground: 220 9% 46%;
    --ring: 221 83% 53%;
    --ring-offset: 0 0% 100%;
}
```

## Styling

The Input component includes:

- 40px height (`h-10`)
- Full width by default (`w-full`)
- Rounded corners using `--radius`
- Border with `--input` color
- Focus ring with offset
- Disabled styling with opacity and cursor
- File input styling for clean file inputs
