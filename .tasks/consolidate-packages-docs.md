# Technical Task: Consolidate Package & General Documentation LLMs

## 📋 Task Overview

This task extends the dynamic LLM generation pattern (implemented for
`@lockness/ui` in PR #63) to:

1. **Package documentation** - Generate LLM content from `packages/*/docs/`
2. **General documentation** - Generate LLM content from `docs/*.md`
3. **Core sub-docs** - Generate from `packages/core/docs/*.md` (kept separate
   for readability)

Currently, `DocsLoader` reads static `llms.txt` files. After migration, it will
dynamically generate LLM content from the Markdown source files.

## 🎯 Key Principles

1. **Keep Markdown files separate** - For web readability and better UX on the
   docs site
2. **Core package keeps multiple files** - `routing.md`, `middleware.md`,
   `components.md`, `error-handling.md` stay separate
3. **Dynamic generation** - LLM content generated at runtime from Markdown
   sources
4. **Use existing `DocsLoader`** - Extend it rather than creating new services
5. **Update sidebar** - Add new package documentation to the docs sidebar

## 📊 Current Architecture

### DocsLoader (app/service/docs_loader.ts)

Currently has two mappings:

```typescript
// For web documentation pages
slugToPath: {
    'authentication': 'packages/auth/docs/DOCS.md',
    'routing': 'packages/core/docs/routing.md',
    // ...
}

// For LLM endpoints - reads static files
llmsSlugToPath: {
    'authentication': 'packages/auth/llms.txt',
    'routing': 'packages/core/llms/routing.txt',
    'installation': 'docs/llms/installation.txt',
    // ...
}
```

### DocsController (app/controller/docs_controller.tsx)

Serves LLM content at `/docs/llms/:slug.txt`:

```typescript
@Get('/llms/:slug', { extension: '.txt', name: 'docs.llms' })
async llms(c: Context) {
    const content = await this.docsLoader.loadLlms(slug)
    return c.text(content)
}
```

### Docs Sidebar (app/view/layouts/docs_layout.tsx)

Static navigation sections - needs to be updated with new package docs.

## 📊 File Analysis

### Packages WITH `docs/DOCS.md` (7 packages)

| Package                 | Web Slug               | Status        |
| ----------------------- | ---------------------- | ------------- |
| `auth`                  | `authentication`       | ✅ In sidebar |
| `cli`                   | `cli`                  | ✅ In sidebar |
| `container`             | `dependency-injection` | ✅ In sidebar |
| `deprecation-contracts` | `deprecation`          | ✅ In sidebar |
| `devtools`              | `devtools`             | ✅ In sidebar |
| `session`               | `sessions`             | ✅ In sidebar |
| `validator`             | `validation`           | ✅ In sidebar |

### Packages WITH separate docs (core package)

| File                | Web Slug         | Status        |
| ------------------- | ---------------- | ------------- |
| `routing.md`        | `routing`        | ✅ In sidebar |
| `middleware.md`     | `middleware`     | ✅ In sidebar |
| `components.md`     | `components`     | ✅ In sidebar |
| `error-handling.md` | `error-handling` | ❌ Missing    |

### Packages WITHOUT `docs/` folder (15 packages)

These packages need `docs/DOCS.md` created from their `llms.txt`:

| Package         | Proposed Web Slug | Sidebar Section  |
| --------------- | ----------------- | ---------------- |
| `auth-provider` | `auth-provider`   | Advanced         |
| `cache`         | `caching`         | Database & State |
| `drizzle`       | `drizzle`         | Database & State |
| `events`        | `events`          | Core Concepts    |
| `hono`          | `hono`            | Advanced         |
| `inertia`       | `inertia`         | Advanced         |
| `init`          | `init`            | Development      |
| `logger`        | `logging`         | Development      |
| `mail`          | `mail`            | Advanced         |
| `openapi`       | `openapi`         | Advanced         |
| `queue`         | `queues`          | Advanced         |
| `socialite`     | `socialite`       | Authentication   |
| `sse`           | `sse`             | Advanced         |
| `storage`       | `storage`         | Database & State |
| `upgrade`       | `upgrade`         | Development      |

### General Docs (docs/ folder)

| File                 | Web Slug          | LLM Status                      |
| -------------------- | ----------------- | ------------------------------- |
| `installation.md`    | `installation`    | `docs/llms/installation.txt`    |
| `getting-started.md` | `getting-started` | `docs/llms/getting-started.txt` |
| `contribution.md`    | `contribution`    | `docs/llms/contribution.txt`    |
| `deployment.md`      | `deployment`      | `docs/llms/deployment.txt`      |
| `models.md`          | `models`          | `docs/llms/models.txt`          |
| `nessy.md`           | `nessy`           | `docs/llms/nessy.txt`           |

### Additional LLM files in docs/llms/

These have no corresponding `.md` source:

| LLM File           | Action Needed                           |
| ------------------ | --------------------------------------- |
| `architecture.txt` | Create `docs/architecture.md` or remove |
| `full.txt`         | Keep as combined doc                    |
| `lockness.txt`     | Keep as root overview                   |
| `packages.txt`     | Generate from package list              |
| `testing.txt`      | Create `docs/testing.md`                |

## 📁 Implementation Plan

### Phase 1: Extend DocsLoader for Dynamic LLM Generation

Update `DocsLoader` to generate LLM content from Markdown source instead of
reading static `llms.txt` files:

```typescript
// app/service/docs_loader.ts

@Service()
export class DocsLoader {
    private llmCache = new Map<string, string>()
    private version: string | null = null

    // Map LLM slug to Markdown source file
    private readonly llmSlugToSource: Record<string, string> = {
        // Package docs - use DOCS.md
        'authentication': 'packages/auth/docs/DOCS.md',
        'cli': 'packages/cli/docs/DOCS.md',
        'dependency-injection': 'packages/container/docs/DOCS.md',
        // ... etc

        // Core sub-docs - keep separate
        'routing': 'packages/core/docs/routing.md',
        'middleware': 'packages/core/docs/middleware.md',
        'components': 'packages/core/docs/components.md',
        'error-handling': 'packages/core/docs/error-handling.md',

        // General docs
        'installation': 'docs/installation.md',
        'getting-started': 'docs/getting-started.md',
        'contribution': 'docs/contribution.md',
        'deployment': 'docs/deployment.md',
        'models': 'docs/models.md',
        'nessy': 'docs/nessy.md',
    }

    /**
     * Load LLM content dynamically from Markdown source
     */
    async loadLlms(slug: string): Promise<string> {
        // Check cache
        if (this.llmCache.has(slug)) {
            return this.llmCache.get(slug)!
        }

        const sourcePath = this.llmSlugToSource[slug]
        if (!sourcePath) {
            throw new Error(`Unknown LLM slug: ${slug}`)
        }

        const cwd = Deno.cwd()
        const path = join(cwd, sourcePath)

        let content = await Deno.readTextFile(path)
        content = await this.transformToLlmFormat(content)

        this.llmCache.set(slug, content)
        return content
    }

    /**
     * Transform Markdown to LLM-friendly format
     */
    private async transformToLlmFormat(markdown: string): Promise<string> {
        let content = markdown

        // Replace <version> placeholder
        if (content.includes('<version>')) {
            const version = await this.getVersion()
            content = content.replace(/<version>/g, version)
        }

        // Convert relative links to absolute URLs
        content = content.replace(
            /\[([^\]]+)\]\(\/([^)]+)\)/g,
            'https://lockness.land/$2',
        )

        return content
    }

    private async getVersion(): Promise<string> {
        if (this.version) return this.version

        try {
            const denoJsonPath = join(Deno.cwd(), 'deno.jsonc')
            const content = await Deno.readTextFile(denoJsonPath)
            const config = JSON.parse(content)
            this.version = config.version || '0.0.0'
        } catch {
            this.version = '0.0.0'
        }

        return this.version
    }
}
```

### Phase 2: Create Missing docs/DOCS.md Files

For each package without `docs/DOCS.md`:

```bash
# Move llms.txt to docs/DOCS.md
mkdir -p packages/cache/docs
mv packages/cache/llms.txt packages/cache/docs/DOCS.md
```

**15 packages to migrate:**

1. `auth-provider`
2. `cache`
3. `drizzle`
4. `events`
5. `hono`
6. `inertia`
7. `init`
8. `logger`
9. `mail`
10. `openapi`
11. `queue`
12. `socialite`
13. `sse`
14. `storage`
15. `upgrade`

### Phase 3: Create Missing General Docs

Create Markdown sources for LLM files without corresponding `.md`:

1. `docs/architecture.md` - Framework architecture overview
2. `docs/testing.md` - Testing guide

### Phase 4: Update Docs Sidebar

Update `navSections` in `app/view/layouts/docs_layout.tsx`:

```typescript
const navSections: readonly NavSection[] = [
    {
        title: 'Getting Started',
        icon: RocketIcon,
        links: [
            { title: 'Installation', name: 'installation' },
            { title: 'Introduction', name: 'getting-started' },
            { title: 'Architecture', name: 'architecture' },
        ],
    },
    {
        title: 'Core Concepts',
        icon: PuzzleIcon,
        links: [
            { title: 'Routing & Controllers', name: 'routing' },
            { title: 'Dependency Injection', name: 'dependency-injection' },
            { title: 'Middleware', name: 'middleware' },
            { title: 'Validation', name: 'validation' },
            { title: 'Error Handling', name: 'error-handling' },
            { title: 'Events', name: 'events' },
        ],
    },
    {
        title: 'Database & State',
        icon: DatabaseIcon,
        links: [
            { title: 'Models & Database', name: 'models' },
            { title: 'Drizzle ORM', name: 'drizzle' },
            { title: 'Session Management', name: 'sessions' },
            { title: 'Caching', name: 'caching' },
            { title: 'Storage', name: 'storage' },
        ],
    },
    {
        title: 'Authentication',
        icon: UserIcon,
        links: [
            { title: 'Authentication', name: 'authentication' },
            { title: 'Auth Providers', name: 'auth-provider' },
            { title: 'Social Auth', name: 'socialite' },
        ],
    },
    {
        title: 'Development Tools',
        icon: WrenchIcon,
        links: [
            { title: 'Lockness Devtools', name: 'devtools' },
            { title: 'Deprecation Contracts', name: 'deprecation' },
            { title: 'CLI Engine', name: 'cli' },
            { title: 'Nessy CLI', name: 'nessy' },
            { title: 'Logging', name: 'logging' },
            { title: 'Testing', name: 'testing' },
        ],
    },
    {
        title: 'Advanced',
        icon: LayersIcon,
        links: [
            { title: 'View Components', name: 'components' },
            { title: 'UI Components', name: 'ui' },
            { title: 'Mail', name: 'mail' },
            { title: 'Queues', name: 'queues' },
            { title: 'OpenAPI', name: 'openapi' },
            { title: 'SSE', name: 'sse' },
            { title: 'Inertia', name: 'inertia' },
        ],
    },
    {
        title: 'Deployment',
        icon: RocketIcon,
        links: [
            { title: 'Deployment', name: 'deployment' },
            { title: 'Upgrade Guide', name: 'upgrade' },
        ],
    },
    {
        title: 'Contributing',
        icon: GitBranchIcon,
        links: [
            { title: 'Framework Contribution', name: 'contribution' },
        ],
    },
]
```

### Phase 5: Update DocsLoader Mappings

Add all new slugs to both `slugToPath` (for web) and `llmSlugToSource` (for
LLM):

```typescript
private readonly slugToPath: Record<string, string> = {
    // Existing...

    // New packages
    'auth-provider': 'packages/auth-provider/docs/DOCS.md',
    'caching': 'packages/cache/docs/DOCS.md',
    'drizzle': 'packages/drizzle/docs/DOCS.md',
    'events': 'packages/events/docs/DOCS.md',
    'error-handling': 'packages/core/docs/error-handling.md',
    'hono': 'packages/hono/docs/DOCS.md',
    'inertia': 'packages/inertia/docs/DOCS.md',
    'init': 'packages/init/docs/DOCS.md',
    'logging': 'packages/logger/docs/DOCS.md',
    'mail': 'packages/mail/docs/DOCS.md',
    'openapi': 'packages/openapi/docs/DOCS.md',
    'queues': 'packages/queue/docs/DOCS.md',
    'socialite': 'packages/socialite/docs/DOCS.md',
    'sse': 'packages/sse/docs/DOCS.md',
    'storage': 'packages/storage/docs/DOCS.md',
    'upgrade': 'packages/upgrade/docs/DOCS.md',

    // New general docs
    'architecture': 'docs/architecture.md',
    'testing': 'docs/testing.md',
}
```

### Phase 6: Delete Static LLM Files

After dynamic generation is working:

```bash
# Delete package llms.txt files
find packages -maxdepth 2 -name "llms.txt" -type f -delete

# Delete core/llms/ folder
rm -rf packages/core/llms/

# Delete docs/llms/ folder (except full.txt, lockness.txt, packages.txt)
rm docs/llms/installation.txt
rm docs/llms/getting-started.txt
rm docs/llms/contribution.txt
rm docs/llms/deployment.txt
rm docs/llms/models.txt
rm docs/llms/nessy.txt
rm docs/llms/architecture.txt
rm docs/llms/testing.txt
```

### Phase 7: Update Test Exemptions

```typescript
// tests/package_structure.test.ts
const EXEMPTIONS: Record<string, RequiredFile[]> = {
    ui: ['mod.ts', 'llms.txt'],
    // All packages now use dynamic LLM generation
    auth: ['llms.txt'],
    'auth-provider': ['llms.txt'],
    cache: ['llms.txt'],
    cli: ['llms.txt'],
    container: ['llms.txt'],
    core: ['llms.txt'],
    // ... etc for all packages
}
```

## 📁 Files to Create

| File                                  | Description                  |
| ------------------------------------- | ---------------------------- |
| `packages/auth-provider/docs/DOCS.md` | From `llms.txt`              |
| `packages/cache/docs/DOCS.md`         | From `llms.txt`              |
| `packages/drizzle/docs/DOCS.md`       | From `llms.txt`              |
| `packages/events/docs/DOCS.md`        | From `llms.txt`              |
| `packages/hono/docs/DOCS.md`          | From `llms.txt`              |
| `packages/inertia/docs/DOCS.md`       | From `llms.txt`              |
| `packages/init/docs/DOCS.md`          | From `llms.txt`              |
| `packages/logger/docs/DOCS.md`        | From `llms.txt`              |
| `packages/mail/docs/DOCS.md`          | From `llms.txt`              |
| `packages/openapi/docs/DOCS.md`       | From `llms.txt`              |
| `packages/queue/docs/DOCS.md`         | From `llms.txt`              |
| `packages/socialite/docs/DOCS.md`     | From `llms.txt`              |
| `packages/sse/docs/DOCS.md`           | From `llms.txt`              |
| `packages/storage/docs/DOCS.md`       | From `llms.txt`              |
| `packages/upgrade/docs/DOCS.md`       | From `llms.txt`              |
| `docs/architecture.md`                | New - framework architecture |
| `docs/testing.md`                     | New - testing guide          |

## 📁 Files to Modify

| File                               | Changes                    |
| ---------------------------------- | -------------------------- |
| `app/service/docs_loader.ts`       | Add dynamic LLM generation |
| `app/view/layouts/docs_layout.tsx` | Update sidebar navigation  |
| `tests/package_structure.test.ts`  | Add llms.txt exemptions    |

## 📁 Files to Delete

| Category         | Files                                |
| ---------------- | ------------------------------------ |
| Package llms.txt | 23 files in `packages/*/llms.txt`    |
| Core llms/       | `packages/core/llms/*.txt` (4 files) |
| Docs llms/       | Most files in `docs/llms/` (keep 3)  |

**Total deletions**: ~35 files

## ✅ Definition of Done

- [ ] `DocsLoader` generates LLM content dynamically
- [ ] All 15 packages have `docs/DOCS.md` created
- [ ] `docs/architecture.md` and `docs/testing.md` created
- [ ] Sidebar updated with new navigation items
- [ ] All static `llms.txt` files deleted
- [ ] Test exemptions updated
- [ ] `deno check` passes
- [ ] `deno lint` passes
- [ ] `deno task test` passes
- [ ] All `/docs/llms/*.txt` endpoints return correct content

## 🔗 URL Structure (No Changes)

The existing URL structure is preserved:

```
/docs/llms.txt              → Index
/docs/llms/authentication.txt → Auth package
/docs/llms/routing.txt      → Core routing
/docs/llms/installation.txt → Installation guide
...
```

---

_Task created: 2025-01-23_ _Estimated effort: 4-5 hours_ _Depends on: PR #63 (UI
consolidation) - COMPLETED_
