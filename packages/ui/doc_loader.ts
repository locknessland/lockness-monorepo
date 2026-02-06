/**
 * @fileoverview Service for loading and caching UI component documentation
 *
 * This service provides a centralized way to load component documentation from
 * DOCS.md files colocated with each component. It handles slug-to-component
 * mapping, markdown parsing, and caching.
 *
 * @module @lockness/ui/doc_loader
 */

import { join } from '@std/path'

/**
 * Parsed component documentation metadata and content
 */
export interface ComponentDoc {
    /** Component name (e.g., 'Button') */
    name: string
    /** URL slug (e.g., 'buttons') */
    slug: string
    /** Parsed title from markdown (first H1) */
    title: string
    /** Parsed description (first paragraph after H1) */
    description: string
    /** Full markdown content */
    content: string
    /** Relative path to the source file */
    relativePath: string
}

/**
 * Example section with live preview and code
 */
export interface ExampleSection {
    title: string
    render: () => unknown
}

/**
 * Component examples module export shape
 */
export interface ComponentExamplesModule {
    examples: ExampleSection[]
    [key: string]: unknown
}

/**
 * Service for loading UI component documentation
 *
 * Features:
 * - Slug-to-component name mapping
 * - Markdown file loading from component folders
 * - Automatic title and description parsing
 * - In-memory caching for performance
 *
 * @example
 * ```ts
 * const loader = new UiDocLoader()
 * const doc = await loader.load('buttons')
 * console.log(doc.title) // "Button"
 * ```
 */
export class UiDocLoader {
    private cache = new Map<string, ComponentDoc>()
    private llmCache = new Map<string, string>()
    private baseDir: string
    private version: string | null = null

    /**
     * Mapping of URL slugs to component folder names
     */
    private readonly slugToComponent: Record<string, string> = {
        'buttons': 'Button',
        'cards': 'Card',
        'feature-cards': 'FeatureCard',
        'inputs': 'Input',
        'textareas': 'Textarea',
        'labels': 'Label',
        'checkboxes': 'Checkbox',
        'switches': 'Switch',
        'badges': 'Badge',
        'alerts': 'Alert',
        'accordion': 'Accordion',
        'modal': 'Modal',
        'table': 'Table',
        'tabs': 'Tabs',
        'progress': 'Progress',
        'circular-progress': 'CircularProgress',
        'stepped-progress': 'SteppedProgress',
        'gauge-progress': 'GaugeProgress',
        'breadcrumb': 'Breadcrumb',
        'links': 'Link',
        'spinner': 'Spinner',
        'skeleton': 'Skeleton',
        'skeletons': 'Skeleton',
        'separator': 'Separator',
        'separators': 'Separator',
        'gallery': 'Gallery',
        'video': 'Video',
        'hero': 'Hero',
        'navbar': 'Navbar',
        'newsletter': 'Newsletter',
        'pagination': 'Pagination',
        'pricing': 'Pricing',
        'search-bar': 'SearchBar',
        'sidebar': 'Sidebar',
        'theme-switch': 'ThemeSwitch',
        'treeview': 'TreeView',
        'upload-zone': 'UploadZone',
        'keyboards': 'Kbd',
        'chart': 'Chart',
        'code-block': 'CodeBlock',
        'copy-button': 'CopyButton',
        'footer': 'Footer',
        'root-layout': 'RootLayout',
        'section': 'Section',
        'title': 'Title',
        'props-table': 'PropsTable',
        'chart-extras': 'ChartExtras',
        'forms': 'Input', // Multi-component page - map to primary component
        'navigation': 'Breadcrumb', // Multi-component page
    }

    /**
     * Create a new UiDocLoader
     *
     * @param baseDir - Base directory for components (defaults to auto-detection)
     */
    constructor(baseDir?: string) {
        // Auto-detect base directory
        if (baseDir) {
            this.baseDir = baseDir
        } else {
            // 1. Try relative to CWD first (standard for production/dist)
            const cwdComponents = join(
                Deno.cwd(),
                'packages',
                'ui',
                'components',
            )
            try {
                Deno.statSync(cwdComponents)
                this.baseDir = cwdComponents
            } catch {
                // 2. Fallback to import.meta.url (standard for development)
                try {
                    const currentFileUrl = new URL(import.meta.url)
                    const currentDir = currentFileUrl.pathname.replace(
                        '/doc_loader.ts',
                        '',
                    )
                    this.baseDir = join(currentDir, 'components')
                    Deno.statSync(this.baseDir)
                } catch {
                    // 3. Last resort fallback
                    this.baseDir = cwdComponents
                }
            }
        }
        // console.log(`🔍 UiDocLoader initialized with baseDir: ${this.baseDir}`)
    }

