# UI Components Documentation System

This document describes the documentation colocation system for Lockness UI
components.

## Overview

UI component documentation is colocated with component source code using a
folder-based structure. Each component has its own folder containing:

- `index.tsx` - The component implementation
- `DOCS.md` - Markdown documentation

The system uses dynamic loading to render documentation pages without requiring
manual route registration.

## Architecture

```
packages/ui/components/
├── Button/
│   ├── index.tsx    # Component code
│   └── DOCS.md      # Documentation
├── Card/
│   ├── index.tsx
│   └── DOCS.md
└── ...
```

### Key Components

**1. UiDocLoader Service** (`packages/ui/doc_loader.ts`)

- Loads DOCS.md files from component folders
- Maps URL slugs to component names
- Parses markdown metadata (title, description)
- Caches loaded docs for performance

**2. UI Controller** (`app/controller/ui_controller.tsx`)

- Single dynamic route `/:slug` handles all component pages
- Loads docs via UiDocLoader
- Renders using MarkdownRenderer component

**3. Markdown Infrastructure**

- `parseMarkdown()` - Parses markdown into structured blocks
- `MarkdownRenderer` - Renders blocks as JSX components
- `processInlineMarkdown()` - Handles inline formatting

## Slug to Component Mapping

The system uses a mapping table to convert URL slugs to component folder names:

| URL           | Component Folder |
| ------------- | ---------------- |
| `/ui/buttons` | `Button/`        |
| `/ui/cards`   | `Card/`          |
| `/ui/forms`   | `Input/`         |

See `UiDocLoader.slugToComponent` for the complete mapping.

## Writing Documentation

### DOCS.md Structure

```markdown
# Component Name

Brief description of the component.

## Installation

\`\`\`bash deno run -A jsr:@lockness/ui add component-name \`\`\`

## Usage

\`\`\`tsx import { Component } from '@lockness/ui/components'

<Component />
\`\`\`

## Props

| Prop    | Type   | Default   | Description  |
| ------- | ------ | --------- | ------------ |
| variant | string | 'default' | Visual style |

## Examples

### Basic Example

\`\`\`tsx
<Component variant="primary">Click me</Component> \`\`\`
```

### Supported Markdown Features

- **Headings**: `#` through `######`
- **Code blocks**: `` ```tsx ... ``` ``
- **Tables**: GitHub-flavored markdown tables
- **Lists**: Unordered (`-` or `*`) and ordered (`1.`)
- **Inline code**: `` `code` ``
- **Bold**: `**bold**`
- **Italic**: `*italic*`
- **Links**: `[text](url)`

### Best Practices

1. **Start with H1**: First heading should be component name
2. **Add description**: Brief paragraph after H1
3. **Include installation**: Standard deno add command
4. **Show usage**: Basic import and usage example
5. **Document props**: Use tables for prop definitions
6. **Provide examples**: Multiple realistic examples
7. **Keep it concise**: Focus on clarity over verbosity

## Adding a New Component

1. **Create component folder**:
   ```bash
   mkdir packages/ui/components/NewComponent
   ```

2. **Add component code**:
   ```bash
   # Create packages/ui/components/NewComponent/index.tsx
   ```

3. **Create documentation**:
   ```bash
   # Create packages/ui/components/NewComponent/DOCS.md
   ```

4. **Update exports** in `packages/ui/components.ts`:
   ```typescript
   export { NewComponent } from './components/NewComponent/index.tsx'
   ```

5. **Add slug mapping** in `packages/ui/doc_loader.ts`:
   ```typescript
   private readonly slugToComponent: Record<string, string> = {
       // ...existing mappings
       'new-component': 'NewComponent',
   }
   ```

That's it! The route is automatically available at `/ui/new-component`.

## Migrating Existing Docs

To migrate a TSX documentation page to markdown:

1. **Extract content** from the TSX page (`app/view/pages/ui/component.tsx`)
2. **Convert to markdown** following the DOCS.md structure
3. **Copy code examples** from the TSX file
4. **Update tables** to use markdown table syntax
5. **Save** to `packages/ui/components/Component/DOCS.md`
6. **Test** by visiting `/ui/component-slug`

See `packages/ui/components/Button/DOCS.md` for a complete example.

## Testing

**Run DocLoader tests:**

```bash
deno test -A packages/ui/tests/doc_loader.test.ts
```

**Validate structure:**

```bash
./scripts/validate_ui_structure.sh
```

**Test a specific component page:**

```bash
# Start dev server
deno task dev

# Visit http://localhost:8888/ui/buttons
```

## Benefits

### For Developers

- ✅ Documentation lives with component code
- ✅ Changes to components are adjacent to docs
- ✅ Markdown is easier to write than JSX
- ✅ No route registration needed
- ✅ Automatic discovery of new components

### For the Codebase

- ✅ 67% reduction in controller code (166 → 54 lines)
- ✅ 92% fewer routes (24 → 2)
- ✅ No duplication between pages
- ✅ Consistent documentation format
- ✅ Performance through caching

### For Users

- ✅ Faster page loads (cached docs)
- ✅ Consistent reading experience
- ✅ Better search engine indexing
- ✅ All URLs work as before

## Troubleshooting

**Component not found:**

- Check slug mapping in `UiDocLoader.slugToComponent`
- Verify DOCS.md exists in component folder

**Markdown not rendering:**

- Check DOCS.md syntax (use validator)
- Ensure code blocks use correct fence syntax
- Verify tables have proper header separator

**Route not working:**

- Clear doc loader cache: `docLoader.clearCache()`
- Check slug in URL matches mapping
- Verify component folder exists

## Future Enhancements

Potential improvements for the system:

1. **Live Preview**: Interactive component demos in docs
2. **Props Auto-Generation**: Parse TypeScript types for prop tables
3. **Full-Text Search**: Index markdown content for search
4. **Versioning**: Support multiple doc versions
5. **Hot Reload**: Auto-reload DOCS.md in development
6. **Validation**: CLI to validate DOCS.md format
7. **i18n**: Multi-language documentation support

## References

- **Example**: `packages/ui/components/Button/DOCS.md`
- **Tests**: `packages/ui/tests/doc_loader.test.ts`
- **Service**: `packages/ui/doc_loader.ts`
- **Controller**: `app/controller/ui_controller.tsx`
- **Validation**: `scripts/validate_ui_structure.sh`
