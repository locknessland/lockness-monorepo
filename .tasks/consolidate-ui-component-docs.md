# Technical Task: Consolidate UI Component Documentation (Remove llms.txt Duplication)

## 📋 Task Overview

Currently, each UI component has two nearly identical documentation files:

- `DOCS.md` - Markdown documentation for web display
- `llms.txt` - Plain text documentation for LLM consumption

The content is almost always identical, creating maintenance burden and risk of
documentation drift. This task consolidates documentation into a single
`DOCS.md` file per component and generates `llms.txt` content dynamically at
runtime.

## 🎯 Objectives

1. **Remove Duplication**: Delete all `llms.txt` files from component folders
2. **Generate LLM Docs**: Create a transformation function to convert DOCS.md
   markdown to LLM-optimized plain text
3. **Update UiDocLoader**: Modify `loadLlms()` to generate content from DOCS.md
   instead of reading llms.txt
4. **Maintain API Compatibility**: Keep `/ui/llms/:component.txt` endpoints
   working identically
5. **Add Caching**: Cache generated LLM content to avoid repeated
   transformations

## 📁 Affected File Paths

### Core Files to Modify

- `/packages/ui/doc_loader.ts` - Update `loadLlms()` to transform DOCS.md
  content

### Files to Delete

**Root-level LLM file:**

```
/packages/ui/llms.txt
```

This file should be generated from `/packages/ui/docs/DOCS.md` instead.

**All `llms.txt` files in component folders (~45 files):**

```
/packages/ui/components/Accordion/llms.txt
/packages/ui/components/Alert/llms.txt
/packages/ui/components/Badge/llms.txt
/packages/ui/components/Breadcrumb/llms.txt
/packages/ui/components/Button/llms.txt
/packages/ui/components/Card/llms.txt
/packages/ui/components/Chart/llms.txt
/packages/ui/components/ChartExtras/llms.txt
/packages/ui/components/Checkbox/llms.txt
/packages/ui/components/CircularProgress/llms.txt
/packages/ui/components/CodeBlock/llms.txt
/packages/ui/components/CopyButton/llms.txt
/packages/ui/components/FeatureCard/llms.txt
/packages/ui/components/Footer/llms.txt
/packages/ui/components/Gallery/llms.txt
/packages/ui/components/GaugeProgress/llms.txt
/packages/ui/components/Hero/llms.txt
/packages/ui/components/Input/llms.txt
/packages/ui/components/Kbd/llms.txt
/packages/ui/components/Label/llms.txt
/packages/ui/components/Link/llms.txt
/packages/ui/components/Modal/llms.txt
/packages/ui/components/Navbar/llms.txt
/packages/ui/components/Newsletter/llms.txt
/packages/ui/components/Pagination/llms.txt
/packages/ui/components/Pricing/llms.txt
/packages/ui/components/Progress/llms.txt
/packages/ui/components/PropsTable/llms.txt
/packages/ui/components/RootLayout/llms.txt
/packages/ui/components/SearchBar/llms.txt
/packages/ui/components/Section/llms.txt
/packages/ui/components/Separator/llms.txt
/packages/ui/components/Sidebar/llms.txt
/packages/ui/components/Skeleton/llms.txt
/packages/ui/components/Spinner/llms.txt
/packages/ui/components/SteppedProgress/llms.txt
/packages/ui/components/Switch/llms.txt
/packages/ui/components/Table/llms.txt
/packages/ui/components/Tabs/llms.txt
/packages/ui/components/Textarea/llms.txt
/packages/ui/components/ThemeSwitch/llms.txt
/packages/ui/components/Title/llms.txt
/packages/ui/components/TreeView/llms.txt
/packages/ui/components/UploadZone/llms.txt
```

### Test Files

- `/packages/ui/tests/doc_loader.test.ts` - Update tests for new behavior

## 🏗️ Architecture Principles

### Single Source of Truth

**Current Problem**: Two files with same content lead to:

- Risk of documentation drift
- Double maintenance effort
- Confusion about which file to edit

**Solution**: DOCS.md becomes the single source of truth. LLM content is derived
from it at runtime.

### Transformation Strategy

The transformation from Markdown to LLM plain text is minimal since the content
is already identical. The main differences are:

1. **File Format**: `.md` vs `.txt` (purely cosmetic)
2. **Potential Future Enhancements**: Could strip HTML, simplify tables, etc.

For now, the transformation can be as simple as returning the DOCS.md content
directly since it's already LLM-friendly markdown.

## 🎨 Proposed API Design

### Current API (unchanged externally)

```typescript
// Controller still calls the same method
const content = await this.docLoader.loadLlms('button')
// Returns plain text content for /ui/llms/button.txt
```

### Internal Changes

```typescript
// Before: loadLlms reads llms.txt file
async loadLlms(slug: string): Promise<string> {
    const llmsPath = join(this.baseDir, componentName, 'llms.txt')
    return await Deno.readTextFile(llmsPath)
}

// After: loadLlms transforms DOCS.md content
async loadLlms(slug: string): Promise<string> {
    const doc = await this.load(slug) // Reuse existing load method
    return this.transformToLlmFormat(doc.content)
}

private transformToLlmFormat(markdown: string): string {
    // For now, markdown is already LLM-friendly
    // Future: could strip HTML, simplify complex structures
    return markdown
}
```

## 📝 Detailed Implementation Steps

### Phase 1: Update UiDocLoader

**Step 1.1: Add LLM transformation method**

File: `/packages/ui/doc_loader.ts`

```typescript
/**
 * Transform markdown content to LLM-optimized plain text format
 * 
 * Currently returns markdown as-is since it's already LLM-friendly.
 * This method provides a hook for future enhancements like:
 * - Stripping HTML tags
 * - Simplifying complex table structures
 * - Adding context headers
 * 
 * @param markdown - Raw markdown content from DOCS.md
 * @returns LLM-optimized plain text
 */
private transformToLlmFormat(markdown: string): string {
    // The DOCS.md content is already in LLM-friendly format
    // Future enhancements can be added here
    return markdown
}
```

**Step 1.2: Update loadLlms method**

File: `/packages/ui/doc_loader.ts`

```typescript
/**
 * Load LLM documentation for a component by slug
 * 
 * Dynamically generates LLM content from DOCS.md instead of reading
 * a separate llms.txt file. This eliminates documentation duplication.
 *
 * @param slug - URL slug (e.g., 'button', 'card')
 * @returns Plain text LLM documentation
 * @throws Error if component not found or DOCS.md missing
 */
async loadLlms(slug: string): Promise<string> {
    // Check LLM cache first
    const cacheKey = `llm:${slug}`
    if (this.llmCache.has(cacheKey)) {
        return this.llmCache.get(cacheKey)!
    }

    // Map LLM slug to doc slug for loading
    const docSlug = this.llmSlugToDocSlug(slug)
    if (!docSlug) {
        throw new Error(`Unknown component slug for LLM: ${slug}`)
    }

    // Load the DOCS.md content
    const doc = await this.load(docSlug)
    
    // Transform to LLM format
    const llmContent = this.transformToLlmFormat(doc.content)
    
    // Cache the result
    this.llmCache.set(cacheKey, llmContent)
    
    return llmContent
}
```

**Step 1.3: Add LLM slug to doc slug mapping**

File: `/packages/ui/doc_loader.ts`

```typescript
/**
 * Map LLM slug (singular) to doc slug (may be plural)
 * Inverse of docSlugToLlmSlug
 */
private llmSlugToDocSlug(llmSlug: string): string | undefined {
    const mapping: Record<string, string> = {
        'button': 'buttons',
        'card': 'cards',
        'feature-card': 'feature-cards',
        'input': 'inputs',
        'textarea': 'textareas',
        'label': 'labels',
        'checkbox': 'checkboxes',
        'switch': 'switches',
        'badge': 'badges',
        'alert': 'alerts',
        'accordion': 'accordion',
        'modal': 'modal',
        'table': 'table',
        'tabs': 'tabs',
        'progress': 'progress',
        'circular-progress': 'circular-progress',
        'stepped-progress': 'stepped-progress',
        'gauge-progress': 'gauge-progress',
        'breadcrumb': 'breadcrumb',
        'link': 'links',
        'spinner': 'spinner',
        'skeleton': 'skeletons',
        'separator': 'separators',
        'gallery': 'gallery',
        'hero': 'hero',
        'navbar': 'navbar',
        'newsletter': 'newsletter',
        'pagination': 'pagination',
        'pricing': 'pricing',
        'search-bar': 'search-bar',
        'sidebar': 'sidebar',
        'theme-switch': 'theme-switch',
        'treeview': 'treeview',
        'upload-zone': 'upload-zone',
        'kbd': 'keyboards',
        'chart': 'chart',
        'chart-extras': 'chart', // Maps to chart docs
        'code-block': 'code-block',
        'copy-button': 'copy-button',
        'footer': 'footer',
        'root-layout': 'root-layout',
        'section': 'section',
        'title': 'title',
        'props-table': 'props-table',
    }
    return mapping[llmSlug]
}
```

