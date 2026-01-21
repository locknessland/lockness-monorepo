# Technical Task: Framework Documentation Colocation

## 📋 Task Overview

Move framework documentation from `app/view/pages/docs/content/` to their
respective packages. Each package will contain a `docs/` folder with its
documentation. The controller will dynamically load documentation from packages.

> **Naming Convention**: Each package contains a `docs/` folder with `DOCS.md`
> as the main documentation file. URLs remain `/docs/{topic}` for backward
> compatibility.

### Current Problem

- Documentation is separated from package code
- When modifying a package, developers often forget to update its docs
- Pages in `app/view/pages/docs/` duplicate a lot of code
- No obvious link between a package and its documentation

### Proposed Solution

- Each package has a `docs/DOCS.md` file (or multiple .md files)
- The controller dynamically loads Markdown documentation
- Layout and rendering are handled by a generic component
- Convention over Configuration

## 🎯 Objectives

1. **Colocation**: Move each doc file to its respective package
2. **Auto-discovery**: Controller automatically discovers documentation
3. **Simplification**: Reduce controller code and remove TSX page files
4. **DRY**: Single rendering component for all doc pages
5. **Backward Compatibility**: Maintain same URLs `/docs/*`

## 📁 Proposed Structure

### Before (current structure)

```
app/view/pages/docs/
├── authentication.tsx
├── cli.tsx
├── routing.tsx
├── ...
└── content/
    ├── authentication.md
    ├── cli.md
    ├── routing.md
    └── ...

packages/
├── auth/
├── cli/
├── core/
└── ...
```

### After (colocated structure)

```
packages/
├── auth/
│   ├── mod.ts
│   ├── llms.txt
│   └── docs/
│       └── DOCS.md         # Authentication documentation
├── cli/
│   ├── mod.ts
│   ├── llms.txt
│   └── docs/
│       └── DOCS.md         # CLI documentation
├── core/
│   ├── mod.ts
│   ├── llms.txt
│   └── docs/
│       ├── routing.md      # Routing documentation
│       ├── middleware.md   # Middleware documentation
│       ├── components.md   # JSX Components documentation
│       └── error-handling.md
├── container/
│   └── docs/
│       └── DOCS.md         # Dependency Injection documentation
└── ...

docs/                       # General docs (not package-specific)
├── installation.md
├── getting-started.md
├── contribution.md
├── deployment.md
└── ...

app/view/pages/docs/
└── [slug].tsx             # Generic page that loads DOCS.md
```

## 📋 Documentation Mapping

| Current File                      | Destination                                   |
| --------------------------------- | --------------------------------------------- |
| `content/authentication.md`       | `packages/auth/docs/DOCS.md`                  |
| `content/cli.md`                  | `packages/cli/docs/DOCS.md`                   |
| `content/routing.md`              | `packages/core/docs/routing.md`               |
| `content/middleware.md`           | `packages/core/docs/middleware.md`            |
| `content/components.md`           | `packages/core/docs/components.md`            |
| `content/error-handling.md`       | `packages/core/docs/error-handling.md`        |
| `content/dependency-injection.md` | `packages/container/docs/DOCS.md`             |
| `content/deprecation.md`          | `packages/deprecation-contracts/docs/DOCS.md` |
| `content/devtools.md`             | `packages/devtools/docs/DOCS.md`              |
| `content/sessions.md`             | `packages/session/docs/DOCS.md`               |
| `content/validation.md`           | `packages/validator/docs/DOCS.md`             |
| `content/ui.md`                   | `packages/ui/docs/DOCS.md`                    |
| `content/installation.md`         | `docs/installation.md`                        |
| `content/getting-started.md`      | `docs/getting-started.md`                     |
| `content/contribution.md`         | `docs/contribution.md`                        |
| `content/deployment.md`           | `docs/deployment.md`                          |
| `content/models.md`               | `docs/models.md`                              |
| `content/nessy.md`                | `docs/nessy.md`                               |

## 🏗️ Architecture

### DocsLoader Service

