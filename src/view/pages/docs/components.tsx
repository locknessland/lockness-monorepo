import { DocsLayout } from '@view/layouts/docs_layout.tsx'
import { MarkdownRenderer } from '@view/components/markdown_renderer.tsx'
import { loadMarkdownContent } from '@view/helpers/markdown.ts'

export const ComponentsPage = () => {
    const content = loadMarkdownContent('components')

    return (
        <DocsLayout
            title='Components - Lockness JS'
            currentPath='/docs/components'
            llmPath='components'
        >
            <MarkdownRenderer blocks={content} />
        </DocsLayout>
    )
}
