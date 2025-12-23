import { DocsLayout } from '@view/layouts/docs_layout.tsx'
import { MarkdownRenderer } from '@view/components/markdown_renderer.tsx'
import { loadMarkdownContent } from '@view/helpers/markdown.ts'

export const NessyPage = () => {
    const content = loadMarkdownContent('nessy')

    return (
        <DocsLayout title='Nessy CLI - Lockness' currentPath='/docs/nessy'>
            <MarkdownRenderer blocks={content} />
        </DocsLayout>
    )
}
