import { DocsLayout } from '@view/layouts/docs_layout.tsx'
import { MarkdownRenderer } from '@view/components/markdown_renderer.tsx'
import { loadMarkdownContent } from '@view/helpers/markdown.ts'

export const GettingStartedPage = () => {
    const content = loadMarkdownContent('getting-started')

    return (
        <DocsLayout
            title='Getting Started'
            currentPath='/docs/getting-started'
            llmPath='getting-started'
        >
            <MarkdownRenderer blocks={content} />
        </DocsLayout>
    )
}
