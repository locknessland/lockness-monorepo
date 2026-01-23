import { Inject, Service } from '@lockness/core'
import { DocsLoader } from '@service/docs_loader.ts'
import { UiDocLoader } from '../../packages/ui/doc_loader.ts'

interface LlmSection {
    name: string
    description: string
    url: string
}

@Service()
export class LlmSectionService {
    @Inject(DocsLoader)
    accessor docsLoader!: DocsLoader

    private uiDocLoader = new UiDocLoader()

    /**
     * Get all docs sections with URLs.
     * Descriptions are loaded from DocsLoader (which extracts from doc content).
     */
    async getDocsSections(): Promise<LlmSection[]> {
        const slugs = this.docsLoader.getAvailableLlmsSlugs()
        const sections: LlmSection[] = []

        for (const slug of slugs) {
            const doc = await this.docsLoader.load(slug).catch(() => null)
            const description = doc?.description || `Documentation for ${slug}`
            sections.push({
                name: slug,
                description,
                url: `https://lockness.land/docs/llms/${slug}.txt`,
            })
        }

        return sections
    }

    /**
     * Get all UI component sections with URLs.
     * Descriptions are loaded from UiDocLoader.
     */
    async getUiSections(): Promise<LlmSection[]> {
        const slugs = this.uiDocLoader.getAvailableLlmsSlugs()
        const sections: LlmSection[] = []

        for (const slug of slugs) {
            const doc = await this.uiDocLoader.load(slug).catch(() => null)
            const description = doc?.description || `UI component: ${slug}`
            sections.push({
                name: slug,
                description,
                url: `https://lockness.land/ui/llms/${slug}.txt`,
            })
        }

        return sections
    }

    /**
     * Generate the root /llms.txt index that aggregates all links
     */
    async generateIndexText(): Promise<string> {
        const docsSections = await this.getDocsSections()
        const uiSections = await this.getUiSections()

        return [
            'Lockness Framework - LLM Documentation Index',
            '=============================================',
            '',
            'This is the main index for all LLM-optimized documentation.',
            '',
            '## Sub-indexes',
            '',
            '- https://lockness.land/docs/llms.txt - Framework documentation index',
            '- https://lockness.land/ui/llms.txt - UI components index',
            '',
            '## Framework Documentation (/docs/llms/*.txt)',
            '',
            ...docsSections.map((s) => `- ${s.url} - ${s.description}`),
            '',
            '## UI Components (/ui/llms/*.txt)',
            '',
            ...uiSections.map((s) => `- ${s.url} - ${s.description}`),
            '',
            'Usage: Fetch any endpoint to get plain text documentation optimized for LLM consumption.',
        ].join('\n')
    }
}
