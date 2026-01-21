import { Context, Controller, Get, Inject, route } from '@lockness/core'
import { DocsLoader } from '@service/docs_loader.ts'
import { DocsLayout } from '@view/layouts/docs_layout.tsx'
import { MarkdownRenderer } from '@view/components/markdown_renderer.tsx'
import { parseMarkdown } from '@view/helpers/markdown.ts'
import { PackagesPage } from '@view/pages/docs/packages.tsx'
import { TableDocsPage } from '@view/pages/docs/table.tsx'

/**
 * Controller for documentation pages.
 *
 * Dynamically loads documentation from colocated package docs
 * and general documentation files. Special pages (packages, table)
 * are still handled with dedicated components.
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
     * Special page: Package management overview
     * @deprecated Will be migrated to Markdown in a future update
     */
    @Get('/packages', { name: 'docs.packages' })
    packages(c: Context) {
        return c.html(<PackagesPage />)
    }

    /**
     * Special page: Table component documentation
     * @deprecated Will be migrated to Markdown in a future update
     */
    @Get('/table', { name: 'docs.table' })
    table(c: Context) {
        return c.html(<TableDocsPage />)
    }

    /**
     * Dynamic documentation page loader.
     *
     * Loads documentation from colocated package docs or general docs,
     * parses Markdown content, and renders with layout.
     *
     * @param c - Request context with slug parameter
     * @returns Rendered documentation page or 404 if not found
     */
    @Get('/:slug', { name: 'docs.page' })
    async page(c: Context) {
        const slug = c.req.param('slug')

        try {
            // Load documentation from colocated files
            const doc = await this.docsLoader.load(slug)

            // Parse Markdown content into structured blocks
            const blocks = parseMarkdown(doc.content)

            // Render with layout (uses slug for LLM path)
            return c.html(
                <DocsLayout
                    title={doc.title}
                    currentPath={`/docs/${slug}`}
                    llmPath={slug}
                >
                    <MarkdownRenderer blocks={blocks} />
                </DocsLayout>,
            )
        } catch (error) {
            // Log error for debugging but don't expose details to user
            console.error(`Error loading docs for slug "${slug}":`, error)
            return c.notFound()
        }
    }
}
