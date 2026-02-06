/**
 * @fileoverview Controller for UI component documentation
 *
 * Renders live examples from examples.tsx files colocated with components.
 * DOCS.md/llms.txt files are served separately for LLM consumption.
 */

import { Cache, Context, Controller, Get } from '@lockness/core'
import { ExampleSection, UiDocLoader } from '../../packages/ui/doc_loader.ts'
import { UiIndex } from '@view/pages/ui/GettingStarted.tsx'
import { PageUiLayout } from '@view/layouts/ui_layout.tsx'

// Force reload to clear cache

/**
 * Renders the examples sections for a component
 */
const ExamplesRenderer = ({ examples }: { examples: ExampleSection[] }) => {
    return (
        <div class='space-y-12'>
            {examples.map((example) => (
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        {example.title.toUpperCase()}
                    </h2>
                    {example.render()}
                </section>
            ))}
        </div>
    )
}

@Controller('/ui')
export class UiController {
    private docLoader = new UiDocLoader()

    /**
     * UI Components index page
     */
    @Get('/', { name: 'ui.index' })
    @Cache({ strategy: 'both', ttl: 3600 })
    index(c: Context) {
        return c.render(<UiIndex />)
    }

    /**
     * LLM index - serves the root @lockness/ui documentation
     * with installation instructions and component list
     */
    @Get('/llms.txt', { name: 'ui.llms.index' })
    @Cache({ strategy: 'both', ttl: 86400 })
    async llmsIndex(c: Context) {
        try {
            const content = await this.docLoader.loadRootLlms()
            return c.text(content)
        } catch (error) {
            console.error('Failed to load root LLM doc:', error)
            return c.notFound()
        }
    }

    /**
     * Dynamic route for component documentation
     * Loads examples.tsx from component folders and renders live demos
     */
    @Get('/:slug', { name: 'ui.component' })
    @Cache({ strategy: 'both', ttl: 3600 })
    async component(c: Context) {
        const slug = c.req.param('slug')

        // Check if this is a valid component slug
        if (!this.docLoader.hasSlug(slug)) {
            return c.notFound()
        }

        try {
            // Load component title and examples
            const [doc, examples] = await Promise.all([
                this.docLoader.load(slug),
                this.docLoader.loadExamples(slug),
            ])

            // Convert doc slug to LLM slug
            const llmSlug = this.docLoader.docSlugToLlmSlug(slug)

            // Render page with examples only
            return c.html(
                <PageUiLayout
                    title={doc.title}
                    llmSlug={llmSlug}
                    filePath={doc.relativePath}
                >
                    {examples
                        ? <ExamplesRenderer examples={examples} />
                        : (
                            <p class='text-muted-foreground'>
                                No examples available for this component yet.
                            </p>
                        )}
                </PageUiLayout>,
            )
        } catch (error) {
            console.error(
                `Failed to load documentation for ${slug}:`,
                error,
            )
            return c.notFound()
        }
    }

    /**
     * LLM documentation endpoint for UI components
     * Serves llms.txt files for AI/LLM consumption
     *
     * @example /ui/llms/button.txt -> packages/ui/components/Button/llms.txt
     */
    @Get('/llms/:component', { extension: '.txt', name: 'ui.llms' })
    @Cache({ strategy: 'both', ttl: 86400 })
    async llms(c: Context) {
        const component = c.req.param('component')

        if (!this.docLoader.hasLlmsSlug(component)) {
            return c.notFound()
        }

        try {
            const content = await this.docLoader.loadLlms(component)
            return c.text(content)
        } catch (error) {
            console.error(`Failed to load LLM doc for ${component}:`, error)
            return c.notFound()
        }
    }
}
