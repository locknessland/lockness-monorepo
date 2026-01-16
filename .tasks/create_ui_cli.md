# Technical Task: Implement CLI for @lockness/ui

## 📋 Task Overview

Implement a Command Line Interface (CLI) for the `@lockness/ui` package. This
tool aims to provide a developer experience similar to `shadcn/ui`, allowing
users to selectively "add" components to their projects. instead of installing
the entire library as a dependency. The CLI will fetch component source code and
install it directly into the user's codebase (e.g., `src/components/ui/`),
giving them full ownership and customization capabilities.

## 🎯 Objectives

1. **Component Registry**: Create a `registry.json` that maps component names to
   their source files and dependencies.
2. **CLI Entry Point**: Create a `cli.ts` script executable via `deno run`.
3. **Add Command**: Implement the `add [component]` command to fetch and install
   components.
4. **Dependency Management**: Ensure the CLI handles necessary dependencies
   (like `clsx`, `tailwind-merge`) when adding components.
5. **Project Integration**: Update `packages/ui/deno.json` to expose the CLI
   script.

## 📁 Affected File Paths

### New Files to Create

- `/packages/ui/cli.ts` - Main CLI entry point.
- `/packages/ui/registry.json` - JSON catalog of available components.

### Files to Modify

- `/packages/ui/deno.json` - Add the `bin` task or configuration for the CLI.
- `/packages/ui/README.md` - Document CLI usage.

## 🏗️ Architecture Principles

- **Zero-Dependency Runtime (for the CLI)**: Use standard library (`@std/cli`,
  `@std/fs`) where possible to keep the CLI lightweight.
- **Source-First**: The CLI treats the component source code as the product, not
  the compiled output.
- **Idempotency**: Adding a component that already exists should prompt for
  overwrite or skip.

## 📝 Detailed Implementation Steps

### Phase 1: Registry & Configuration

**Step 1.1: Define Registry Structure**

File: `/packages/ui/registry.json` Define the schema for the registry. It should
include the component name, source file paths, and external dependencies.

```json
{
    "button": {
        "name": "button",
        "files": [
            {
                "path": "components/Button.tsx",
                "target": "components/ui/Button.tsx"
            }
        ],
        "dependencies": ["npm:clsx", "npm:tailwind-merge"]
    },
    "card": {
        "name": "card",
        "files": [
            {
                "path": "components/Card.tsx",
                "target": "components/ui/Card.tsx"
            }
        ],
        "dependencies": ["npm:clsx", "npm:tailwind-merge"]
    }
}
```

**Step 1.2: CLI Entry Point**

File: `/packages/ui/cli.ts` Set up the basic CLI structure using `Deno.args`.
Parse the command (e.g., `add`) and the target component(s).

### Phase 2: The `add` Command

**Step 2.1: Fetching Logic**

Implement logic to read the `registry.json`. Since the CLI might be run from a
local install or remote (JSR), ensure it can resolve the registry and component
source files correctly.

- If running from local, read files from disk.
- If running from JSR/remote, might need to fetch raw content from GitHub or
  included assets.

**Step 2.2: Installation Logic**

Implement the file writing logic.

- Check if target directory exists (`src/components/ui/` by default,
  customizable via flags?).
- Write the component files.
- Resolve imports if necessary (e.g., if `Button.tsx` imports `cn` from
  `lib/utils.ts`, ensure `utils.ts` is also installed or paths are corrected).

**Step 2.3: Dependency Check**

Check `deno.json` in the user's project to see if dependencies (like `clsx`) are
present. If not, instruct the user to add them or add them automatically.

### Phase 3: Documentation & Polish

**Step 3.1: Update README**

Add a section to `/packages/ui/README.md` explaining how to use the CLI:
`deno run -A jsr:@lockness/ui/cli add button`

## 🧪 Testing Strategy

- **Manual Testing**: Run the CLI against a mock project structure.
- **Unit Tests**: Test the registry parsing and path resolution logic.

## ✅ Definition of Done

- [ ] `registry.json` is populated with initial components (`button`, `card`).
- [ ] `add` command works and copies files to `src/components/ui/`.
- [ ] CLI correctly identifies missing dependencies.
- [ ] Documentation updated with CLI instructions.
