# @lockness/ui

UI components for the Lockness framework, powered by Hono JSX, Tailwind CSS, and
Unpoly.

## 📦 Installation

There are two ways to use `@lockness/ui`:

### Option 1: CLI Mode (Recommended)

Copy components directly to your project for full ownership and customization:

```bash
# Add a single component
deno run -A jsr:@lockness/ui add button

# Add multiple components
deno run -A jsr:@lockness/ui add button card

# Force overwrite existing files
deno run -A jsr:@lockness/ui add button --force

# Specify custom directory
deno run -A jsr:@lockness/ui add button --dir src/components

# List available components
deno run -A jsr:@lockness/ui list
```

Components are copied to `app/view/components/ui/` by default.

### Option 2: Library Mode

Add as a dependency for quick testing/prototyping:

```bash
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

## 🛠️ CLI Usage

The CLI tool allows you to add components to your project without installing the
entire library as a dependency. This gives you full ownership of the component
code and makes it easy to customize.

### Commands

#### `add <component...>`

Copy one or more components to your project:

```bash
# Add a single component
deno run -A jsr:@lockness/ui add button

# Add multiple components
deno run -A jsr:@lockness/ui add button card root-layout

# Force overwrite existing files
deno run -A jsr:@lockness/ui add button --force

# Specify custom directory (default: app/view)
deno run -A jsr:@lockness/ui add button --dir src/components
```

> **Note:** The CLI automatically caches component files in
> `~/.lockness/ui-cache/` when run remotely from JSR, so subsequent commands are
> faster.

**What happens when you run `add`:**

1. The component source files are copied to your project
2. Internal dependencies are automatically installed (e.g., `utils` for
   `button`)
3. Import paths are rewritten to work in your project structure
4. Instructions are displayed for adding npm dependencies to your `deno.json`

**Example output:**

```
📦 Installing 2 component(s)...

✅ Added lib/utils.ts
✅ Added components/ui/Button.tsx

📝 Add these dependencies to your deno.json imports:

    "imports": {
        "clsx": "npm:clsx@2.1.1",
        "tailwind-merge": "npm:tailwind-merge@2.6.0",
    }

✨ Done!
```

#### `list`

Show all available components:

```bash
deno run -A jsr:@lockness/ui list
```

**Example output:**

```
📦 Available components:

  • utils
    Class name utility (cn) for merging Tailwind classes

  • button (requires: utils)
    Flexible button component with variants and sizes

  • card (requires: utils)
    Card component system (Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter)

  • root-layout
    Base HTML layout with Unpoly CDN integration
```

### CLI Options

| Option         | Alias | Description                                |
| -------------- | ----- | ------------------------------------------ |
| `--dir <path>` | `-d`  | Target directory (default: `app/view`)     |
| `--force`      | `-f`  | Overwrite existing files without prompting |
| `--help`       | `-h`  | Show help message                          |

### Project Structure

After adding components, your project will look like this:

```
app/view/
├── components/
│   └── ui/
│       ├── Button.tsx
│       ├── Card.tsx
│       └── RootLayout.tsx
└── lib/
    └── utils.ts
```

Import paths in the copied components are automatically rewritten to work with
this structure:

```tsx
// In Button.tsx, the import is rewritten from:
// import { cn } from '../lib/utils.ts'
// To:
import { cn } from '../../lib/utils.ts'
```

## 🚀 Quick Start

### Using CLI (Recommended)

Add components to your project and customize them freely:

```bash
# Add components you need
deno run -A jsr:@lockness/ui add button card root-layout

# Add the required npm dependencies to your deno.json
```

Then use them in your controllers:

```tsx
import { Controller, Get } from '@lockness/core'
import { Button } from '@view/components/ui/Button.tsx'
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from '@view/components/ui/Card.tsx'
import { RootLayout } from '@view/components/ui/RootLayout.tsx'

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

### Using Library Mode

For quick prototyping, import directly from the package:

```tsx
import {
    Button,
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    RootLayout,
} from '@lockness/ui/components'
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

## 💡 Why Use the CLI?

The CLI approach (inspired by shadcn/ui) gives you several advantages:

1. **Full Ownership**: Components are copied to your project, not imported from
   a package
2. **Easy Customization**: Modify components directly without worrying about
   package updates
3. **No Black Boxes**: See exactly what code is being used
4. **Tree Shaking**: Only include components you actually use
5. **No Version Lock-in**: Components work independently of package versions
6. **Learn by Reading**: Study the component source code in your own project

**Library mode** is still available for quick prototyping or when you don't need
customization.

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
