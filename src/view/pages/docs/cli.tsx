import { DocsLayout } from '@view/layouts/docs_layout.tsx'
import { MarkdownRenderer } from '@view/components/markdown_renderer.tsx'
import { loadMarkdownContent } from '@view/helpers/markdown.ts'

export const CliPage = () => {
    const content = loadMarkdownContent('cli')

    return (
        <DocsLayout title='CLI (Cli) - Lockness JS' currentPath='/docs/cli'>
            <MarkdownRenderer blocks={content} />
        </DocsLayout>
    )
}
