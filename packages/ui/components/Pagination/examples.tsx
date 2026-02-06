/**
 * @fileoverview Live examples for Pagination component
 */

import { Card, CardContent } from '../Card/mod.tsx'
import { CodeBlock } from '../CodeBlock/mod.tsx'
import {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationNext,
    PaginationPrevious,
    SimplePagination,
} from './mod.tsx'
import { createDocsSection } from '../../docs_renderer.tsx'

export interface ExampleSection {
    title: string
    render: () => unknown
}

export const examples: ExampleSection[] = [
    // Documentation section - renders DOCS.md content
    createDocsSection('Pagination'),
    {
        title: 'Basic Pagination',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-6'>
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
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`import { Pagination } from '@lockness/ui/components'

<Pagination
    currentPage={5}
    totalPages={10}
    baseUrl="/users"
/>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'With Unpoly Navigation',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <Pagination
                            currentPage={3}
                            totalPages={8}
                            baseUrl='/ui/pagination'
                            up-target='#content'
                            up-preload
                            up-transition='cross-fade'
                        />
                    </CardContent>
                </Card>
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
            </div>
        ),
    },
    {
        title: 'Sibling Count',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-6'>
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
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<Pagination
    currentPage={10}
    totalPages={20}
    baseUrl="/search"
    siblingCount={2}
/>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Custom Page Parameter',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-4'>
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
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<Pagination
    currentPage={2}
    totalPages={5}
    baseUrl="/search?q=lockness"
    pageParam="p"
/>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Simple Pagination',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-6'>
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
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`import { SimplePagination } from '@lockness/ui/components'

<SimplePagination
    currentPage={3}
    totalPages={10}
    baseUrl="/articles"
    showPageInfo
    up-target="#main"
/>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Custom Composition',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
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
                    </CardContent>
                </Card>
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
            </div>
        ),
    },
    {
        title: 'Few Pages',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-6'>
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
            </div>
        ),
    },
]
