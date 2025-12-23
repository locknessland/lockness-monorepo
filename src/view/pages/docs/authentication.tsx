import { DocsLayout } from '@view/layouts/docs_layout.tsx'
import { MarkdownRenderer } from '@view/components/markdown_renderer.tsx'
import { loadMarkdownContent } from '@view/helpers/markdown.ts'

export const AuthenticationPage = () => {
    const content = loadMarkdownContent('authentication')
    
    return (
        <DocsLayout title='Authentication - Lockness JS' currentPath='/docs/authentication'>
            <MarkdownRenderer blocks={content} />
        </DocsLayout>
    )
}
