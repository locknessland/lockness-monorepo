import { DocsLayout } from '@view/layouts/docs_layout.tsx'
import { MarkdownRenderer } from '@view/components/markdown_renderer.tsx'
import { loadMarkdownContent } from '@view/helpers/markdown.ts'

export const SessionsPage = () => {
    const content = loadMarkdownContent('sessions')

    return (
        <DocsLayout title='Sessions' currentPath='/docs/sessions' llmPath='sessions'>
            <MarkdownRenderer blocks={content} />
        </DocsLayout>
    )
}
