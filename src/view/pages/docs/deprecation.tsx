import { DocsLayout } from '@view/layouts/docs_layout.tsx'
import { MarkdownRenderer } from '@view/components/markdown_renderer.tsx'
import { loadMarkdownContent } from '@view/helpers/markdown.ts'

export const DeprecationPage = () => {
    const content = loadMarkdownContent('deprecation')

    return (
        <DocsLayout title='Deprecation Contracts' currentPath='/docs/deprecation'>
            <MarkdownRenderer blocks={content} />
        </DocsLayout>
    )
}
