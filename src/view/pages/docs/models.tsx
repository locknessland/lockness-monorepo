import { DocsLayout } from '@view/layouts/docs_layout.tsx'
import { PageTitle } from '@view/components/page_title.tsx'

export const ModelsPage = () => (
    <DocsLayout title='Models' currentPath='/docs/models'>
        <div class='prose prose-invert max-w-none'>
            <PageTitle>Models & Database</PageTitle>
            <p class='text-lg'>Full documentation coming soon...</p>
        </div>
    </DocsLayout>
)