    /**
     * Load documentation for a component by slug
     *
     * @param slug - URL slug (e.g., 'buttons', 'cards')
     * @returns Parsed component documentation
     * @throws Error if component not found or DOCS.md missing
     */
    async load(slug: string): Promise<ComponentDoc> {
        // Check cache first
        if (this.cache.has(slug)) {
            return this.cache.get(slug)!
        }

        // Map slug to component name
        const componentName = this.slugToComponent[slug]
        if (!componentName) {
            throw new Error(`Unknown component slug: ${slug}`)
        }

        // Build path to DOCS.md
        const docPath = join(this.baseDir, componentName, 'DOCS.md')

        try {
            const content = await Deno.readTextFile(docPath)
            // We assume standard structure: packages/ui/components/{Name}/DOCS.md
            const relativePath =
                `packages/ui/components/${componentName}/DOCS.md`
            const doc = this.parseDoc(
                slug,
                componentName,
                content,
                relativePath,
            )

            // Cache the result
            this.cache.set(slug, doc)

            return doc
        } catch (error) {
            if (error instanceof Deno.errors.NotFound) {
                throw new Error(
                    `Documentation not found for component: ${componentName}`,
                )
            }
            throw error
        }
    }

    /**
     * Load examples for a component by slug
     *
     * @param slug - URL slug (e.g., 'buttons', 'cards')
     * @returns Component examples module or null if not found
     */
    async loadExamples(slug: string): Promise<ExampleSection[] | null> {
        // 1. Try static registry first (preferred for compiled binary/production)
        try {
            const { uiExamplesRegistry } = await import(
                './examples_registry.ts'
            )
            if (uiExamplesRegistry[slug]) {
                return uiExamplesRegistry[slug]
            }
        } catch {
            // Registry not generated or not available - fallback to dynamic discovery
        }

        // 2. Dynamic discovery fallback (standard for development)
        const componentName = this.slugToComponent[slug]
        if (!componentName) {
            return null
        }

        // Build path to examples.tsx
        const examplesPath = join(this.baseDir, componentName, 'examples.tsx')

        try {
            // Check if file exists first
            await Deno.stat(examplesPath)

            // Dynamic import of the examples module
            const module = await import(
                examplesPath
            ) as ComponentExamplesModule
            return module.examples || null
        } catch (error) {
            if (error instanceof Deno.errors.NotFound) {
                // No examples file - that's fine
                return null
            }
            console.error(
                `Failed to load examples for ${componentName}:`,
                error,
            )
            return null
        }
    }

    /**
     * Check if a component has examples
     *
     * @param slug - URL slug
     * @returns True if examples.tsx exists for this component
     */
    async hasExamples(slug: string): Promise<boolean> {
        const componentName = this.slugToComponent[slug]
        if (!componentName) {
            return false
        }

        const examplesPath = join(this.baseDir, componentName, 'examples.tsx')

        try {
            await Deno.stat(examplesPath)
            return true
        } catch {
            return false
        }
    }

    /**
     * Parse markdown content into ComponentDoc
     *
     * Extracts title from first H1 and description from first paragraph
     *
     * @param slug - URL slug
     * @param name - Component name
     * @param content - Raw markdown content
     * @returns Parsed component documentation
     */
    private parseDoc(
        slug: string,
        name: string,
        content: string,
        relativePath: string,
    ): ComponentDoc {
        // Extract title from first H1 (# Title)
        const titleMatch = content.match(/^#\s+(.+)$/m)
        const title = titleMatch?.[1]?.trim() ?? name

        // Extract description from first paragraph after H1
        // Only take plain text (not lists, code blocks, or headers)
        const descMatch = content.match(/^#[^\n]+\n\n([^#`\-\*\|>\n][^\n]+)/)
        const description = descMatch?.[1]?.trim().slice(0, 150) ?? ''

        return {
            name,
            slug,
            title,
            description,
            content,
            relativePath,
        }
    }

    /**
     * Get all available component slugs
     *
     * @returns Array of valid slugs that can be loaded
     */
    getAvailableSlugs(): string[] {
        return Object.keys(this.slugToComponent)
    }

    /**
     * Get mapping of slugs to component names
     *
     * @returns Record of slug to component name mappings
     */
    getSlugMapping(): Record<string, string> {
        return { ...this.slugToComponent }
    }

    /**
     * Clear all internal caches
     *
     * Useful for development or testing when docs are updated
     */
    clearCache(): void {
        this.cache.clear()
        this.llmCache.clear()
    }

    /**
     * Check if a slug is valid
     *
     * @param slug - URL slug to check
     * @returns True if slug maps to a component
     */
    hasSlug(slug: string): boolean {
        return slug in this.slugToComponent
    }

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
        const llmContent = await this.transformToLlmFormat(doc.content)

        // Cache the result
        this.llmCache.set(cacheKey, llmContent)

        return llmContent
    }

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

        // Build path to root docs (baseDir is components/, go up to docs/)
        const rootDocsPath = join(this.baseDir, '..', 'docs', 'DOCS.md')

        try {
            const content = await Deno.readTextFile(rootDocsPath)
            const llmContent = await this.transformToLlmFormat(content)
            this.llmCache.set(cacheKey, llmContent)
            return llmContent
        } catch (error) {
            if (error instanceof Deno.errors.NotFound) {
                throw new Error('Root UI documentation not found')
            }
            throw error
        }
    }

