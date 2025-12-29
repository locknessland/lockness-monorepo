import { DocsLayout } from '@view/layouts/docs_layout.tsx'
import { MarkdownRenderer } from '@view/components/markdown_renderer.tsx'
import { loadMarkdownContent } from '@view/helpers/markdown.ts'

export const DevtoolsPage = () => {
    const content = loadMarkdownContent('devtools')

    return (
        <DocsLayout
            title='DevTools'
            currentPath='/docs/devtools'
            llmPath='devtools'
        >
            <MarkdownRenderer blocks={content} />
        </DocsLayout>
    )
}