**Step 1.4: Add LLM cache**

File: `/packages/ui/doc_loader.ts`

```typescript
export class UiDocLoader {
    private cache = new Map<string, ComponentDoc>()
    private llmCache = new Map<string, string>() // Add this
    private baseDir: string

    // ... existing code ...

    /**
     * Clear all internal caches
     */
    clearCache(): void {
        this.cache.clear()
        this.llmCache.clear() // Also clear LLM cache
    }
}
```

### Phase 2: Add Missing Slug Mappings

Some components may need new entries in `slugToComponent` for doc loading:

```typescript
private readonly slugToComponent: Record<string, string> = {
    // ... existing mappings ...
    // Add any missing ones:
    'footer': 'Footer',
    'root-layout': 'RootLayout',
    'section': 'Section',
    'title': 'Title',
    'props-table': 'PropsTable',
    'chart-extras': 'ChartExtras',
    'code-block': 'CodeBlock',
    'copy-button': 'CopyButton',
}
```

### Phase 3: Handle Root-Level llms.txt

The root-level `/packages/ui/llms.txt` should also be generated dynamically from
`/packages/ui/docs/DOCS.md`.

**Step 3.1: Add method to load root documentation**

File: `/packages/ui/doc_loader.ts`

```typescript
/**
 * Load root-level UI documentation for LLM consumption
 * 
 * Generates LLM content from /packages/ui/docs/DOCS.md
 *
 * @returns Plain text LLM documentation for the entire UI library
 */
async loadRootLlms(): Promise<string> {
    const cacheKey = 'llm:root'
    if (this.llmCache.has(cacheKey)) {
        return this.llmCache.get(cacheKey)!
    }

    // Build path to root docs
    const rootDocsPath = join(this.baseDir, '..', 'docs', 'DOCS.md')

    try {
        const content = await Deno.readTextFile(rootDocsPath)
        const llmContent = this.transformToLlmFormat(content)
        this.llmCache.set(cacheKey, llmContent)
        return llmContent
    } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
            throw new Error('Root UI documentation not found')
        }
        throw error
    }
}
```

**Step 3.2: Update UI controller to use dynamic root docs**

File: `/app/controller/ui_controller.tsx`

The existing `/ui/llms.txt` endpoint should call `loadRootLlms()` instead of
serving a static file. Update or create an endpoint:

```typescript
/**
 * Root UI LLM documentation
 * Serves dynamically generated content from docs/DOCS.md
 */
@Get('/llms/ui.txt', { name: 'ui.llms.root' })
async rootLlms(c: Context) {
    try {
        const content = await this.docLoader.loadRootLlms()
        return c.text(content)
    } catch (error) {
        console.error('Failed to load root UI LLM docs:', error)
        return c.notFound()
    }
}
```

### Phase 4: Delete llms.txt Files

After verifying the new implementation works, delete all llms.txt files:

```bash
# Delete root-level llms.txt
rm packages/ui/llms.txt

# Delete all component llms.txt files
find packages/ui/components -name "llms.txt" -type f -delete
```

Or manually delete each file listed in "Files to Delete" section.

### Phase 5: Update Tests

File: `/packages/ui/tests/doc_loader.test.ts`

