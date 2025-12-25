import { DocsLayout } from '@view/layouts/docs_layout.tsx'
import { MarkdownRenderer } from '@view/components/markdown_renderer.tsx'
import { loadMarkdownContent } from '@view/helpers/markdown.ts'

export const DependencyInjectionPage = () => {
    const content = loadMarkdownContent('dependency-injection')

    return (
        <DocsLayout title='Dependency Injection' currentPath='/docs/dependency-injection'>
            <MarkdownRenderer blocks={content} />
        </DocsLayout>
    )
}
