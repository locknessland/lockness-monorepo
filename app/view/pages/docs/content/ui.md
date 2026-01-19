# UI Components

`@lockness/ui` provides a collection of pre-built UI components powered by Hono
JSX, Tailwind CSS, and Unpoly. Inspired by shadcn/ui, components are **copied to
your project** rather than imported from a package, giving you full ownership
and customization capabilities.

## Philosophy

Instead of installing components as dependencies, `@lockness/ui` uses a CLI tool
to copy component source code directly into your project. This approach offers:

- **Full Ownership** - Components live in your codebase, modify them freely
- **No Black Boxes** - See exactly what code you're using
- **Tree Shaking** - Only include components you actually use
- **Zero Lock-in** - Components work independently of package versions
- **Learning** - Study component source code in your project

## Installation

There are two ways to use `@lockness/ui`:

### CLI Mode (Recommended)

Copy components directly to your project:

```bash
# List available components
deno run -A jsr:@lockness/ui list

# Add a single component
deno run -A jsr:@lockness/ui add button

# Add multiple components
deno run -A jsr:@lockness/ui add button card root-layout

# Force overwrite existing files
deno run -A jsr:@lockness/ui add button --force

# Custom target directory (default: app/view)
deno run -A jsr:@lockness/ui add button --dir src/components
```

**What happens when you add a component:**

1. Component source files are copied to `app/view/components/ui/`
2. Internal dependencies (like `utils`) are automatically installed
3. Import paths are rewritten to work in your project structure
4. Instructions shown for adding npm dependencies to `deno.json`

### Library Mode (Quick Testing)

For quick prototyping, import components directly:

```bash
deno add @lockness/ui
```

Or add to `deno.json`:

```json
{
    "imports": {
        "@lockness/ui": "jsr:@lockness/ui@^0.1.22"
    }
}
```

Then import:

```typescript
import { Button, Card, cn, RootLayout } from '@lockness/ui/components'
```

## Available Components

### Button

Flexible button with multiple variants and sizes.

```tsx
import { Button } from '@view/components/ui/Button.tsx'

// Variants
<Button variant="primary">Primary</Button>
<Button variant="secondary">Secondary</Button>
<Button variant="outline">Outline</Button>
<Button variant="ghost">Ghost</Button>
<Button variant="danger">Delete</Button>

// Sizes
<Button size="sm">Small</Button>
<Button size="md">Medium</Button>
<Button size="lg">Large</Button>

// States
<Button disabled>Disabled</Button>

// With Unpoly navigation
<Button up-target=".main" up-href="/users">Load Users</Button>

// Custom styling
<Button class="w-full" type="submit">Sign In</Button>
```

**Props:**

- `variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'` (default:
  'primary')
- `size?: 'sm' | 'md' | 'lg'` (default: 'md')
- `disabled?: boolean`
- `class?: string` - Additional Tailwind classes
- All standard HTML button attributes

### Card Components

Compound components for content containers.

```tsx
import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
    CardFooter,
} from '@view/components/ui/Card.tsx'

<Card>
    <CardHeader>
        <CardTitle>User Profile</CardTitle>
        <CardDescription>Manage your account settings</CardDescription>
    </CardHeader>
    <CardContent>
        <form>
            <input type="email" name="email" class="w-full p-2 border rounded" />
            <input type="text" name="username" class="w-full p-2 border rounded" />
        </form>
    </CardContent>
    <CardFooter>
        <Button type="submit">Save Changes</Button>
        <Button variant="outline">Cancel</Button>
    </CardFooter>
</Card>
```

**Available Components:**

- `Card` - Main container with border, shadow, and rounded corners
- `CardHeader` - Header section with bottom spacing
- `CardTitle` - H3 heading with proper typography
- `CardDescription` - Muted subtitle text
- `CardContent` - Main content area with padding
- `CardFooter` - Footer section with flex layout for actions

All components accept `class` prop and forward HTML attributes.

### RootLayout

Base HTML layout with Unpoly integration.

