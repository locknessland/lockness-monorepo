# @lockness/ui

UI components for the Lockness framework, powered by Hono JSX, Tailwind CSS, and
Unpoly.

## 📦 Installation

```bash
# Add to your project
deno add @lockness/ui
```

Or add to your `deno.json`:

```json
{
    "imports": {
        "@lockness/ui": "jsr:@lockness/ui@^0.1.22"
    }
}
```

## 🎯 Features

- **🎨 Tailwind CSS** - Utility-first styling with automatic class merging
- **⚡ Unpoly** - Progressive enhancement for SPA-like navigation
- **🔧 Copy-Pasteable** - Components you can own and customize
- **📱 Responsive** - Mobile-first design patterns
- **♿ Accessible** - Semantic HTML with proper ARIA attributes
- **🎭 Server-Side** - Hono JSX components for SSR

## 🚀 Quick Start

### Basic Usage

```tsx
import {
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    RootLayout,
} from '@lockness/ui'
import { Controller, Get } from '@lockness/core'

@Controller('/')
export class HomeController {
    @Get('/')
    index(c: Context) {
        return c.html(
            <RootLayout title='Home'>
                <div class='container mx-auto p-4'>
                    <Card>
                        <CardHeader>
                            <CardTitle>Welcome to Lockness</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p class='mb-4'>
                                Build modern web apps with Deno and Hono.
                            </p>
                            <Button>Get Started</Button>
                        </CardContent>
                    </Card>
                </div>
            </RootLayout>,
        )
    }
}
```

### With Unpoly Navigation

Unpoly provides SPA-like navigation without heavy client-side hydration:

```tsx
<Button up-target='.main' up-href='/users'>
    Load Users
</Button>
```

When clicked, Unpoly will fetch `/users` and replace the `.main` element with
the new content, all without a full page reload.

## 📚 Components

### RootLayout

Base HTML layout with Unpoly integration.

```tsx
<RootLayout
    title='My App'
    meta={[<meta name='description' content='My app description' />]}
    styles={[<link rel='stylesheet' href='/css/app.css' />]}
>
    {children}
</RootLayout>
```

**Props:**

- `title?: string` - Page title (default: "Lockness App")
- `meta?: JSX.Element[]` - Additional meta tags
- `styles?: JSX.Element[]` - Additional stylesheets
- `scripts?: JSX.Element[]` - Additional scripts
- `children?: JSX.Element` - Page content

### Button

Flexible button with variants and sizes.

```tsx
<Button variant='primary' size='md'>
    Click me
</Button>
```

**Props:**

- `variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'` - Visual
  style (default: 'primary')
- `size?: 'sm' | 'md' | 'lg'` - Button size (default: 'md')
- `disabled?: boolean` - Disable button (default: false)
- Supports all standard HTML button attributes

**Variants:**

- `primary` - Blue background (default)
- `secondary` - Gray background
- `outline` - Border only, no background
- `ghost` - Text only, hover background
- `danger` - Red background for destructive actions

### Card Components

Compound components for content containers.

```tsx
<Card>
    <CardHeader>
        <CardTitle>User Profile</CardTitle>
        <CardDescription>Manage your account</CardDescription>
    </CardHeader>
    <CardContent>
        <p>Profile content here</p>
    </CardContent>
    <CardFooter>
        <Button>Save</Button>
        <Button variant='outline'>Cancel</Button>
    </CardFooter>
</Card>
```

**Components:**

- `Card` - Main container with border and shadow
- `CardHeader` - Header section (contains title/description)
- `CardTitle` - Title typography
- `CardDescription` - Subtitle/description text
- `CardContent` - Main content area
- `CardFooter` - Footer section for actions

All card components support the `class` prop for custom styling.

## 🎨 Utilities

### `cn()` - Class Name Utility

Merge Tailwind classes with proper conflict resolution.

```tsx
import { cn } from '@lockness/ui'

// Simple merge
cn('px-2 py-1', 'bg-blue-500')
// => 'px-2 py-1 bg-blue-500'

// Conflict resolution (last wins)
cn('px-2', 'px-4')
// => 'px-4'

// Conditional classes
cn('text-base', isLarge && 'text-lg')
// => 'text-base' or 'text-lg'

// In components
<Button class={cn('w-full', className)}>Submit</Button>
```

## 🔧 Customization

All components forward the `class` prop and spread additional HTML attributes,
making them fully customizable:

```tsx
<Button
    class='w-full'
    type='submit'
    up-target='.form-container'
    up-href='/submit'
>
    Submit Form
</Button>
```

## 🌐 Unpoly Integration

Unpoly is included via CDN in the `RootLayout` component. It provides:

- **Partial Updates** - Replace parts of the page without full reloads
- **Layer System** - Modals, popups, and drawers
- **Forms** - Enhanced form handling with validation
- **Navigation** - History management and preloading

### Common Unpoly Directives

```tsx
// Navigate and replace target
<a up-target='.main' up-href='/users'>
    Users
</a>

// Open in a modal layer
<a up-layer='new modal' up-href='/user/new'>
    New User
</a>

// Submit form with AJAX
<form up-submit up-target='.result'>
    <input type='text' name='query' />
    <Button type='submit'>Search</Button>
</form>

// Preload on hover
<a up-preload up-href='/dashboard'>
    Dashboard
</a>
```

Learn more at [unpoly.com](https://unpoly.com)

## 🧪 Testing

Run tests:

```bash
deno task test
```

Watch mode:

```bash
deno task test:watch
```

## 📝 License

MIT

## 🔗 Links

- [Lockness Framework](https://github.com/locknessland/lockness)
- [Unpoly Documentation](https://unpoly.com)
- [Tailwind CSS](https://tailwindcss.com)
- [Hono JSX](https://hono.dev/guides/jsx)
