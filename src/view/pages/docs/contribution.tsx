import { DocsLayout } from '@view/layouts/docs_layout.tsx'
import { MarkdownRenderer } from '@view/components/markdown_renderer.tsx'
import { loadMarkdownContent } from '@view/helpers/markdown.ts'

export const ContributionPage = () => {
    const content = loadMarkdownContent('contribution')

    return (
        <DocsLayout title='Contribution' currentPath='/docs/contribution' llmPath='contribution'>
            <MarkdownRenderer blocks={content} />
        </DocsLayout>
    )
}