```typescript
// app/service/docs_loader.ts

interface DocPage {
    slug: string
    title: string
    description: string
    content: string // Markdown content
    package?: string // Package name if applicable
}

@Service()
export class DocsLoader {
    private cache = new Map<string, DocPage>()

    /**
     * Mapping of URL slugs to file paths
     */
    private readonly slugToPath: Record<string, string> = {
        // Package-specific docs
        'authentication': 'packages/auth/docs/DOCS.md',
        'cli': 'packages/cli/docs/DOCS.md',
        'routing': 'packages/core/docs/routing.md',
        'middleware': 'packages/core/docs/middleware.md',
        'components': 'packages/core/docs/components.md',
        'error-handling': 'packages/core/docs/error-handling.md',
        'dependency-injection': 'packages/container/docs/DOCS.md',
        'deprecation': 'packages/deprecation-contracts/docs/DOCS.md',
        'devtools': 'packages/devtools/docs/DOCS.md',
        'sessions': 'packages/session/docs/DOCS.md',
        'validation': 'packages/validator/docs/DOCS.md',
        'ui': 'packages/ui/docs/DOCS.md',

        // General docs (not package-specific)
        'installation': 'docs/installation.md',
        'getting-started': 'docs/getting-started.md',
        'contribution': 'docs/contribution.md',
        'deployment': 'docs/deployment.md',
        'models': 'docs/models.md',
        'nessy': 'docs/nessy.md',
    }

    async load(slug: string): Promise<DocPage> {
        if (this.cache.has(slug)) {
            return this.cache.get(slug)!
        }

        const path = this.slugToPath[slug]
        if (!path) {
            throw new Error(`Unknown documentation: ${slug}`)
        }

        const content = await Deno.readTextFile(path)
        const doc = this.parseDoc(slug, path, content)
        this.cache.set(slug, doc)
        return doc
    }

    private parseDoc(slug: string, path: string, content: string): DocPage {
        // Extract title from first H1
        const titleMatch = content.match(/^#\s+(.+)$/m)
        const title = titleMatch?.[1] ?? this.slugToTitle(slug)

        // Extract description from first paragraph
        const descMatch = content.match(/^#.+\n\n(.+?)(?:\n\n|$)/s)
        const description = descMatch?.[1]?.trim() ?? ''

        // Determine package from path
        const packageMatch = path.match(/^packages\/([^/]+)\//)
        const packageName = packageMatch?.[1]

        return {
            slug,
            title,
            description,
            content,
            package: packageName,
        }
    }

    private slugToTitle(slug: string): string {
        return slug
            .split('-')
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ')
    }

    getAvailableSlugs(): string[] {
        return Object.keys(this.slugToPath)
    }

    clearCache(): void {
        this.cache.clear()
    }
}
```

### Refactored Controller

```typescript
// app/controller/docs_controller.tsx

import { Context, Controller, Get, Inject, route } from '@lockness/core'
import { DocsLoader } from '@service/docs_loader.ts'
import { DocsLayout } from '@view/layouts/docs_layout.tsx'
import { MarkdownRenderer } from '@view/components/markdown_renderer.tsx'
import { parseMarkdown } from '@view/helpers/markdown.ts'

@Controller('/docs')
export class DocsController {
    @Inject(DocsLoader)
    accessor docsLoader!: DocsLoader

    @Get('/', { name: 'docs.index' })
    index(c: Context) {
        return c.redirect(route('docs.page', { slug: 'installation' }))
    }

    @Get('/:slug', { name: 'docs.page' })
    async page(c: Context) {
        const slug = c.req.param('slug')

        try {
            const doc = await this.docsLoader.load(slug)
            const blocks = parseMarkdown(doc.content)

            return c.html(
                <DocsLayout title={doc.title}>
                    <MarkdownRenderer blocks={blocks} />
                </DocsLayout>,
            )
        } catch {
            return c.notFound()
        }
    }
}
```

## 📋 Implementation Steps

### Phase 1: Create docs/ Folders in Packages

