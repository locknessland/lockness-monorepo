# Technical Task: Create @lockness/ui Package

## 📋 Task Overview

Implement a new package `@lockness/ui` within the monorepo. This package aims to
provide a collection of Hono JSX components powered by Tailwind CSS and Unpoly
for interactivity. Inspired by shadcn/ui, the components are designed to be
copy-pasteable or installed via CLI, allowing users to own the code and
customize it easily. The goal is to provide a robust UI foundation for Lockness
applications that works offline (local assets) and integrates seamlessly with
Deno.

## 🎯 Objectives

1. **Framework Foundation**: Create the basic structure of the `@lockness/ui`
   package with proper configuration (`deno.json`, `mod.ts`).
2. **Utility Infrastructure**: Implement a `cn` utility for robust class name
   merging (clsx + tailwind-merge).
3. **Atomic Components**: Implement core atomic components (`Button`, `Card`,
   `Typography`, etc.) using Hono JSX and Tailwind CSS.
4. **Layout System**: Create a `RootLayout` component that handles HTML
   structure and injects Unpoly via CDN.
5. **Integration**: Ensure components accept standard HTML attributes
   (`h.JSX.HTMLAttributes`) to support Unpoly directives and custom attributes.
6. **CLI Tooling**: Implement a CLI to add components to the user's project
   (`deno run -Ar jsr:@lockness/ui add [component]`).

## 📁 Affected File Paths

### New Package Structure to Create

- `/packages/ui/deno.json` - Package configuration, JSX settings, and CLI entry
  point.
- `/packages/ui/mod.ts` - Main entry point exporting components and utilities.
- `/packages/ui/cli.ts` - CLI entry point for adding components.
- `/packages/ui/registry.json` - Registry definition mapping component names to
  file paths/URLs.
- `/packages/ui/README.md` - Documentation for usage.

### Core Utilities

- `/packages/ui/lib/utils.ts` - Implementation of the `cn` function.

### Components

- `/packages/ui/components/Button.tsx` - Button component with variants.
- `/packages/ui/components/Card.tsx` - Compound Card components (Card, Header,
  Title, Content, Footer).
- `/packages/ui/components/RootLayout.tsx` - Base HTML layout injecting local
  scripts/styles.

## 🏗️ Architecture Principles

### Component Design

- **Headless/Styled Split**: Components should be accessible and styled with
  Tailwind CSS, but easily customizable.
- **Composition**: Use compound component patterns where appropriate (e.g.,
  `Card.Header`, `Card.Content`).
- **Interactivity**: Leverage Unpoly for interactions (SPA-like navigation)
  without heavy client-side hydration.

### Dependencies

- **Tailwind CSS**: For styling (`npm:clsx`, `npm:tailwind-merge`).
- **Hono JSX**: for server-side rendering of components.
- **Unpoly**: For progressive enhancement (offline first).

## 📝 Detailed Implementation Steps

### Phase 1: Package Initialization & Utilities

**Step 1.1: Setup Package Structure**

Create directory `packages/ui` and configure `deno.json` with Hono JSX options
and typescript settings.

**Step 1.2: Implement `cn` Utility**

File: `/packages/ui/lib/utils.ts`

```typescript
import { type ClassValue, clsx } from 'npm:clsx'
import { twMerge } from 'npm:tailwind-merge'

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}
```

### Phase 2: Core Components

**Step 2.1: Button Component**

File: `/packages/ui/components/Button.tsx` Create a flexible Button component
supporting variants (primary, outline, ghost) and sizes, forwarding all props to
the underlying HTML element.

**Step 2.2: Card Component System**

File: `/packages/ui/components/Card.tsx` Implement the Card family:

- `Card`: Container with base styles.
- `CardHeader`: For titles/meta.
- `CardTitle`: Typography for headers.
- `CardContent`: Main container.
- `CardFooter`: Actions/summary.

**Step 2.3: RootLayout**

File: `/packages/ui/components/RootLayout.tsx` Implement standard HTML5
boilerplate that links to Unpoly via CDN and sets up the viewport.

Use the following CDN links:

```html
<script src="https://cdn.jsdelivr.net/npm/unpoly@3.12.1/unpoly.min.js"></script>
<link
    rel="stylesheet"
    href="https://cdn.jsdelivr.net/npm/unpoly@3.12.1/unpoly.min.css"
>
```

### Phase 3: Exports & CLI Tooling

**Step 3.1: Component Registry**

File: `/packages/ui/registry.json` Define the available components and their
specific file dependencies.

```json
{
    "button": {
        "name": "button",
        "files": ["components/Button.tsx"],
        "dependencies": []
    }
}
```

**Step 3.2: CLI Implementation**

File: `/packages/ui/cli.ts` Implement the `add` command using `@std/cli` or
similar.

- `deno run -A jsr:@lockness/ui add button`
- Should fetch the component code (from local package or GitHub raw) and write
  it to `src/components/ui/`.
- Handle installing dependencies (clsx, tailwind-merge) if missing.

**Step 3.3: Public API**

File: `/packages/ui/mod.ts` Export all components and utilities for direct
library usage (optional, if supporting both models).

**Step 3.4: Documentation**

File: `/packages/ui/README.md` Write usage instructions for both library import
and CLI usage.

## 📚 Documentation Updates Checklist

- [ ] Update `/GEMINI.md` to include `@lockness/ui` in the architecture
      overview.
- [ ] Create `/packages/ui/README.md` with installation and usage examples.
- [ ] Prepare standard LLM docs snippet for generating UI components using this
      library.

## 🧪 Testing Strategy

Since these are UI components in a Deno/Hono environment:

- **Unit Tests**: Verify that components render the expected HTML structure and
  classes with given props.
- **Snapshot Testing**: Use snapshot testing if available/feasible to track UI
  markup changes.
- **Integration**: Validate interactivity with Unpoly in a sample route (can be
  done via a playground or devtools integration). LI `add` command successfully
  installs a component.
- [ ] C

## 🔍 Quality Checks

```bash
# Check types
deno check packages/ui/**/*.ts packages/ui/**/*.tsx

# Lint code
deno lint packages/ui/

# Run tests (once set up)
deno test packages/ui/tests/
```

## ✅ Definition of Done

- [ ] Package `@lockness/ui` is created and configured.
- [ ] `cn` utility is implemented and exported.
- [ ] `Button` and `Card` components are functional and styled.
- [ ] `RootLayout` correctly includes offline assets.
- [ ] Check commands pass without errors. Unpoly via CDN
