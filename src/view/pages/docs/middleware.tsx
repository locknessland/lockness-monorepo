import { DocsLayout } from '@view/layouts/docs_layout.tsx'
import { MarkdownRenderer } from '@view/components/markdown_renderer.tsx'
import { loadMarkdownContent } from '@view/helpers/markdown.ts'

export const MiddlewarePage = () => {
    const content = loadMarkdownContent('middleware')
    
    return (
        <DocsLayout title='Middleware - Lockness JS' currentPath='/docs/middleware'>
            <MarkdownRenderer blocks={content} />
        </DocsLayout>
    )
}
