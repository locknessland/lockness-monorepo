# @lockness/ui

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
        "@lockness/ui": "jsr:@lockness/ui@^<version>"
    }
}
```

Then import:

```typescript
import { Button, Card, cn, RootLayout } from '@lockness/ui/components'
```

## Available Components

For detailed documentation of each component, fetch the corresponding endpoint:

- https://lockness.land/ui/llms/accordion.txt
- https://lockness.land/ui/llms/alert.txt
- https://lockness.land/ui/llms/badge.txt
- https://lockness.land/ui/llms/breadcrumb.txt
- https://lockness.land/ui/llms/button.txt
- https://lockness.land/ui/llms/card.txt
- https://lockness.land/ui/llms/chart.txt
- https://lockness.land/ui/llms/chart-extras.txt
- https://lockness.land/ui/llms/checkbox.txt
- https://lockness.land/ui/llms/circular-progress.txt
- https://lockness.land/ui/llms/code-block.txt
- https://lockness.land/ui/llms/copy-button.txt
- https://lockness.land/ui/llms/feature-card.txt
- https://lockness.land/ui/llms/footer.txt
- https://lockness.land/ui/llms/gallery.txt
- https://lockness.land/ui/llms/gauge-progress.txt
- https://lockness.land/ui/llms/hero.txt
- https://lockness.land/ui/llms/input.txt
- https://lockness.land/ui/llms/kbd.txt
- https://lockness.land/ui/llms/label.txt
- https://lockness.land/ui/llms/link.txt
- https://lockness.land/ui/llms/modal.txt
- https://lockness.land/ui/llms/navbar.txt
- https://lockness.land/ui/llms/newsletter.txt
- https://lockness.land/ui/llms/pagination.txt
- https://lockness.land/ui/llms/pricing.txt
- https://lockness.land/ui/llms/progress.txt
- https://lockness.land/ui/llms/props-table.txt
- https://lockness.land/ui/llms/root-layout.txt
- https://lockness.land/ui/llms/search-bar.txt
- https://lockness.land/ui/llms/section.txt
- https://lockness.land/ui/llms/separator.txt
- https://lockness.land/ui/llms/sidebar.txt
- https://lockness.land/ui/llms/skeleton.txt
- https://lockness.land/ui/llms/spinner.txt
- https://lockness.land/ui/llms/stepped-progress.txt
- https://lockness.land/ui/llms/switch.txt
- https://lockness.land/ui/llms/table.txt
- https://lockness.land/ui/llms/tabs.txt
- https://lockness.land/ui/llms/textarea.txt
- https://lockness.land/ui/llms/theme-switch.txt
- https://lockness.land/ui/llms/title.txt
- https://lockness.land/ui/llms/treeview.txt
- https://lockness.land/ui/llms/upload-zone.txt

## Icons

`@lockness/ui` includes a comprehensive icon library based on Lucide icons,
optimized for Hono JSX with consistent sizing and theming support.

### Installation

```bash
deno run -A jsr:@lockness/ui add icons
```

### Usage

```tsx
import { ArrowRightIcon, CheckCircleIcon, GithubIcon } from '@view/icons.tsx'

// Default size (24px)
<ArrowRightIcon />

// Custom size
<CheckCircleIcon size={16} />

// With custom class
<GithubIcon class="text-muted-foreground" />

