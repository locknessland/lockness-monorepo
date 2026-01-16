# Technical Task: Implement CLI for @lockness/ui

## 📋 Task Overview

Implement a Command Line Interface (CLI) for the `@lockness/ui` package. This
tool aims to provide a developer experience similar to `shadcn/ui`, allowing
users to selectively "add" components to their projects instead of installing
the entire library as a dependency. The CLI will fetch component source code and
install it directly into the user's codebase (e.g., `app/view/components/ui/`),
giving them full ownership and customization capabilities.

## ✅ Implementation Status

### Completed

- [x] Package `@lockness/ui` created with `deno.json` configuration
- [x] `cn` utility implemented in `lib/utils.ts`
- [x] `Button` component with variants (primary, secondary, outline, ghost,
      danger) and sizes (sm, md, lg)
- [x] `Card` component system (Card, CardHeader, CardTitle, CardDescription,
      CardContent, CardFooter)
- [x] `RootLayout` component with Unpoly CDN integration
- [x] All components use Tailwind CSS classes
- [x] Tests passing for all components
- [x] `deno check` and `deno lint` passing
- [x] **CLI implemented in `mod.ts`** (single entry point, Deno convention)
- [x] **Registry embedded in `mod.ts`** (no separate registry.json needed)
- [x] **`add` command** - copies components to user's project
- [x] **`list` command** - shows available components
- [x] **Internal dependencies resolution** - auto-installs utils when needed
- [x] **Import path rewriting** - fixes relative imports in copied files
- [x] **deno.json updated** with `@std/cli`, `@std/fs`, `@std/path` imports
- [x] **`components.ts` created** - direct library exports for quick testing

### Remaining

- [ ] Update README.md with CLI documentation
- [ ] Add tests for CLI functionality
- [ ] Test remote execution from JSR (currently local only)

## 🏗️ Architecture

### Dual Mode: CLI + Library

The package supports two usage modes:

**1. CLI Mode (mod.ts)** - Primary, for production use:

```bash
# Copy components to your project
deno run -A jsr:@lockness/ui add button
deno run -A jsr:@lockness/ui list
```

**2. Library Mode (components.ts)** - For quick testing/prototyping:

```typescript
import { Button, Card, cn } from '@lockness/ui/components'
```

### File Structure

```
packages/ui/
├── mod.ts              # CLI entry point (main)
├── components.ts       # Library exports for direct import
├── deno.json           # Package config
├── README.md           # Documentation
├── components/         # Source files to copy
│   ├── Button.tsx
│   ├── Card.tsx
│   └── RootLayout.tsx
├── lib/
│   └── utils.ts        # cn() utility to copy
└── tests/              # Component tests
```

### Registry (embedded in mod.ts)

```typescript
const REGISTRY: Registry = {
    utils: {
        name: 'utils',
        description: 'Class name utility (cn) for merging Tailwind classes',
        files: [{ path: 'lib/utils.ts', target: 'lib/utils.ts' }],
        dependencies: {
            clsx: 'npm:clsx@2.1.1',
            'tailwind-merge': 'npm:tailwind-merge@2.6.0',
        },
    },
    button: {
        name: 'button',
        description: 'Flexible button component with variants and sizes',
        files: [{
            path: 'components/Button.tsx',
            target: 'components/ui/Button.tsx',
        }],
        internalDependencies: ['utils'],
    },
    // ...
}
```

## 📝 CLI Commands

### `add <component...>`

```bash
# Add single component
deno run -A jsr:@lockness/ui add button

# Add multiple components
deno run -A jsr:@lockness/ui add button card

# Force overwrite
deno run -A jsr:@lockness/ui add button --force

# Custom directory
deno run -A jsr:@lockness/ui add button --dir src/components
```

### `list`

```bash
deno run -A jsr:@lockness/ui list
```

Output:

```
📦 Available components:

  • utils
    Class name utility (cn) for merging Tailwind classes

  • button (requires: utils)
    Flexible button component with variants and sizes

  • card (requires: utils)
    Card component system (...)

  • root-layout
    Base HTML layout with Unpoly CDN integration
```

## ✅ Definition of Done

- [x] `mod.ts` implements CLI with `add` and `list` commands
- [x] Internal dependencies (utils) auto-installed when needed
- [x] Import paths correctly rewritten in copied files
- [x] CLI provides clear instructions for npm dependencies
- [x] `deno.json` updated with CLI dependencies
- [ ] README updated with CLI documentation
- [ ] Tests for CLI functionality

### Phase 1: Registry & Configuration

**Step 1.1: Define Registry Structure**

File: `/packages/ui/registry.json`