```bash
#!/bin/bash
# scripts/create_package_docs.sh

packages=(
    "auth"
    "cli"
    "container"
    "core"
    "deprecation-contracts"
    "devtools"
    "session"
    "validator"
    "ui"
)

for pkg in "${packages[@]}"; do
    mkdir -p "packages/$pkg/docs"
done

# Create general docs folder
mkdir -p docs
```

### Phase 2: Move Documentation Files

```bash
#!/bin/bash
# scripts/migrate_docs.sh

# Package-specific docs
mv app/view/pages/docs/content/authentication.md packages/auth/docs/DOCS.md
mv app/view/pages/docs/content/cli.md packages/cli/docs/DOCS.md
mv app/view/pages/docs/content/routing.md packages/core/docs/routing.md
mv app/view/pages/docs/content/middleware.md packages/core/docs/middleware.md
mv app/view/pages/docs/content/components.md packages/core/docs/components.md
mv app/view/pages/docs/content/error-handling.md packages/core/docs/error-handling.md
mv app/view/pages/docs/content/dependency-injection.md packages/container/docs/DOCS.md
mv app/view/pages/docs/content/deprecation.md packages/deprecation-contracts/docs/DOCS.md
mv app/view/pages/docs/content/devtools.md packages/devtools/docs/DOCS.md
mv app/view/pages/docs/content/sessions.md packages/session/docs/DOCS.md
mv app/view/pages/docs/content/validation.md packages/validator/docs/DOCS.md
mv app/view/pages/docs/content/ui.md packages/ui/docs/DOCS.md

# General docs
mv app/view/pages/docs/content/installation.md docs/installation.md
mv app/view/pages/docs/content/getting-started.md docs/getting-started.md
mv app/view/pages/docs/content/contribution.md docs/contribution.md
mv app/view/pages/docs/content/deployment.md docs/deployment.md
mv app/view/pages/docs/content/models.md docs/models.md
mv app/view/pages/docs/content/nessy.md docs/nessy.md

# Clean up
rmdir app/view/pages/docs/content
```

### Phase 3: Create DocsLoader Service

Create `app/service/docs_loader.ts` with the service implementation.

### Phase 4: Refactor Controller

Simplify `docs_controller.tsx` to use dynamic loading.

### Phase 5: Remove TSX Page Files

Delete individual page files:

- `authentication.tsx`
- `cli.tsx`
- `routing.tsx`
- etc.

### Phase 6: Update Navigation

Update sidebar navigation to use the new dynamic routes.

## ✅ Acceptance Criteria

1. [ ] Each package has a `docs/` folder with documentation
2. [ ] Existing URLs `/docs/*` still work
3. [ ] Controller uses dynamic loading
4. [ ] Sidebar navigation works correctly
5. [ ] Search functionality works (if applicable)
6. [ ] Unit tests for `DocsLoader`
7. [ ] All existing documentation content is preserved

## 🧪 Testing Requirements

### Structure Validation Test

```typescript
// tests/docs_structure.test.ts

const PACKAGE_DOCS = [
    { package: 'auth', file: 'DOCS.md' },
    { package: 'cli', file: 'DOCS.md' },
    { package: 'core', file: 'routing.md' },
    { package: 'core', file: 'middleware.md' },
    { package: 'core', file: 'components.md' },
    { package: 'container', file: 'DOCS.md' },
    { package: 'deprecation-contracts', file: 'DOCS.md' },
    { package: 'devtools', file: 'DOCS.md' },
    { package: 'session', file: 'DOCS.md' },
    { package: 'validator', file: 'DOCS.md' },
    { package: 'ui', file: 'DOCS.md' },
]

const GENERAL_DOCS = [
    'installation.md',
    'getting-started.md',
    'contribution.md',
    'deployment.md',
    'models.md',
    'nessy.md',
]

Deno.test('Docs Structure - packages should have docs/', async (t) => {
    for (const { package: pkg, file } of PACKAGE_DOCS) {
        await t.step(`checking packages/${pkg}/docs/${file}`, async () => {
            const path = `packages/${pkg}/docs/${file}`
            const exists = await Deno.stat(path).catch(() => null)
            assert(exists, `Missing: ${path}`)
        })
    }
})

Deno.test('Docs Structure - general docs should exist', async (t) => {
    for (const file of GENERAL_DOCS) {
        await t.step(`checking docs/${file}`, async () => {
            const path = `docs/${file}`
            const exists = await Deno.stat(path).catch(() => null)
            assert(exists, `Missing: ${path}`)
        })
    }
})

Deno.test('Docs Structure - docs should have title', async (t) => {
    for (const { package: pkg, file } of PACKAGE_DOCS) {
        await t.step(
            `checking title in packages/${pkg}/docs/${file}`,
            async () => {
                const path = `packages/${pkg}/docs/${file}`
                const content = await Deno.readTextFile(path)
                assert(
                    content.startsWith('# '),
                    `${path} should start with # title`,
                )
            },
        )
    }
})
```

### DocsLoader Tests

```typescript
// tests/docs_loader.test.ts