```tsx
import { RootLayout } from '@view/components/ui/RootLayout.tsx'

<RootLayout
    title="My Application"
    meta={[
        <meta name="description" content="App description" />,
        <meta property="og:title" content="My App" />
    ]}
    styles={[
        <link rel="stylesheet" href="/css/app.css" />
    ]}
    scripts={[
        <script src="/js/analytics.js" />
    ]}
>
    <div class="container mx-auto">
        {children}
    </div>
</RootLayout>
```

**Props:**

- `title?: string` - Page title (default: "Lockness App")
- `meta?: JSX.Element[]` - Additional meta tags
- `styles?: JSX.Element[]` - Additional stylesheets
- `scripts?: JSX.Element[]` - Additional scripts
- `children?: JSX.Element` - Page content

**Features:**

- Includes Unpoly CDN (v3.12.1) for progressive enhancement
- Proper HTML5 boilerplate structure
- Responsive viewport settings
- UTF-8 charset declaration

### Pricing Components

Complete pricing section components for SaaS landing pages.

```bash
# Install pricing component and all its dependencies
deno run -A jsr:@lockness/ui add pricing
```

**This installs 6 files automatically:**

- `components/ui/Pricing.tsx` - Main pricing components
- `components/ui/Button.tsx` - CTA buttons
- `components/ui/Card.tsx` - Card containers
- `components/ui/Badge.tsx` - Promotional badges
- `lib/utils.ts` - Class name utility
- `lib/icons.tsx` - Check/X icons for features

```tsx
import {
    PricingSection,
    PricingCard,
    PricingCardHeader,
    PricingCardPrice,
    PricingCardDescription,
    PricingCardFeatures,
    PricingCardFeature,
    PricingCardAction,
    PricingToggle,
    PricingComparison,
} from '@view/components/ui/Pricing.tsx'

// Two-tier layout
<PricingSection columns={2}>
    <PricingCard>
        <PricingCardHeader title="Starter" />
        <PricingCardPrice price={0} description="Free forever" />
        <PricingCardDescription>
            Perfect for individuals and small projects
        </PricingCardDescription>
        <PricingCardFeatures>
            <PricingCardFeature>Up to 3 projects</PricingCardFeature>
            <PricingCardFeature>1 GB storage</PricingCardFeature>
            <PricingCardFeature included={false}>Priority support</PricingCardFeature>
        </PricingCardFeatures>
        <PricingCardAction href="/signup" variant="outline">
            Get Started Free
        </PricingCardAction>
    </PricingCard>

    <PricingCard featured>
        <PricingCardHeader title="Pro" badge="Popular" />
        <PricingCardPrice price={29} period="month" />
        <PricingCardDescription>
            For professionals and growing teams
        </PricingCardDescription>
        <PricingCardFeatures>
            <PricingCardFeature>Unlimited projects</PricingCardFeature>
            <PricingCardFeature>50 GB storage</PricingCardFeature>
            <PricingCardFeature>Priority support</PricingCardFeature>
        </PricingCardFeatures>
        <PricingCardAction href="/signup">
            Start Free Trial
        </PricingCardAction>
    </PricingCard>
</PricingSection>
```

**Available Components:**

| Component                | Description                                              |
| ------------------------ | -------------------------------------------------------- |
| `PricingSection`         | Grid container (2 or 3 columns)                          |
| `PricingCard`            | Main card container, supports `featured` prop            |
| `PricingCardHeader`      | Title with optional `badge`                              |
| `PricingCardPrice`       | Price display with `currency`, `period`, `originalPrice` |
| `PricingCardDescription` | Short tier description                                   |
| `PricingCardFeatures`    | Feature list container                                   |
| `PricingCardFeature`     | Feature item with check/cross icon                       |
| `PricingCardAction`      | CTA button (always at bottom)                            |
| `PricingToggle`          | Monthly/Yearly billing toggle                            |
| `PricingComparison`      | Feature comparison table                                 |

**Typesafe Props:**