```json
{
    "$schema": "./registry.schema.json",
    "utils": {
        "name": "utils",
        "description": "Class name utility (cn) for merging Tailwind classes",
        "files": [
            {
                "path": "lib/utils.ts",
                "target": "lib/utils.ts"
            }
        ],
        "dependencies": {
            "clsx": "npm:clsx@2.1.1",
            "tailwind-merge": "npm:tailwind-merge@2.6.0"
        },
        "devDependencies": {}
    },
    "button": {
        "name": "button",
        "description": "Flexible button component with variants and sizes",
        "files": [
            {
                "path": "components/Button.tsx",
                "target": "components/ui/Button.tsx"
            }
        ],
        "dependencies": {},
        "internalDependencies": ["utils"]
    },
    "card": {
        "name": "card",
        "description": "Card component system (Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter)",
        "files": [
            {
                "path": "components/Card.tsx",
                "target": "components/ui/Card.tsx"
            }
        ],
        "dependencies": {},
        "internalDependencies": ["utils"]
    },
    "root-layout": {
        "name": "root-layout",
        "description": "Base HTML layout with Unpoly integration",
        "files": [
            {
                "path": "components/RootLayout.tsx",
                "target": "components/ui/RootLayout.tsx"
            }
        ],
        "dependencies": {},
        "internalDependencies": []
    }
}
```

**Step 1.2: Update deno.json exports**

Add CLI export to `/packages/ui/deno.json`:

```json
{
    "exports": {
        ".": "./mod.ts",
        "./cli": "./cli.ts"
    },
    "imports": {
        "@std/cli": "jsr:@std/cli@1",
        "@std/fs": "jsr:@std/fs@1",
        "@std/path": "jsr:@std/path@1"
        // ... existing imports
    }
}
```

### Phase 2: The `add` Command

**Step 2.1: CLI Entry Point**

File: `/packages/ui/cli.ts`

```typescript
#!/usr/bin/env -S deno run -A

import { parseArgs } from '@std/cli/parse-args'
import { ensureDir } from '@std/fs/ensure-dir'
import { dirname, join } from '@std/path'

const REGISTRY_URL = 'https://jsr.io/@lockness/ui/registry.json'
const DEFAULT_TARGET_DIR = 'app/view'

async function main() {
    const args = parseArgs(Deno.args, {
        string: ['dir'],
        boolean: ['help', 'force'],
        alias: { h: 'help', d: 'dir', f: 'force' },
        default: { dir: DEFAULT_TARGET_DIR },
    })

    const [command, ...components] = args._

    if (args.help || !command) {
        printHelp()
        return
    }

    switch (command) {
        case 'add':
            await addComponents(components as string[], args.dir, args.force)
            break
        case 'list':
            await listComponents()
            break
        default:
            console.error(`Unknown command: ${command}`)
            printHelp()
            Deno.exit(1)
    }
}

main()
```

**Step 2.2: Add Command Implementation**

- Fetch registry from JSR or local
- Resolve internal dependencies (e.g., button requires utils)
- Check if files exist, prompt for overwrite if not `--force`
- Write files to target directory
- Update imports in copied files (replace `../lib/utils.ts` with correct path)
- Print instructions for adding npm dependencies to `deno.json`

**Step 2.3: Import Path Rewriting**

When copying `Button.tsx`, rewrite:

```typescript
// From (in source)
import { cn } from '../lib/utils.ts'

// To (in user project)
import { cn } from '../lib/utils.ts' // Relative to app/view/components/ui/
```

### Phase 3: Documentation & Polish

**Step 3.1: Update README**

Add CLI section to `/packages/ui/README.md`:

````markdown
## CLI Usage

Add individual components to your project:

```bash
# Add a single component
deno run -A jsr:@lockness/ui/cli add button

# Add multiple components
deno run -A jsr:@lockness/ui/cli add button card

# Add all components
deno run -A jsr:@lockness/ui/cli add --all

# Specify custom directory
deno run -A jsr:@lockness/ui/cli add button --dir src/components

# Force overwrite existing files
deno run -A jsr:@lockness/ui/cli add button --force

# List available components
deno run -A jsr:@lockness/ui/cli list
```
````

Components are copied to `app/view/components/ui/` by default.

```
## 🧪 Testing Strategy

- **Unit Tests**: Test registry parsing, path resolution, import rewriting
- **Integration Tests**: Create temp project, run CLI, verify files created correctly
- **Manual Testing**: Run against actual Lockness project

## ✅ Definition of Done

- [ ] `registry.json` populated with all current components (button, card, root-layout, utils)
- [ ] `cli.ts` implements `add` and `list` commands
- [ ] Internal dependencies (utils) auto-installed when needed
- [ ] Import paths correctly rewritten in copied files
- [ ] CLI provides clear instructions for npm dependencies
- [ ] `deno.json` updated with CLI export
- [ ] README updated with CLI documentation
- [ ] Tests for CLI functionality
```
