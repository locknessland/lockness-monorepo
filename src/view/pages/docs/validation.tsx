import { DocsLayout } from '@view/layouts/docs_layout.tsx'
import { PageTitle } from '@view/components/page_title.tsx'

export const ValidationPage = () => (
    <DocsLayout title='Validation' currentPath='/docs/validation'>
        <div class='prose prose-invert max-w-none'>
            <PageTitle>Request Validation</PageTitle>
            <p class='text-lg'>Full documentation coming soon...</p>
        </div>
    </DocsLayout>
)