```tsx
// Currency symbols with autocomplete
type CurrencySymbol = '$' | '€' | '£' | '¥' | '₹' | '₽' | 'Fr' | 'kr' | 'R$' | string

// Billing periods with autocomplete
type BillingPeriod = 'month' | 'year' | 'week' | 'day' | 'one-time' | 'lifetime' | string

// Examples
<PricingCardPrice price={29} currency="€" period="month" />
<PricingCardPrice price={290} period="year" originalPrice={348} description="Save 17%" />
<PricingCardPrice price="Custom" description="Contact us for pricing" />
```

**Feature Comparison Table:**

```tsx
<PricingComparison
    tiers={['Free', 'Pro', 'Enterprise']}
    features={[
        ['Projects', '3', '10', 'Unlimited'],
        ['Storage', '1 GB', '10 GB', '100 GB'],
        ['Support', false, true, true],
        ['Custom Domain', false, true, true],
        ['SSO', false, false, true],
    ]}
/>
```

**Billing Toggle:**

```tsx
<PricingToggle selected='yearly' yearlyBadge='Save 20%' />
```

## Utilities

### cn() - Class Name Utility

Merge Tailwind classes with proper conflict resolution.

```tsx
import { cn } from '@view/lib/utils.ts'

// Simple merge
cn('px-2 py-1', 'bg-blue-500')
// => 'px-2 py-1 bg-blue-500'

// Conflict resolution (last wins)
cn('px-2', 'px-4')
// => 'px-4'

cn('text-red-500', 'text-blue-500')
// => 'text-blue-500'

// Conditional classes
cn('text-base', isLarge && 'text-lg')
cn('text-base', { 'text-lg': isLarge })

// In components
type Props = { class?: string }
<Button class={cn('base-styles', props.class)}>Text</Button>
```

**Uses:**

- `clsx` for conditional class merging
- `tailwind-merge` for Tailwind-specific conflict resolution

**Add to deno.json:**

```json
{
    "imports": {
        "clsx": "npm:clsx@2.1.1",
        "tailwind-merge": "npm:tailwind-merge@2.6.0"
    }
}
```

## Theme Components

### ThemeSwitch

A versatile theme switcher with multiple visual styles and native JavaScript
logic.

```tsx
import { ThemeSwitch, ThemeSwitchScript } from '@view/components/ui/ThemeSwitch.tsx'

// Basic usage (classic style)
<ThemeSwitch />

// Single button toggle
<ThemeSwitch variant="toggle" />

// Checkbox-style switch
<ThemeSwitch variant="switch" />
```

**Props:**

- `variant?: 'classic' | 'toggle' | 'switch'` (default: 'classic')
- `size?: 'sm' | 'md' | 'lg'` (default: 'md')
- `class?: string` - Additional Tailwind classes

**Note:** Add `<ThemeSwitchScript />` to your `RootLayout` to initialize the
theme and keep components synchronized.

## Unpoly Integration

All components support Unpoly directives for SPA-like navigation without heavy
client-side hydration.

### Navigation

```tsx
// Replace target element
<a up-target=".main" up-href="/users">Load Users</a>

// Navigate entire page
<a up-follow up-href="/dashboard">Dashboard</a>

// Preload on hover
<a up-preload up-href="/profile">Profile</a>
```

### Layers (Modals/Overlays)

```tsx
// Open modal
<a up-layer="new modal" up-href="/user/new">New User</a>

// Open drawer
<a up-layer="new drawer" up-href="/settings">Settings</a>

// Close layer
<Button up-dismiss>Close</Button>
```

### Forms

```tsx
// AJAX form submission
<form up-submit up-target=".result">
    <input type="text" name="query" />
    <Button type="submit">Search</Button>
</form>

// Validate before submit
<form up-submit up-validate>
    <input type="email" name="email" required />
    <Button type="submit">Subscribe</Button>
</form>
```

### Transitions

```tsx
// Custom transition
<a up-target=".content" up-transition="cross-fade">Fade In</a>

// Animation duration
<a up-target=".content" up-duration="300">Quick</a>
```

