import { Inject, LlmLoader, Service } from '@lockness/core'

interface LlmSection {
    name: string
    description: string
}

interface PackageDenoJson {
    description?: string
}

@Service()
export class LlmSectionService {
    @Inject(LlmLoader)
    accessor loader!: LlmLoader

    /**
     * Mapping of route names to package directories for dynamic description loading
     * For package-specific docs, we can extract description from deno.json
     */
    private readonly routeToPackage: Record<string, string> = {
        'authentication': 'auth',
        'auth-provider': 'auth-provider',
        'cache': 'cache',
        'cli': 'cli',
        'core': 'core',
        'dependency-injection': 'container',
        'deprecation': 'deprecation-contracts',
        'devtools': 'devtools',
        'drizzle': 'drizzle',
        'events': 'events',
        'hono': 'hono',
        'init': 'init',
        'inertia': 'inertia',
        'logger': 'logger',
        'mail': 'mail',
        'openapi': 'openapi',
        'queue': 'queue',
        'sessions': 'session',
        'socialite': 'socialite',
        'sse': 'sse',
        'storage': 'storage',
        'ui': 'ui',
        'upgrade': 'upgrade',
        'validation': 'validator',
    }

    /**
     * Fallback descriptions for non-package documentation
     * (general docs, sub-files, etc.)
     */
    private readonly fallbackDescriptions: Record<string, string> = {
        'lockness': 'Core principles and philosophy of Lockness',
        'installation': 'Installation and setup guide',
        'getting-started': 'First steps with Lockness',
        'routing': 'Controllers, decorators, and routing',
        'models': 'Database models with Drizzle ORM',
        'middleware': 'Class-based middleware',
        'nessy': 'Nessy CLI wrapper',
        'components': 'JSX components for views',
        'ui-treeview': 'TreeView component documentation',
        'packages': 'Official Lockness packages',
        'architecture': 'Framework architecture and design',
        'testing': 'Testing guide and best practices',
        'deployment': 'Deployment and production setup',
        'error-handling': 'Error handling and custom error pages',
        'contribution': 'Contributing to Lockness',
        'full': 'Complete framework documentation',
    }

    /**
     * Get description for a documentation section
     * Tries to read from package deno.json first, falls back to static descriptions
     */
    private async getDescription(name: string): Promise<string> {
        // Check if this is a package-specific doc
        const packageName = this.routeToPackage[name]
        if (packageName) {
            try {
                const denoJsonPath = `packages/${packageName}/deno.json`
                const content = await Deno.readTextFile(denoJsonPath)
                const denoJson: PackageDenoJson = JSON.parse(content)
                if (denoJson.description) {
                    return denoJson.description
                }
            } catch {
                // If reading fails, fall through to fallback
            }
        }

        // Use fallback description or generate one
        return this.fallbackDescriptions[name] ?? `Documentation for ${name}`
    }

    async getAllSections(): Promise<LlmSection[]> {
        const names = this.loader.getAvailableDocuments()
        const sections: LlmSection[] = []

        for (const name of names) {
            sections.push({
                name,
                description: await this.getDescription(name),
            })
        }

        return sections
    }

    async getSectionByName(name: string): Promise<LlmSection | undefined> {
        if (!this.loader.has(name)) {
            return undefined
        }
        return {
            name,
            description: await this.getDescription(name),
        }
    }

    getSectionNames(): string[] {
        return this.loader.getAvailableDocuments()
    }

    async generateIndexText(): Promise<string> {
        const sections = await this.getAllSections()
        return [
            'Lockness Framework - LLM Documentation Index',
            '=============================================',
            '',
            'Complete list of available documentation files:',
            '',
            ...sections.map((s) =>
                `- https://lockness.land/llms/${s.name}.txt - ${s.description}`
            ),
            '',
            'Usage: Fetch any endpoint to get plain text documentation optimized for LLM consumption.',
            '',
            'Example: https://lockness.land/llms/routing.txt',
        ].join('\n')
    }
}