// Custom stroke width
<ArrowRightIcon strokeWidth={1.5} />
```

### IconProps Interface

All icons accept the same props:

| Prop          | Type     | Default | Description                |
| ------------- | -------- | ------- | -------------------------- |
| `size`        | `number` | `24`    | Icon width and height (px) |
| `class`       | `string` | -       | Additional CSS classes     |
| `strokeWidth` | `number` | `2`     | SVG stroke width           |

### Available Icons

#### Navigation & UI

| Icon               | Description      |
| ------------------ | ---------------- |
| `ArrowRightIcon`   | Right arrow      |
| `ArrowLeftIcon`    | Left arrow       |
| `ChevronRightIcon` | Chevron right    |
| `ChevronDownIcon`  | Chevron down     |
| `MenuIcon`         | Hamburger menu   |
| `XIcon`            | Close/X          |
| `ExternalLinkIcon` | External link    |
| `NavigationIcon`   | Navigation arrow |

#### Status & Feedback

| Icon                | Description                     |
| ------------------- | ------------------------------- |
| `CheckIcon`         | Simple checkmark                |
| `CheckCircleIcon`   | Checkmark in circle (success)   |
| `XCircleIcon`       | X in circle (error/destructive) |
| `InfoCircleIcon`    | Info icon in circle             |
| `AlertTriangleIcon` | Warning triangle                |
| `LoaderIcon`        | Loading spinner                 |

#### Actions

| Icon         | Description       |
| ------------ | ----------------- |
| `CopyIcon`   | Copy to clipboard |
| `SearchIcon` | Search/magnify    |
| `UploadIcon` | Upload            |
| `PlayIcon`   | Play button       |

#### Development

| Icon            | Description    |
| --------------- | -------------- |
| `CodeIcon`      | Code brackets  |
| `TerminalIcon`  | Terminal/CLI   |
| `DatabaseIcon`  | Database       |
| `LayersIcon`    | Layers/stack   |
| `BoxIcon`       | 3D box/package |
| `GitBranchIcon` | Git branch     |

#### Status Indicators

| Icon           | Description     |
| -------------- | --------------- |
| `ZapIcon`      | Lightning/speed |
| `ShieldIcon`   | Security shield |
| `ClockIcon`    | Time/clock      |
| `SparklesIcon` | Sparkles/AI     |

#### Communication

| Icon            | Description  |
| --------------- | ------------ |
| `MailIcon`      | Email        |
| `UsersIcon`     | Group/team   |
| `UserIcon`      | Single user  |
| `MegaphoneIcon` | Announcement |

#### Brands

| Icon          | Description |
| ------------- | ----------- |
| `GithubIcon`  | GitHub logo |
| `TwitterIcon` | Twitter/X   |
| `DiscordIcon` | Discord     |

#### Documents

| Icon        | Description   |
| ----------- | ------------- |
| `FileIcon`  | File/document |
| `BookIcon`  | Book/docs     |
| `ImageIcon` | Image         |

#### Theme & Settings

| Icon           | Description    |
| -------------- | -------------- |
| `SunIcon`      | Light mode     |
| `MoonIcon`     | Dark mode      |
| `SettingsIcon` | Settings/cog   |
| `PaletteIcon`  | Colors/palette |

#### Misc

| Icon             | Description   |
| ---------------- | ------------- |
| `RobotIcon`      | Robot/AI      |
| `RocketIcon`     | Rocket/launch |
| `PuzzleIcon`     | Puzzle piece  |
| `WrenchIcon`     | Tools/wrench  |
| `LayoutGridIcon` | Grid layout   |
| `FormInputIcon`  | Form input    |
| `BarChartIcon`   | Bar chart     |

### Creating Custom Icons

Create your own icons following the same pattern:

```tsx
import type { FC } from '@lockness/core'

interface IconProps {
    size?: number
    class?: string
    strokeWidth?: number
}

const IconBase: FC<IconProps & { children?: unknown }> = ({
    size = 24,
    class: className,
    strokeWidth = 2,
    children,
}) => (
    <svg
        xmlns='http://www.w3.org/2000/svg'
        width={size}
        height={size}
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        stroke-width={strokeWidth}
        stroke-linecap='round'
        stroke-linejoin='round'
        class={className}
    >
        {children}
    </svg>
)

export const MyCustomIcon: FC<IconProps> = (props) => (
    <IconBase {...props}>
        {/* SVG paths here */}
        <circle cx='12' cy='12' r='10' />
    </IconBase>
)
```

### Usage with Components

Icons integrate seamlessly with other UI components:

```tsx
import { Button } from '@view/components/ui/Button.tsx'
import { ArrowRightIcon, GithubIcon } from '@view/icons.tsx'

// Button with icon
<Button>
    <GithubIcon size={16} class="mr-2" />
    View on GitHub
</Button>

// Icon button
<Button variant="outline" size="icon">
    <ArrowRightIcon size={16} />
</Button>
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

// Conditional classes
cn('text-base', isLarge && 'text-lg')
cn('text-base', { 'text-lg': isLarge })
```

**Add to deno.json:**

```json
{
    "imports": {
        "clsx": "npm:clsx@2.1.1",
        "tailwind-merge": "npm:tailwind-merge@2.6.0"
    }
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
| `alert`     | utils, icons                      |
| `pricing`   | utils, icons, button, card, badge |
| `accordion` | utils                             |
| `tabs`      | utils                             |

When you run `add`, the CLI:

1. Resolves all internal dependencies recursively
2. Copies each component to the correct location
3. Rewrites import paths automatically
4. Shows npm dependencies to add to `deno.json`

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

## Next Steps

- https://lockness.land/docs/components - Learn to create custom JSX components
- https://lockness.land/docs/routing - Use components in controllers
- https://lockness.land/docs/packages - Explore other Lockness packages
- https://unpoly.com - Progressive enhancement guide
