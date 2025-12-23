import { DocsLayout } from '@view/layouts/docs_layout.tsx'
import { MarkdownRenderer } from '@view/components/markdown_renderer.tsx'
import { loadMarkdownContent } from '@view/helpers/markdown.ts'

export const RoutingPage = () => {
    const content = loadMarkdownContent('routing')
    
    return (
        <DocsLayout title='Routing & Controllers' currentPath='/docs/routing'>
            <MarkdownRenderer blocks={content} />
        </DocsLayout>
    )
}
