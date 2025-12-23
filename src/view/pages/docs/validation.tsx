import { DocsLayout } from '@view/layouts/docs_layout.tsx'
import { MarkdownRenderer } from '@view/components/markdown_renderer.tsx'
import { loadMarkdownContent } from '@view/helpers/markdown.ts'

export const ValidationPage = () => {
    const content = loadMarkdownContent('validation')
    
    return (
        <DocsLayout title='Validation' currentPath='/docs/validation'>
            <MarkdownRenderer blocks={content} />
        </DocsLayout>
    )
}