    /**
     * Transform markdown content to LLM-optimized plain text format
     *
     * Replaces dynamic placeholders like <version> with actual values
     * from deno.json configuration, and converts relative markdown links
     * to absolute URLs.
     *
     * @param markdown - Raw markdown content from DOCS.md
     * @returns LLM-optimized plain text with placeholders replaced
     */
    private async transformToLlmFormat(markdown: string): Promise<string> {
        let content = markdown

        // Replace <version> placeholder with actual version from deno.json
        if (content.includes('<version>')) {
            const version = await this.getVersion()
            content = content.replace(/<version>/g, version)
        }

        // Convert relative markdown links to absolute URLs
        // [text](/path) -> https://lockness.land/path
        content = content.replace(
            /\[([^\]]+)\]\(\/([^)]+)\)/g,
            'https://lockness.land/$2',
        )

        return content
    }

    /**
     * Get the package version from deno.json
     * Cached after first read
     */
    private async getVersion(): Promise<string> {
        if (this.version !== null) {
            return this.version
        }

        // Build path to deno.json (baseDir is components/, go up to package root)
        const denoJsonPath = join(this.baseDir, '..', 'deno.json')

        let version = '0.0.0'
        try {
            const content = await Deno.readTextFile(denoJsonPath)
            const config = JSON.parse(content)
            version = config.version || '0.0.0'
        } catch {
            // Fallback if deno.json not found
        }

        this.version = version
        return version
    }

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
            'chart-extras': 'chart-extras',
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

    /**
     * Check if a slug is valid for LLM loading
     */
    hasLlmsSlug(slug: string): boolean {
        return this.llmSlugToDocSlug(slug) !== undefined
    }

    /**
     * Get all available LLM slugs
     */
    getAvailableLlmsSlugs(): string[] {
        return [
            'accordion',
            'alert',
            'badge',
            'breadcrumb',
            'button',
            'card',
            'chart',
            'chart-extras',
            'checkbox',
            'circular-progress',
            'code-block',
            'copy-button',
            'feature-card',
            'footer',
            'gallery',
            'gauge-progress',
            'hero',
            'input',
            'kbd',
            'label',
            'link',
            'modal',
            'navbar',
            'newsletter',
            'pagination',
            'pricing',
            'progress',
            'root-layout',
            'search-bar',
            'section',
            'separator',
            'sidebar',
            'skeleton',
            'spinner',
            'stepped-progress',
            'switch',
            'table',
            'tabs',
            'textarea',
            'theme-switch',
            'title',
            'treeview',
            'upload-zone',
        ]
    }

    /**
     * Convert a doc slug (plural) to LLM slug (singular)
     * Used to get the LLM slug from the current page's doc slug
     *
     * @param docSlug - URL slug from docs (e.g., 'buttons', 'cards')
     * @returns LLM slug (e.g., 'button', 'card') or undefined
     */
    docSlugToLlmSlug(docSlug: string): string | undefined {
        // Mapping from doc slugs to LLM slugs
        const mapping: Record<string, string> = {
            'buttons': 'button',
            'cards': 'card',
            'feature-cards': 'feature-card',
            'inputs': 'input',
            'textareas': 'textarea',
            'labels': 'label',
            'checkboxes': 'checkbox',
            'switches': 'switch',
            'badges': 'badge',
            'alerts': 'alert',
            'accordion': 'accordion',
            'modal': 'modal',
            'table': 'table',
            'tabs': 'tabs',
            'progress': 'progress',
            'circular-progress': 'circular-progress',
            'stepped-progress': 'stepped-progress',
            'gauge-progress': 'gauge-progress',
            'breadcrumb': 'breadcrumb',
            'links': 'link',
            'spinner': 'spinner',
            'skeleton': 'skeleton',
            'skeletons': 'skeleton',
            'separator': 'separator',
            'separators': 'separator',
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
            'keyboards': 'kbd',
            'chart': 'chart',
            'code-block': 'code-block',
            'copy-button': 'copy-button',
        }

        return mapping[docSlug]
    }
}

// Re-export for convenience
export { UiDocLoader as default }
