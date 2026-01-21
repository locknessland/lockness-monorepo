/**
 * LlmLoader - Dynamic loader for LLM documentation files
 *
 * This service provides a centralized way to load LLM documentation files
 * from both packages and general documentation directories.
 *
 * Convention:
 * - Each package contains `llms.txt` (with 's') following llmstxt.org standard
 * - Sub-files use `llms/{name}.txt` directory structure
 * - General docs live in `docs/llms/`
 * - URLs remain `/llms/*.txt` for backward compatibility
 *
 * @example
 * ```typescript
 * const loader = new LlmLoader()
 * const content = await loader.load('authentication') // from packages/auth/llms.txt
 * const routes = await loader.load('routing') // from packages/core/llms/routing.txt
 * ```
 */

export interface LlmDocument {
    name: string
    path: string
    description?: string
}

export interface LlmLoaderConfig {
    packagesDir?: string
    generalDir?: string
}

export class LlmLoader {
    private cache = new Map<string, string>()
    private config: Required<LlmLoaderConfig>

    /**
     * Mapping of route names to file paths
     *
     * Convention:
     * - Package main doc: 'name' -> 'packages/{pkg}/llms.txt'
     * - Package sub-docs: 'pkg-subdoc' -> 'packages/{pkg}/llms/{subdoc}.txt'
     * - General docs: 'name' -> 'docs/llms/{name}.txt'
     */
    private readonly routeToPath: Record<string, string> = {
        // Package-specific (1 package = 1 main llms.txt file)
        'authentication': 'packages/auth/llms.txt',
        'auth-provider': 'packages/auth-provider/llms.txt',
        'cache': 'packages/cache/llms.txt',
        'cli': 'packages/cli/llms.txt',
        'core': 'packages/core/llms.txt',
        'dependency-injection': 'packages/container/llms.txt',
        'deprecation': 'packages/deprecation-contracts/llms.txt',
        'devtools': 'packages/devtools/llms.txt',
        'drizzle': 'packages/drizzle/llms.txt',
        'events': 'packages/events/llms.txt',
        'hono': 'packages/hono/llms.txt',
        'init': 'packages/init/llms.txt',
        'inertia': 'packages/inertia/llms.txt',
        'logger': 'packages/logger/llms.txt',
        'mail': 'packages/mail/llms.txt',
        'openapi': 'packages/openapi/llms.txt',
        'queue': 'packages/queue/llms.txt',
        'sessions': 'packages/session/llms.txt',
        'socialite': 'packages/socialite/llms.txt',
        'sse': 'packages/sse/llms.txt',
        'storage': 'packages/storage/llms.txt',
        'ui': 'packages/ui/llms.txt',
        'upgrade': 'packages/upgrade/llms.txt',
        'validation': 'packages/validator/llms.txt',

        // Core sub-files (core has multiple documentation files)
        'middleware': 'packages/core/llms/middleware.txt',
        'routing': 'packages/core/llms/routing.txt',
        'error-handling': 'packages/core/llms/error-handling.txt',
        'components': 'packages/core/llms/components.txt',

        // UI sub-files
        'ui-treeview': 'packages/ui/llms/treeview.txt',

        // General docs (not tied to a specific package)
        'lockness': 'docs/llms/lockness.txt',
        'installation': 'docs/llms/installation.txt',
        'getting-started': 'docs/llms/getting-started.txt',
        'architecture': 'docs/llms/architecture.txt',
        'models': 'docs/llms/models.txt',
        'nessy': 'docs/llms/nessy.txt',
        'packages': 'docs/llms/packages.txt',
        'testing': 'docs/llms/testing.txt',
        'deployment': 'docs/llms/deployment.txt',
        'contribution': 'docs/llms/contribution.txt',
        'full': 'docs/llms/full.txt',
    }

    constructor(config: LlmLoaderConfig = {}) {
        this.config = {
            packagesDir: config.packagesDir ?? 'packages/',
            generalDir: config.generalDir ?? 'docs/llms/',
        }
    }

    /**
     * Load an LLM document by name
     *
     * @param name - Document name (e.g., 'authentication', 'routing')
     * @returns Document content as string
     * @throws Error if document not found
     */
    async load(name: string): Promise<string> {
        // Check cache first
        if (this.cache.has(name)) {
            return this.cache.get(name)!
        }

        const path = this.routeToPath[name]
        if (!path) {
            throw new Error(`Unknown LLM document: ${name}`)
        }

        try {
            const content = await Deno.readTextFile(path)
            this.cache.set(name, content)
            return content
        } catch (error) {
            throw new Error(
                `Failed to load LLM document '${name}' from '${path}': ${
                    error instanceof Error ? error.message : String(error)
                }`,
            )
        }
    }

    /**
     * Clear the internal cache
     *
     * Useful in development when files are updated
     */
    clearCache(): void {
        this.cache.clear()
    }

    /**
     * Get list of all available document names
     *
     * @returns Array of document names
     */
    getAvailableDocuments(): string[] {
        return Object.keys(this.routeToPath)
    }

    /**
     * Get all documents with metadata
     *
     * @returns Array of LlmDocument objects
     */
    getAllDocuments(): LlmDocument[] {
        return Object.entries(this.routeToPath).map(([name, path]) => ({
            name,
            path,
        }))
    }

    /**
     * Check if a document exists
     *
     * @param name - Document name
     * @returns true if document exists
     */
    has(name: string): boolean {
        return name in this.routeToPath
    }
}
