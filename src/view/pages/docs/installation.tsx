import { DocsLayout } from '@view/layouts/docs_layout.tsx'
import { MarkdownRenderer } from '@view/components/markdown_renderer.tsx'
import { loadMarkdownContent } from '@view/helpers/markdown.ts'

export const InstallationPage = () => {
    const content = loadMarkdownContent('installation')

    return (
        <DocsLayout title='Installation' currentPath='/docs/installation' llmPath='installation'>
            <MarkdownRenderer blocks={content} />
        </DocsLayout>
    )
}
