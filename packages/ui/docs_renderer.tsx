/**
 * @fileoverview Helper for creating documentation sections in examples
 *
 * This utility provides a function that creates an ExampleSection
 * which renders the DOCS.md content for a component. This ensures
 * documentation is displayed before interactive examples.
 *
 * @module @lockness/ui/docs_renderer
 */

import { renderMarkdown } from './markdown.tsx'
import { join } from '@std/path'

/**
 * Loads and renders the DOCS.md file for a component at the path
 * specified relative to the components directory.
 *
 * @param relativePath - Path relative to components/ (e.g., 'Button/DOCS.md')
 * @returns Rendered markdown JSX
 */
async function loadAndRenderDocs(relativePath: string): Promise<unknown> {
    try {
        // Build absolute path to DOCS.md
        const currentFileUrl = new URL(import.meta.url)
        const componentsDir = currentFileUrl.pathname.replace(
            '/docs_renderer.tsx',
            '/components',
        )
        const docsPath = join(componentsDir, relativePath)

        // Read and render the markdown
        const content = await Deno.readTextFile(docsPath)
        return await renderMarkdown(content, { stripTitle: false })
    } catch (error) {
        console.error(`Failed to load DOCS.md at ${relativePath}:`, error)
        return (
            <div class='text-muted-foreground'>
                Documentation not available
            </div>
        )
    }
}

/**
 * Creates a documentation section that renders DOCS.md content
 *
 * Returns an ExampleSection object that can be included as the first
 * element in the examples array. The render function uses async/await
 * to load and parse the markdown file.
 *
 * @param componentName - The name of the component (e.g., 'Button', 'Alert')
 * @returns An ExampleSection object with the documentation render function
 *
 * @example
 * ```tsx
 * import { createDocsSection } from '../../docs_renderer.tsx'
 *
 * export const examples: ExampleSection[] = [
 *     createDocsSection('Button'),
 *     {
 *         title: 'Variants',
 *         render: () => <Button variant="primary">Click me</Button>
 *     },
 *     // ... other examples
 * ]
 * ```
 */
export function createDocsSection(componentName: string) {
    return {
        title: 'Documentation',
        // The render function is called when the page is rendered,
        // allowing async operations
        render: () => loadAndRenderDocs(`${componentName}/DOCS.md`),
    }
}