```typescript
Deno.test('UiDocLoader - loadLlms generates from DOCS.md', async () => {
    const loader = new UiDocLoader()

    // Load LLM content
    const llmContent = await loader.loadLlms('button')

    // Load DOCS.md content for comparison
    const doc = await loader.load('buttons')

    // LLM content should be derived from DOCS.md
    assertEquals(llmContent, doc.content)
})

Deno.test('UiDocLoader - loadLlms caches results', async () => {
    const loader = new UiDocLoader()

    // Load twice
    const first = await loader.loadLlms('button')
    const second = await loader.loadLlms('button')

    // Should return same cached content
    assertEquals(first, second)
})

Deno.test('UiDocLoader - clearCache clears LLM cache', async () => {
    const loader = new UiDocLoader()

    await loader.loadLlms('button')
    loader.clearCache()

    // Should not throw, just reload
    const content = await loader.loadLlms('button')
    assertExists(content)
})
```

## 🔄 Migration Guide

### For Developers

**Before**: Edit both `DOCS.md` and `llms.txt` when updating component docs

**After**: Edit only `DOCS.md` - LLM content is generated automatically

### No Breaking Changes

- External API (`/ui/llms/:component.txt`) remains unchanged
- Controller code unchanged
- Only internal implementation changes

## 🧪 Testing Strategy

### Unit Tests

- [ ] Test `loadLlms()` returns content from DOCS.md
- [ ] Test `loadRootLlms()` returns content from docs/DOCS.md
- [ ] Test caching works correctly
- [ ] Test cache clearing works
- [ ] Test error handling for missing components

### Integration Tests

- [ ] Test `/ui/llms/button.txt` endpoint returns content
- [ ] Test `/ui/llms/ui.txt` (root) endpoint returns content
- [ ] Test content matches DOCS.md for several components
- [ ] Verify all LLM slugs work after llms.txt deletion

### Manual Testing

1. Start dev server: `deno task dev`
2. Test LLM endpoints:
   - `curl http://localhost:8000/ui/llms/button.txt`
   - `curl http://localhost:8000/ui/llms/card.txt`
   - `curl http://localhost:8000/ui/llms/progress.txt`
   - `curl http://localhost:8000/ui/llms/ui.txt` (root docs)
3. Verify content matches DOCS.md files
4. Delete llms.txt files (root + components)
5. Verify endpoints still work

## 🔍 Quality Checks

```bash
# Type check modified files
deno check packages/ui/doc_loader.ts

# Lint
deno lint packages/ui/doc_loader.ts

# Run tests
deno test packages/ui/tests/doc_loader.test.ts
```

## ✅ Definition of Done

- [ ] `loadLlms()` method updated to use DOCS.md
- [ ] `loadRootLlms()` method added for root documentation
- [ ] LLM cache added for performance
- [ ] `llmSlugToDocSlug()` mapping complete
- [ ] Missing slug mappings added to `slugToComponent`
- [ ] Root `/packages/ui/llms.txt` file deleted
- [ ] All 45+ component `llms.txt` files deleted
- [ ] Unit tests updated and passing
- [ ] Integration tests passing
- [ ] Manual testing confirms endpoints work
- [ ] `deno check` passes
- [ ] `deno lint` passes
- [ ] All existing tests pass

## 📊 Impact Analysis

### Benefits

1. **~50 Less Files**: Root + ~45 component files removed
2. **No Drift**: Single source of truth prevents inconsistencies
3. **Simpler Workflow**: Edit one file, not two
4. **Smaller Repo**: Removes duplicate content

### Risks

- **Low Risk**: Transformation is trivial (content is identical)
- **Mitigation**: Thorough testing before deleting files

### Performance

- **Minimal Impact**: Caching prevents repeated file reads
- **Possible Improvement**: Reading one file instead of two

## 📝 Notes

### Future Enhancements

The `transformToLlmFormat()` method could be enhanced to:

1. Strip HTML tags that might be in DOCS.md
2. Simplify complex table structures for LLM parsing
3. Add component context headers (e.g., "This is documentation for...")
4. Remove web-specific sections (e.g., installation via JSR)

### Alternative Considered

**Build-time generation**: Generate llms.txt files during build instead of at
runtime. Rejected because:

- Adds build complexity
- Still has duplicate files in repo
- Runtime generation is simple enough

---

_Task created: 2026-01-23_ _Estimated effort: 2-3 hours_
