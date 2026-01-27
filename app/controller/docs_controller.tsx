import { Cache, Context, Controller, Get, Inject, route } from '@lockness/core'
import { renderMarkdownWithoutTitle } from '@lockness/markdown'
import { DocsLoader } from '@service/docs_loader.ts'
import { DocsLayout } from '@view/layouts/docs_layout.tsx'

/**
 * Controller for documentation pages.
 *
 * Dynamically loads documentation from colocated package docs
 * and general documentation files. All documentation is now
 * loaded from Markdown files.
 *
 * @example
 * GET /docs                    -> Redirects to /docs/installation
 * GET /docs/authentication     -> Loads packages/auth/docs/DOCS.md
 * GET /docs/routing            -> Loads packages/core/docs/routing.md
 * GET /docs/installation       -> Loads docs/installation.md
 */
@Controller('/docs')
export class DocsController {
    @Inject(DocsLoader)
    accessor docsLoader!: DocsLoader

    /**
     * Index route - redirects to installation page
     */
    @Get('/', { name: 'docs.index' })
    index(c: Context) {
        return c.redirect(route('docs.page', { slug: 'installation' }))
    }

    /**
     * Dynamic documentation page loader.
     *
     * Loads documentation from colocated package docs or general docs,
     * renders Markdown content to HTML using @libs/markdown.
     *
     * @param c - Request context with slug parameter
     * @returns Rendered documentation page or 404 if not found
     */
    @Get('/:slug', { name: 'docs.page' })
    @Cache({ strategy: 'both', ttl: 3600 })
    async page(c: Context) {
        const slug = c.req.param('slug')

        try {
            // Load documentation from colocated files
            const doc = await this.docsLoader.load(slug)

            // Render Markdown to JSX using Lockness UI components
            const content = await renderMarkdownWithoutTitle(doc.content)

            // Render with layout (uses slug for LLM path)
            return c.html(
                <DocsLayout
                    title={doc.title}
                    currentPath={`/docs/${slug}`}
                    llmPath={slug}
                >
                    <div class='max-w-none'>
                        {content}
                    </div>
                </DocsLayout>,
            )
        } catch (error) {
            // Log error for debugging but don't expose details to user
            console.error(`Error loading docs for slug "${slug}":`, error)
            return c.notFound()
        }
    }

    /**
     * LLM index - lists all available docs llms.txt files
     */
    @Get('/llms.txt', { name: 'docs.llms.index' })
    @Cache({ strategy: 'both', ttl: 86400 })
    llmsIndex(c: Context) {
        const slugs = this.docsLoader.getAvailableLlmsSlugs()
        const baseUrl = 'https://lockness.land'

        const content = [
            'Lockness Framework - Documentation LLM Index',
            '==============================================',
            '',
            'Available documentation:',
            '',
            ...slugs.map((slug) => `- ${baseUrl}/docs/llms/${slug}.txt`),
            '',
            'Usage: Fetch any endpoint to get plain text documentation optimized for LLM consumption.',
        ].join('\n')

        return c.text(content)
    }

    /**
     * LLM documentation endpoint for docs
     * Serves llms.txt files for AI/LLM consumption
     *
     * @example /docs/llms/authentication.txt -> packages/auth/llms.txt
     */
    @Get('/llms/:slug', { extension: '.txt', name: 'docs.llms' })
    @Cache({ strategy: 'both', ttl: 86400 })
    async llms(c: Context) {
        const slug = c.req.param('slug')

        if (!this.docsLoader.hasLlmsSlug(slug)) {
            return c.notFound()
        }

        try {
            const content = await this.docsLoader.loadLlms(slug)
            return c.text(content)
        } catch (error) {
            console.error(`Failed to load LLM doc for ${slug}:`, error)
            return c.notFound()
        }
    }
}
