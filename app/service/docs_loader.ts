/**
 * @fileoverview Documentation loader service for dynamic doc loading.
 *
 * Loads documentation files from packages and general docs directory,
 * with caching and auto-discovery capabilities.
 *
 * @module @service/docs_loader
 */

import { CacheServiceToken, ICache, Inject, Service } from '@lockness/core'
import { join } from 'node:path'
import { exists } from '@std/fs'
import { isDevelopment } from '@/config/app.ts'

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
    /** Relative path to the source file */
    readonly relativePath: string
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
    /** Global cache service */
    @Inject(CacheServiceToken)
    accessor cache!: ICache

    /**
     * Mapping of URL slugs to file paths.
     * This provides the link between URL routes and documentation files.
     */
    private readonly slugToPath: Record<string, string> = {
        // Package-specific docs
        'authentication': 'packages/auth/docs/DOCS.md',
        'auth-provider': 'packages/auth-provider/docs/DOCS.md',
        'caching': 'packages/cache/docs/DOCS.md',
        'cli': 'packages/cli/docs/DOCS.md',
        'routing': 'packages/core/docs/routing.md',
        'middleware': 'packages/core/docs/middleware.md',
        'compose': 'packages/core/docs/compose.md',
        'mount-points': 'packages/core/docs/mount-points.md',
        'components': 'packages/core/docs/components.md',
        'error-handling': 'packages/core/docs/error-handling.md',
        'dependency-injection': 'packages/container/docs/DOCS.md',
        'deprecation': 'packages/deprecation-contracts/docs/DOCS.md',
        'devtools': 'packages/devtools/docs/DOCS.md',
        'drizzle': 'packages/drizzle/docs/DOCS.md',
        'events': 'packages/events/docs/DOCS.md',
        'hono': 'packages/hono/docs/DOCS.md',
        'inertia': 'packages/inertia/docs/DOCS.md',
        'init': 'packages/init/docs/DOCS.md',
        'logging': 'packages/logger/docs/DOCS.md',
        'mail': 'packages/mail/docs/DOCS.md',
        'markdown': 'packages/markdown/docs/DOCS.md',
        'openapi': 'packages/openapi/docs/DOCS.md',
        'queues': 'packages/queue/docs/DOCS.md',
        'sessions': 'packages/session/docs/DOCS.md',
        'socialite': 'packages/socialite/docs/DOCS.md',
        'sse': 'packages/sse/docs/DOCS.md',
        'storage': 'packages/storage/docs/DOCS.md',
        'upgrade': 'packages/upgrade/docs/DOCS.md',
        'validation': 'packages/validator/docs/DOCS.md',
        'ui': 'packages/ui/docs/DOCS.md',

        // General docs (not package-specific)
        'installation': 'docs/installation.md',
        'getting-started': 'docs/getting-started.md',
        'architecture': 'docs/architecture.md',
        'lifecycle-events': 'docs/lifecycle-events.md',
        'testing': 'docs/testing.md',
        'contribution': 'docs/contribution.md',
        'deployment': 'docs/deployment.md',
        'models': 'docs/models.md',
        'nessy': 'docs/nessy.md',
        'packages': 'docs/packages.md',
        'compilation': 'docs/compilation.md',
        'dependencies': 'docs/dependencies.md',
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
        // Build cache key
        const cacheKey = `docs:page:${slug}`

        // Return cached version if available (only in production)
        if (!isDevelopment) {
            const cached = await this.cache.get<DocPage>(cacheKey)
            if (cached) return cached
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

        // Parse metadata
        const doc = this.parseDoc(slug, relativePath, content)

        // Cache the result in production (1 hour TTL)
        if (!isDevelopment) {
            await this.cache.set(cacheKey, doc, 3600)
        }

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
        // Only take the first line of text after H1 (not code blocks or lists)
        const descMatch = content.match(/^#[^\n]+\n\n([^\n#`\-\*\|>]+)/)
        const description = descMatch?.[1]?.trim()?.slice(0, 200) ?? ''

        // Determine package from path
        const packageMatch = path.match(/^packages\/([^/]+)\//)
        const packageName = packageMatch?.[1]

        return {
            slug,
            title,
            description,
            content,
            package: packageName,
            relativePath: path,
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

    /** Cached version from deno.jsonc */
    private version: string | null = null

    /**
     * Mapping of LLM slugs to Markdown source files.
     * LLM content is dynamically generated from these sources.
     */
    private readonly llmsSlugToSource: Record<string, string> = {
        // General docs
        'installation': 'docs/installation.md',
        'getting-started': 'docs/getting-started.md',
        'architecture': 'docs/architecture.md',
        'lifecycle-events': 'docs/lifecycle-events.md',
        'models': 'docs/models.md',
        'nessy': 'docs/nessy.md',
        'testing': 'docs/testing.md',
        'deployment': 'docs/deployment.md',
        'contribution': 'docs/contribution.md',
        'packages': 'docs/packages.md',
        'compilation': 'docs/compilation.md',
        'dependencies': 'docs/dependencies.md',

        // Core sub-docs - keep separate for readability
        'middleware': 'packages/core/docs/middleware.md',
        'compose': 'packages/core/docs/compose.md',
        'routing': 'packages/core/docs/routing.md',
        'mount-points': 'packages/core/docs/mount-points.md',
        'error-handling': 'packages/core/docs/error-handling.md',
        'components': 'packages/core/docs/components.md',

        // Package docs - use DOCS.md
        'authentication': 'packages/auth/docs/DOCS.md',
        'auth-provider': 'packages/auth-provider/docs/DOCS.md',
        'caching': 'packages/cache/docs/DOCS.md',
        'cli': 'packages/cli/docs/DOCS.md',
        'dependency-injection': 'packages/container/docs/DOCS.md',
        'deprecation': 'packages/deprecation-contracts/docs/DOCS.md',
        'devtools': 'packages/devtools/docs/DOCS.md',
        'drizzle': 'packages/drizzle/docs/DOCS.md',
        'events': 'packages/events/docs/DOCS.md',
        'hono': 'packages/hono/docs/DOCS.md',
        'inertia': 'packages/inertia/docs/DOCS.md',
        'init': 'packages/init/docs/DOCS.md',
        'logging': 'packages/logger/docs/DOCS.md',
        'mail': 'packages/mail/docs/DOCS.md',
        'markdown': 'packages/markdown/docs/DOCS.md',
        'openapi': 'packages/openapi/docs/DOCS.md',
        'queues': 'packages/queue/docs/DOCS.md',
        'sessions': 'packages/session/docs/DOCS.md',
        'socialite': 'packages/socialite/docs/DOCS.md',
        'sse': 'packages/sse/docs/DOCS.md',
        'storage': 'packages/storage/docs/DOCS.md',
        'upgrade': 'packages/upgrade/docs/DOCS.md',
        'validation': 'packages/validator/docs/DOCS.md',
    }

    /**
     * Special LLM files that are read directly (not generated from Markdown).
     * These are curated files that don't have a 1:1 Markdown correspondence.
     */
    private readonly llmsStaticFiles: Record<string, string> = {
        // All static LLM files have been migrated to DOCS.md format
    }

    /**
     * Load LLM documentation by slug.
     *
     * Dynamically generates LLM content from Markdown sources,
     * with caching for performance. Special files (lockness, packages, full)
     * are read directly from static .txt files.
     */
    async loadLlms(slug: string): Promise<string> {
        // Build cache key
        const cacheKey = `docs:llm:${slug}`

        // Check cache first (only in production)
        if (!isDevelopment) {
            const cached = await this.cache.get<string>(cacheKey)
            if (cached) return cached
        }

        // Check if it's a static file
        if (slug in this.llmsStaticFiles) {
            const cwd = Deno.cwd()
            const path = join(cwd, this.llmsStaticFiles[slug])
            try {
                const content = await Deno.readTextFile(path)
                if (!isDevelopment) {
                    await this.cache.set(cacheKey, content, 3600)
                }
                return content
            } catch (error) {
                throw new Error(
                    `Failed to read static LLM file: ${path} - ${error}`,
                )
            }
        }

        // Check if it's a dynamic source
        const sourcePath = this.llmsSlugToSource[slug]
        if (sourcePath) {
            const cwd = Deno.cwd()
            const path = join(cwd, sourcePath)

            try {
                let content = await Deno.readTextFile(path)
                content = await this.transformToLlmFormat(content)
                if (!isDevelopment) {
                    await this.cache.set(cacheKey, content, 3600)
                }
                return content
            } catch (error) {
                throw new Error(
                    `Failed to read LLM documentation source: ${path} - ${error}`,
                )
            }
        }

        throw new Error(`Unknown LLM documentation slug: ${slug}`)
    }

    /**
     * Transform Markdown content to LLM-friendly format.
     *
     * Performs:
     * - Version placeholder replacement (<version> -> actual version)
     * - Relative link conversion ([text](/path) -> https://lockness.land/path)
     */
    private async transformToLlmFormat(markdown: string): Promise<string> {
        let content = markdown

        // Replace <version> placeholder with actual version
        if (content.includes('<version>')) {
            const version = await this.getVersion()
            content = content.replace(/<version>/g, version)
        }

        // Convert relative markdown links to absolute URLs
        content = content.replace(
            /\[([^\]]+)\]\(\/([^)]+)\)/g,
            '[$1](https://lockness.land/$2)',
        )

        return content
    }

    /**
     * Get the framework version from deno.jsonc.
     * Cached after first read.
     */
    private async getVersion(): Promise<string> {
        if (this.version) return this.version

        // Priority 1: Environment variable (standard for compiled binaries/containers)
        const envVersion = Deno.env.get('APP_VERSION')
        if (envVersion) {
            this.version = envVersion
            return this.version
        }

        try {
            // Priority 2: deno.jsonc (standard for development monorepo)
            const denoJsonPath = join(Deno.cwd(), 'deno.jsonc')

            if (!await exists(denoJsonPath)) {
                this.version = '0.0.0'
                return this.version
            }

            const content = await Deno.readTextFile(denoJsonPath)
            // Handle JSONC (with comments) - simple approach
            const jsonWithoutComments = content.replace(
                /\/\/.*$/gm,
                '',
            )
            const config = JSON.parse(jsonWithoutComments)
            this.version = config.version || '0.0.0'
        } catch {
            this.version = '0.0.0'
        }

        return this.version!
    }

    /**
     * Check if an LLM slug exists
     */
    hasLlmsSlug(slug: string): boolean {
        return slug in this.llmsSlugToSource || slug in this.llmsStaticFiles
    }

    /**
     * Get all available LLM slugs
     */
    getAvailableLlmsSlugs(): string[] {
        return [
            ...Object.keys(this.llmsSlugToSource),
            ...Object.keys(this.llmsStaticFiles),
        ]
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
    async clearCache(): Promise<void> {
        // We can't easily clear specific keys with prefixes without a pattern,
        // so we flush the whole cache. This is only for development/testing.
        await this.cache.flush()
        this.version = null
    }
}
