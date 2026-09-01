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
            '## Full corpus (single file)',
            '',
            '- https://lockness.land/llms-full.txt - Every framework and UI doc concatenated into one file, for tools that ingest a whole corpus at once.',
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

    /**
     * Generate the `/llms-full.txt` corpus: the full text of every framework and
     * UI documentation section concatenated into a single file.
     *
     * Where `generateIndexText` lists links, this inlines the content — for AI
     * tools that ingest an entire corpus at once rather than fetching per-page.
     * Each section is preceded by a heading and its canonical source URL. A
     * section that fails to load is skipped with a warning rather than failing
     * the whole document, so one unreadable file cannot blank the endpoint.
     *
     * @returns The concatenated plain-text corpus.
     *
     * @example
     * ```typescript
     * const corpus = await service.generateFullText()  // GET /llms-full.txt body
     * ```
     */
    async generateFullText(): Promise<string> {
        const parts: string[] = [
            'Lockness Framework - Full LLM Documentation',
            '===========================================',
            '',
            'The complete framework and UI documentation, concatenated for LLM',
            'consumption. Index with per-page links: https://lockness.land/llms.txt',
            '',
        ]

        await this.appendSections(
            parts,
            '# Framework Documentation',
            this.docsLoader.getAvailableLlmsSlugs(),
            (slug) => this.docsLoader.loadLlms(slug),
            (slug) => `https://lockness.land/docs/llms/${slug}.txt`,
        )
        await this.appendSections(
            parts,
            '# UI Components',
            this.uiDocLoader.getAvailableLlmsSlugs(),
            (slug) => this.uiDocLoader.loadLlms(slug),
            (slug) => `https://lockness.land/ui/llms/${slug}.txt`,
        )

        return parts.join('\n')
    }

    /**
     * Append a titled group of full-text sections to a corpus buffer.
     *
     * @param parts - The buffer being built (mutated in place).
     * @param heading - The group heading (e.g. `# Framework Documentation`).
     * @param slugs - The section slugs to load.
     * @param loadText - Loads a section's full text by slug.
     * @param sourceUrl - Builds a section's canonical source URL by slug.
     */
    private async appendSections(
        parts: string[],
        heading: string,
        slugs: string[],
        loadText: (slug: string) => Promise<string>,
        sourceUrl: (slug: string) => string,
    ): Promise<void> {
        parts.push(heading, '')
        for (const slug of slugs) {
            let content: string
            try {
                content = await loadText(slug)
            } catch (error) {
                // Skip an unreadable section rather than blanking the corpus,
                // but never silently — the missing page is logged for triage.
                console.warn(
                    `llms-full.txt: skipping "${slug}" — ${
                        error instanceof Error ? error.message : String(error)
                    }`,
                )
                continue
            }
            parts.push(
                `## ${slug}`,
                `Source: ${sourceUrl(slug)}`,
                '',
                content,
                '',
                '---',
                '',
            )
        }
    }
}