Deno.test('DocsLoader - should load package doc', async () => {
    const loader = new DocsLoader()
    const doc = await loader.load('authentication')
    assert(doc.content.includes('Authentication'))
    assertEquals(doc.package, 'auth')
})

Deno.test('DocsLoader - should load general doc', async () => {
    const loader = new DocsLoader()
    const doc = await loader.load('installation')
    assert(doc.content.includes('Installation'))
    assertEquals(doc.package, undefined)
})

Deno.test('DocsLoader - should throw for unknown doc', async () => {
    const loader = new DocsLoader()
    await assertRejects(() => loader.load('unknown'))
})

Deno.test('DocsLoader - should cache loaded content', async () => {
    const loader = new DocsLoader()
    await loader.load('cli')
    // Second call should use cache
    const doc = await loader.load('cli')
    assertExists(doc)
})
```

## 📊 Benefits

| Aspect          | Before                        | After                        |
| --------------- | ----------------------------- | ---------------------------- |
| Maintainability | Docs separated from code      | Docs colocated with packages |
| Files           | ~20 TSX pages + ~20 MD files  | ~20 MD files only            |
| Controller      | ~100 lines, 1 method per page | ~30 lines, 1 dynamic method  |
| Adding docs     | Create TSX page + MD file     | Create MD file in package    |
| Update risk     | High (forget to update docs)  | Low (docs next to code)      |
| Consistency     | Variable format               | Uniform Markdown format      |

## 🔄 Migration Path

1. **Step 1**: Create `docs/` folders in packages (no breaking changes)
2. **Step 2**: Copy documentation files to new locations
3. **Step 3**: Create `DocsLoader` service
4. **Step 4**: Refactor controller to use dynamic loading
5. **Step 5**: Verify all pages work correctly
6. **Step 6**: Delete old TSX page files
7. **Step 7**: Delete old `content/` folder
8. **Step 8**: Update tests

## ⚠️ Important Considerations

### Sidebar Navigation

The sidebar needs to be updated to work with dynamic routes. Options:

1. **Static config**: Keep navigation config in a separate file
2. **Auto-generate**: Generate navigation from available slugs
3. **Frontmatter**: Add navigation metadata in Markdown frontmatter

### Special Pages

Some pages may need special handling:

- `table.tsx` - References Table component docs (should redirect to `/ui/table`)
- `packages.tsx` - Overview page listing all packages

### Core Package Has Multiple Docs

The `core` package has multiple documentation files:

- `routing.md`
- `middleware.md`
- `components.md`
- `error-handling.md`

These are accessed via different slugs but stored in the same package folder.

## 📝 Future Enhancements

- **Search Integration**: Index all Markdown content for full-text search
- **Versioning**: Support multiple documentation versions
- **Auto-linking**: Automatically link between related docs
- **API Reference**: Generate API docs from TypeScript types
- **Hot Reload**: Reload docs in dev mode without restart
- **PDF Export**: Generate PDF from Markdown documentation
