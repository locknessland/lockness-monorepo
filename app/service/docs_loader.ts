/**
 * @fileoverview Documentation loader service for dynamic doc loading.
 *
 * Loads documentation files from packages and general docs directory,
 * with caching and auto-discovery capabilities.
 *
 * @module @service/docs_loader
 */

import { Service } from '@lockness/core'
import { join } from 'node:path'

/**
 * Parsed documentation page with metadata
 */
export interface DocPage {
    /** URL slug for the documentation page */
    readonly slug: string
    /** Page title (extracted from first H1) */
    readonly title: string
    /** Page description (extracted from first paragraph) */
    readonly description: string
    /** Raw Markdown content */
    readonly content: string
    /** Package name if doc is package-specific, undefined otherwise */
    readonly package?: string
}

/**
 * Service for loading and caching documentation files.
 *
 * Automatically discovers documentation from:
 * - Package docs: `packages/{package}/docs/DOCS.md` or specific .md files
 * - General docs: `docs/{filename}.md`
 *
 * @example
 * ```typescript
 * @Inject(DocsLoader)
 * accessor docsLoader!: DocsLoader
 *
 * const doc = await this.docsLoader.load('authentication')
 * // Loads from: packages/auth/docs/DOCS.md
 * ```
 */
@Service()
export class DocsLoader {
    /** In-memory cache of loaded documentation */
    private cache = new Map<string, DocPage>()

    /**
     * Mapping of URL slugs to file paths.
     * This provides the link between URL routes and documentation files.
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

    /**
     * Loads a documentation page by slug.
     *
     * Uses in-memory cache for already loaded pages. On cache miss,
     * reads the file from disk, parses metadata, and caches the result.
     *
     * @param slug - URL slug (e.g., 'authentication', 'routing')
     * @returns Parsed documentation page with metadata
     * @throws {Error} If the slug is unknown or file cannot be read
     *
     * @example
     * ```typescript
     * const doc = await loader.load('authentication')
     * console.log(doc.title)    // "Authentication"
     * console.log(doc.package)  // "auth"
     * ```
     */
    async load(slug: string): Promise<DocPage> {
        // Return cached version if available
        if (this.cache.has(slug)) {
            return this.cache.get(slug)!
        }

        // Get file path from slug mapping
        const relativePath = this.slugToPath[slug]
        if (!relativePath) {
            throw new Error(`Unknown documentation slug: ${slug}`)
        }

        // Build absolute path (support both dev and production)
        const cwd = Deno.cwd()
        const path = join(cwd, relativePath)

        // Read file content
        let content: string
        try {
            content = await Deno.readTextFile(path)
        } catch (error) {
            throw new Error(
                `Failed to read documentation file: ${path} - ${error}`,
            )
        }

        // Parse metadata and cache
        const doc = this.parseDoc(slug, relativePath, content)
        this.cache.set(slug, doc)
        return doc
    }

    /**
     * Parses documentation content and extracts metadata.
     *
     * Extracts:
     * - Title: From first H1 heading (`# Title`)
     * - Description: From first paragraph after H1
     * - Package: From file path (`packages/{package}/...`)
     *
     * @param slug - URL slug
     * @param path - Relative file path
     * @param content - Raw Markdown content
     * @returns Parsed doc page with metadata
     */
    private parseDoc(slug: string, path: string, content: string): DocPage {
        // Extract title from first H1
        const titleMatch = content.match(/^#\s+(.+)$/m)
        const title = titleMatch?.[1] ?? this.slugToTitle(slug)

        // Extract description from first paragraph after title
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

    /**
     * Converts a slug to a title by capitalizing words.
     *
     * Used as fallback when no H1 heading is found in the document.
     *
     * @param slug - URL slug (e.g., 'dependency-injection')
     * @returns Title-cased string (e.g., 'Dependency Injection')
     *
     * @example
     * ```typescript
     * slugToTitle('dependency-injection')  // "Dependency Injection"
     * slugToTitle('cli')                   // "Cli"
     * ```
     */
    private slugToTitle(slug: string): string {
        return slug
            .split('-')
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ')
    }

    /**
     * Returns all available documentation slugs.
     *
     * Useful for generating navigation menus or sitemaps.
     *
     * @returns Array of valid slugs
     *
     * @example
     * ```typescript
     * const slugs = loader.getAvailableSlugs()
     * // ['authentication', 'cli', 'routing', ...]
     * ```
     */
    getAvailableSlugs(): string[] {
        return Object.keys(this.slugToPath)
    }

    /**
     * Clears the in-memory documentation cache.
     *
     * Useful in development when documentation files change,
     * or for testing to reset state.
     *
     * @example
     * ```typescript
     * loader.clearCache()  // Forces reload on next access
     * ```
     */
    clearCache(): void {
        this.cache.clear()
    }
}
