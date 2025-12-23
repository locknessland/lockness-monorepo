import { DocsLayout } from '@view/layouts/docs_layout.tsx'
import { MarkdownRenderer } from '@view/components/markdown_renderer.tsx'
import { loadMarkdownContent } from '@view/helpers/markdown.ts'

export const ModelsPage = () => {
    const content = loadMarkdownContent('models')

    return (
        <DocsLayout title='Models' currentPath='/docs/models'>
            <MarkdownRenderer blocks={content} />
        </DocsLayout>
    )
}