Learn more: [unpoly.com](https://unpoly.com)

## Usage Examples

### Basic Page with UI Components

```tsx
import { Controller, Get } from '@lockness/core'
import type { Context } from '@lockness/core'
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
            <RootLayout title='Welcome'>
                <div class='container mx-auto p-8'>
                    <Card>
                        <CardHeader>
                            <CardTitle>Welcome to Lockness</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p class='mb-4'>Get started building your app</p>
                            <Button variant='primary'>Get Started</Button>
                        </CardContent>
                    </Card>
                </div>
            </RootLayout>,
        )
    }
}
```

### Interactive List with Unpoly

```tsx
@Controller('/users')
export class UserController {
    @Get('/')
    list(c: Context) {
        return c.html(
            <RootLayout title='Users'>
                <div class='container mx-auto p-8'>
                    <Card>
                        <CardHeader>
                            <CardTitle>Users</CardTitle>
                        </CardHeader>
                        <CardContent class='main'>
                            <div class='space-y-2'>
                                <Button
                                    up-target='.main'
                                    up-href='/users/active'
                                    variant='outline'
                                >
                                    Active Users
                                </Button>
                                <Button
                                    up-target='.main'
                                    up-href='/users/inactive'
                                    variant='outline'
                                >
                                    Inactive Users
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </RootLayout>,
        )
    }

    @Get('/active')
    active(c: Context) {
        // Return just the content that replaces .main
        return c.html(
            <div class='main'>
                <h3 class='text-lg font-semibold mb-2'>Active Users</h3>
                <ul class='space-y-1'>
                    <li>John Doe</li>
                    <li>Jane Smith</li>
                </ul>
            </div>,
        )
    }
}
```

### Form with Validation

```tsx
@Controller('/contact')
export class ContactController {
    @Get('/')
    form(c: Context) {
        return c.html(
            <RootLayout title='Contact'>
                <div class='container mx-auto p-8 max-w-md'>
                    <Card>
                        <CardHeader>
                            <CardTitle>Contact Us</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <form
                                up-submit
                                up-target='.result'
                                class='space-y-4'
                            >
                                <input
                                    type='email'
                                    name='email'
                                    placeholder='Email'
                                    required
                                    class='w-full px-4 py-2 border rounded focus:ring-2 focus:ring-blue-500'
                                />
                                <textarea
                                    name='message'
                                    placeholder='Message'
                                    required
                                    rows={4}
                                    class='w-full px-4 py-2 border rounded focus:ring-2 focus:ring-blue-500'
                                />
                                <div class='result' />
                                <Button type='submit' class='w-full'>
                                    Send Message
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                </div>
            </RootLayout>,
        )
    }

    @Post('/')
    async submit(c: Context) {
        const { email, message } = await c.req.parseBody()

        // Process form...

        // Return result that replaces .result
        return c.html(
            <div class='result p-4 bg-green-50 border border-green-200 text-green-800 rounded'>
                Message sent successfully!
            </div>,
        )
    }
}
```

## Customization

All components are designed to be easily customized since they live in your
project.

### Extending Components

```tsx
// Create custom variant by extending Button
import { Button as BaseButton } from '@view/components/ui/Button.tsx'
import type { ButtonProps } from '@view/components/ui/Button.tsx'

export const PrimaryButton = (props: Omit<ButtonProps, 'variant'>) => {
    return (
        <BaseButton
            {...props}
            variant='primary'
            class={cn('min-w-32', props.class)}
        />
    )
}

// Create icon button variant
export const IconButton = (props: ButtonProps & { icon: string }) => {
    return (
        <BaseButton
            {...props}
            class={cn('flex items-center gap-2', props.class)}
        >
            <span>{props.icon}</span>
            {props.children}
        </BaseButton>
    )
}
```

### Modifying Styles

Since components are in your project, modify them directly:

```tsx
// Edit app/view/components/ui/Button.tsx
export const Button = (
    { variant = 'primary', size = 'md', ...props }: ButtonProps,
) => {
    const variants = {
        primary: 'bg-purple-600 hover:bg-purple-700 text-white', // Changed from blue
        secondary: 'bg-gray-600 hover:bg-gray-700 text-white',
        // ... add your own variants
        brand: 'bg-gradient-to-r from-pink-500 to-purple-500 text-white',
    }

    // ... rest of component
}
```

## Components with Dependencies

Some components depend on other components. The CLI automatically resolves and
installs all dependencies:

```bash
# Adding pricing installs 6 files:
# - pricing (main component)
# - button (for CTA buttons)
# - card (for card containers)
# - badge (for promotional badges)
# - icons (for check/cross icons)
# - utils (class name utility)
deno run -A jsr:@lockness/ui add pricing
```

**Components and their dependencies:**

| Component   | Dependencies                      |
| ----------- | --------------------------------- |
| `button`    | utils                             |
| `card`      | utils                             |
| `badge`     | utils                             |
| `pricing`   | utils, icons, button, card, badge |
| `accordion` | utils                             |
| `tabs`      | utils                             |
| `alert`     | utils                             |

When you run `add`, the CLI:

1. Resolves all internal dependencies recursively
2. Copies each component to the correct location
3. Rewrites import paths automatically
4. Shows npm dependencies to add to `deno.json`

**Project structure after adding `pricing`:**

```plaintext
app/view/
├── components/
│   └── ui/
│       ├── Pricing.tsx     # Main pricing components
│       ├── Button.tsx      # Dependency
│       ├── Card.tsx        # Dependency
│       └── Badge.tsx       # Dependency
└── lib/
    ├── utils.ts            # Class name utility
    └── icons.tsx           # SVG icons
```

## Project Structure

After adding components, your project will look like this:

```plaintext
app/view/
├── components/
│   └── ui/
│       ├── Button.tsx       # Added via CLI
│       ├── Card.tsx         # Added via CLI
│       └── RootLayout.tsx   # Added via CLI
└── lib/
    └── utils.ts             # Added automatically (cn utility)
```

Import paths in copied components are automatically rewritten:

```tsx
// Original (in packages/ui/components/Button.tsx)
import { cn } from '../lib/utils.ts'

// After copying to app/view/components/ui/Button.tsx
import { cn } from '../../lib/utils.ts'
```

## CLI Commands Reference

### list

Show all available components:

```bash
deno run -A jsr:@lockness/ui list
```

### add

Add one or more components to your project:

```bash
# Single component
deno run -A jsr:@lockness/ui add button

# Multiple components
deno run -A jsr:@lockness/ui add button card root-layout

# With options
deno run -A jsr:@lockness/ui add button --force
deno run -A jsr:@lockness/ui add button --dir src/components
```

**Options:**

- `--force`, `-f` - Overwrite existing files without prompting
- `--dir <path>`, `-d <path>` - Target directory (default: `app/view`)
- `--help`, `-h` - Show help message

## Component Caching

When run remotely from JSR:

- Components are fetched via HTTPS
- Cached in `~/.lockness/ui-cache/` for faster subsequent commands
- Cache is organized by version
- No network needed after first fetch

## Why This Approach?

**Benefits over traditional component libraries:**

1. **Full Ownership** - Modify components without package constraints or
   breaking changes
2. **No Black Boxes** - See exactly what code you're using, no hidden
   dependencies
3. **Tree Shaking** - Only include what you need, no unused code
4. **No Version Lock** - Components work independently of package versions
5. **Learning** - Study source code in your project to understand how they work
6. **Customization** - Change anything without forking or ejecting

**Inspired by:**

- [shadcn/ui](https://ui.shadcn.com/) - Copy-paste components philosophy
- [Radix UI](https://www.radix-ui.com/) - Headless component patterns
- [Laravel Breeze](https://laravel.com/docs/starter-kits) - Scaffolding approach

## Next Steps

- [Components](/docs/components) - Learn to create custom JSX components
- [Routing](/docs/routing) - Use components in controllers
- [Packages](/docs/packages) - Explore other Lockness packages
- [Unpoly Documentation](https://unpoly.com) - Progressive enhancement guide
