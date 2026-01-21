/**
 * Pagination Component Demo Page
 * Demonstrates the Pagination component with various configurations
 */

import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    CodeBlock,
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationNext,
    PaginationPrevious,
    SimplePagination,
} from '@lockness/ui/components'
import { PageUiLayout } from '@view/layouts/ui_layout.tsx'

export const PaginationDemo = () => {
    return (
        <PageUiLayout title='Pagination - Lockness UI' currentPath='/ui/pagination'>
            <div class='space-y-8'>
                {/* Header */}
                <div class='space-y-2'>
                    <h1 class='font-pixel text-3xl font-bold tracking-tight'>
                        Pagination
                    </h1>
                    <p class='text-(--muted-foreground)'>
                        A flexible pagination component with Unpoly navigation
                        support for seamless page transitions.
                    </p>
                </div>

                {/* Basic Pagination */}
                <Card>
                    <CardHeader>
                        <CardTitle>Basic Pagination</CardTitle>
                        <CardDescription>
                            Standard pagination with page numbers, previous and
                            next buttons
                        </CardDescription>
                    </CardHeader>
                    <CardContent class='space-y-6'>
                        <div class='flex flex-col gap-4'>
                            <p class='text-sm text-muted-foreground'>
                                Page 1 of 10:
                            </p>
                            <Pagination
                                currentPage={1}
                                totalPages={10}
                                baseUrl='/ui/pagination'
                            />
                        </div>

                        <div class='flex flex-col gap-4'>
                            <p class='text-sm text-muted-foreground'>
                                Page 5 of 10:
                            </p>
                            <Pagination
                                currentPage={5}
                                totalPages={10}
                                baseUrl='/ui/pagination'
                            />
                        </div>

                        <div class='flex flex-col gap-4'>
                            <p class='text-sm text-muted-foreground'>
                                Page 10 of 10:
                            </p>
                            <Pagination
                                currentPage={10}
                                totalPages={10}
                                baseUrl='/ui/pagination'
                            />
                        </div>

                        <CodeBlock lang='tsx'>
                            {`<Pagination
    currentPage={5}
    totalPages={10}
    baseUrl="/users"
/>`}
                        </CodeBlock>
                    </CardContent>
                </Card>

                {/* With Unpoly */}
                <Card>
                    <CardHeader>
                        <CardTitle>With Unpoly Navigation</CardTitle>
                        <CardDescription>
                            Pagination with Unpoly attributes for seamless AJAX
                            navigation
                        </CardDescription>
                    </CardHeader>
                    <CardContent class='space-y-6'>
                        <Pagination
                            currentPage={3}
                            totalPages={8}
                            baseUrl='/ui/pagination'
                            up-target='#content'
                            up-preload
                            up-transition='cross-fade'
                        />

                        <CodeBlock lang='tsx'>
                            {`<Pagination
    currentPage={3}
    totalPages={8}
    baseUrl="/posts"
    up-target="#content"
    up-preload
    up-transition="cross-fade"
/>`}
                        </CodeBlock>
                    </CardContent>
                </Card>

                {/* More Siblings */}
                <Card>
                    <CardHeader>
                        <CardTitle>More Page Numbers</CardTitle>
                        <CardDescription>
                            Show more page numbers around the current page with
                            siblingCount
                        </CardDescription>
                    </CardHeader>
                    <CardContent class='space-y-6'>
                        <div class='flex flex-col gap-4'>
                            <p class='text-sm text-muted-foreground'>
                                siblingCount=1 (default):
                            </p>
                            <Pagination
                                currentPage={10}
                                totalPages={20}
                                baseUrl='/ui/pagination'
                                siblingCount={1}
                            />
                        </div>

                        <div class='flex flex-col gap-4'>
                            <p class='text-sm text-muted-foreground'>
                                siblingCount=2:
                            </p>
                            <Pagination
                                currentPage={10}
                                totalPages={20}
                                baseUrl='/ui/pagination'
                                siblingCount={2}
                            />
                        </div>

                        <div class='flex flex-col gap-4'>
                            <p class='text-sm text-muted-foreground'>
                                siblingCount=3:
                            </p>
                            <Pagination
                                currentPage={10}
                                totalPages={20}
                                baseUrl='/ui/pagination'
                                siblingCount={3}
                            />
                        </div>

                        <CodeBlock lang='tsx'>
                            {`<Pagination
    currentPage={10}
    totalPages={20}
    baseUrl="/search"
    siblingCount={2}
/>`}
                        </CodeBlock>
                    </CardContent>
                </Card>

                {/* Custom Page Parameter */}
                <Card>
                    <CardHeader>
                        <CardTitle>Custom Page Parameter</CardTitle>
                        <CardDescription>
                            Use a custom query parameter name for the page
                            number
                        </CardDescription>
                    </CardHeader>
                    <CardContent class='space-y-6'>
                        <Pagination
                            currentPage={2}
                            totalPages={5}
                            baseUrl='/search?q=lockness'
                            pageParam='p'
                        />

                        <p class='text-sm text-muted-foreground'>
                            URLs will be: /search?q=lockness&p=1,
                            /search?q=lockness&p=2, etc.
                        </p>

                        <CodeBlock lang='tsx'>
                            {`<Pagination
    currentPage={2}
    totalPages={5}
    baseUrl="/search?q=lockness"
    pageParam="p"
/>`}
                        </CodeBlock>
                    </CardContent>
                </Card>

                {/* Simple Pagination */}
                <Card>
                    <CardHeader>
                        <CardTitle>Simple Pagination</CardTitle>
                        <CardDescription>
                            A minimal previous/next only pagination with
                            optional page info
                        </CardDescription>
                    </CardHeader>
                    <CardContent class='space-y-6'>
                        <div class='flex flex-col gap-4'>
                            <p class='text-sm text-muted-foreground'>
                                With page info:
                            </p>
                            <SimplePagination
                                currentPage={3}
                                totalPages={10}
                                baseUrl='/ui/pagination'
                                showPageInfo
                            />
                        </div>

                        <div class='flex flex-col gap-4'>
                            <p class='text-sm text-muted-foreground'>
                                Without page info:
                            </p>
                            <SimplePagination
                                currentPage={3}
                                totalPages={10}
                                baseUrl='/ui/pagination'
                                showPageInfo={false}
                            />
                        </div>

                        <CodeBlock lang='tsx'>
                            {`<SimplePagination
    currentPage={3}
    totalPages={10}
    baseUrl="/articles"
    showPageInfo
    up-target="#main"
/>`}
                        </CodeBlock>
                    </CardContent>
                </Card>

                {/* Custom Composition */}
                <Card>
                    <CardHeader>
                        <CardTitle>Custom Composition</CardTitle>
                        <CardDescription>
                            Build your own pagination using the primitive
                            components
                        </CardDescription>
                    </CardHeader>
                    <CardContent class='space-y-6'>
                        <nav
                            role='navigation'
                            aria-label='Pagination'
                            class='flex justify-center'
                        >
                            <PaginationContent>
                                <PaginationPrevious href='/ui/pagination?page=1' />
                                <PaginationItem href='/ui/pagination?page=1'>
                                    1
                                </PaginationItem>
                                <PaginationItem
                                    href='/ui/pagination?page=2'
                                    isActive
                                >
                                    2
                                </PaginationItem>
                                <PaginationItem href='/ui/pagination?page=3'>
                                    3
                                </PaginationItem>
                                <PaginationEllipsis />
                                <PaginationItem href='/ui/pagination?page=10'>
                                    10
                                </PaginationItem>
                                <PaginationNext href='/ui/pagination?page=3' />
                            </PaginationContent>
                        </nav>

                        <CodeBlock lang='tsx'>
                            {`import {
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationNext,
    PaginationPrevious,
} from '@lockness/ui/components'

<nav role="navigation" aria-label="Pagination" class="flex justify-center">
    <PaginationContent>
        <PaginationPrevious href="/users?page=1" />
        <PaginationItem href="/users?page=1">1</PaginationItem>
        <PaginationItem href="/users?page=2" isActive>2</PaginationItem>
        <PaginationItem href="/users?page=3">3</PaginationItem>
        <PaginationEllipsis />
        <PaginationItem href="/users?page=10">10</PaginationItem>
        <PaginationNext href="/users?page=3" />
    </PaginationContent>
</nav>`}
                        </CodeBlock>
                    </CardContent>
                </Card>

                {/* Few Pages */}
                <Card>
                    <CardHeader>
                        <CardTitle>Few Pages</CardTitle>
                        <CardDescription>
                            Pagination adapts gracefully to small page counts
                        </CardDescription>
                    </CardHeader>
                    <CardContent class='space-y-6'>
                        <div class='flex flex-col gap-4'>
                            <p class='text-sm text-muted-foreground'>
                                2 pages:
                            </p>
                            <Pagination
                                currentPage={1}
                                totalPages={2}
                                baseUrl='/ui/pagination'
                            />
                        </div>

                        <div class='flex flex-col gap-4'>
                            <p class='text-sm text-muted-foreground'>
                                3 pages:
                            </p>
                            <Pagination
                                currentPage={2}
                                totalPages={3}
                                baseUrl='/ui/pagination'
                            />
                        </div>

                        <div class='flex flex-col gap-4'>
                            <p class='text-sm text-muted-foreground'>
                                1 page (hidden):
                            </p>
                            <div class='p-4 border border-dashed rounded-(--radius) text-center text-muted-foreground text-sm'>
                                Pagination is hidden when totalPages ≤ 1
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Component API */}
                <Card>
                    <CardHeader>
                        <CardTitle>Component API</CardTitle>
                        <CardDescription>
                            Available props for Pagination component
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div class='overflow-x-auto'>
                            <table class='w-full text-sm'>
                                <thead>
                                    <tr class='border-b'>
                                        <th class='text-left py-2 px-4 font-medium'>
                                            Prop
                                        </th>
                                        <th class='text-left py-2 px-4 font-medium'>
                                            Type
                                        </th>
                                        <th class='text-left py-2 px-4 font-medium'>
                                            Default
                                        </th>
                                        <th class='text-left py-2 px-4 font-medium'>
                                            Description
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr class='border-b'>
                                        <td class='py-2 px-4 font-mono text-xs'>
                                            currentPage
                                        </td>
                                        <td class='py-2 px-4 font-mono text-xs'>
                                            number
                                        </td>
                                        <td class='py-2 px-4'>-</td>
                                        <td class='py-2 px-4'>
                                            Current page number (1-indexed)
                                        </td>
                                    </tr>
                                    <tr class='border-b'>
                                        <td class='py-2 px-4 font-mono text-xs'>
                                            totalPages
                                        </td>
                                        <td class='py-2 px-4 font-mono text-xs'>
                                            number
                                        </td>
                                        <td class='py-2 px-4'>-</td>
                                        <td class='py-2 px-4'>
                                            Total number of pages
                                        </td>
                                    </tr>
                                    <tr class='border-b'>
                                        <td class='py-2 px-4 font-mono text-xs'>
                                            baseUrl
                                        </td>
                                        <td class='py-2 px-4 font-mono text-xs'>
                                            string
                                        </td>
                                        <td class='py-2 px-4'>-</td>
                                        <td class='py-2 px-4'>
                                            Base URL for pagination links
                                        </td>
                                    </tr>
                                    <tr class='border-b'>
                                        <td class='py-2 px-4 font-mono text-xs'>
                                            pageParam
                                        </td>
                                        <td class='py-2 px-4 font-mono text-xs'>
                                            string
                                        </td>
                                        <td class='py-2 px-4'>"page"</td>
                                        <td class='py-2 px-4'>
                                            Query parameter name for page
                                        </td>
                                    </tr>
                                    <tr class='border-b'>
                                        <td class='py-2 px-4 font-mono text-xs'>
                                            siblingCount
                                        </td>
                                        <td class='py-2 px-4 font-mono text-xs'>
                                            number
                                        </td>
                                        <td class='py-2 px-4'>1</td>
                                        <td class='py-2 px-4'>
                                            Pages shown around current page
                                        </td>
                                    </tr>
                                    <tr class='border-b'>
                                        <td class='py-2 px-4 font-mono text-xs'>
                                            up-target
                                        </td>
                                        <td class='py-2 px-4 font-mono text-xs'>
                                            string
                                        </td>
                                        <td class='py-2 px-4'>-</td>
                                        <td class='py-2 px-4'>
                                            Unpoly target selector
                                        </td>
                                    </tr>
                                    <tr class='border-b'>
                                        <td class='py-2 px-4 font-mono text-xs'>
                                            up-preload
                                        </td>
                                        <td class='py-2 px-4 font-mono text-xs'>
                                            boolean
                                        </td>
                                        <td class='py-2 px-4'>-</td>
                                        <td class='py-2 px-4'>
                                            Enable hover preloading
                                        </td>
                                    </tr>
                                    <tr class='border-b'>
                                        <td class='py-2 px-4 font-mono text-xs'>
                                            up-transition
                                        </td>
                                        <td class='py-2 px-4 font-mono text-xs'>
                                            string
                                        </td>
                                        <td class='py-2 px-4'>-</td>
                                        <td class='py-2 px-4'>
                                            Unpoly transition effect
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>

                {/* Installation */}
                <Card>
                    <CardHeader>
                        <CardTitle>Installation</CardTitle>
                        <CardDescription>
                            Import the pagination components from @lockness/ui
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <CodeBlock lang='tsx'>
                            {`import {
    Pagination,
    SimplePagination,
    // For custom composition:
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationNext,
    PaginationPrevious,
} from '@lockness/ui/components'`}
                        </CodeBlock>
                    </CardContent>
                </Card>
            </div>
        </PageUiLayout>
    )
}
