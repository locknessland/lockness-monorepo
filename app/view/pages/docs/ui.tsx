import { DocsLayout } from '@view/layouts/docs_layout.tsx'
import { MarkdownRenderer } from '@view/components/markdown_renderer.tsx'
import { loadMarkdownContent } from '@view/helpers/markdown.ts'

export const UiPage = () => {
    const content = loadMarkdownContent('ui')

    return (
        <DocsLayout
            title='UI Components - Lockness JS'
            currentPath='/docs/ui'
            llmPath='ui'
        >
            <MarkdownRenderer blocks={content} />
        </DocsLayout>
    )
}
