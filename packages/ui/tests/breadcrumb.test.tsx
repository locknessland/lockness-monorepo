import { test } from 'node:test'
import { assertStringIncludes } from '@std/assert'
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from '../components/Breadcrumb/mod.tsx'

/**
 * Helper to render a component to string
 */
function renderToString(component: unknown): string {
    const result = component as unknown as { toString: () => string }
    return result.toString()
}

test('Breadcrumb components', async (t) => {
    await t.test('renders complete breadcrumb', () => {
        const html = renderToString(
            <Breadcrumb>
                <BreadcrumbList>
                    <BreadcrumbItem>
                        <BreadcrumbLink href='/'>Home</BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                        <BreadcrumbPage>Current</BreadcrumbPage>
                    </BreadcrumbItem>
                </BreadcrumbList>
            </Breadcrumb>,
        )
        assertStringIncludes(html, 'aria-label="breadcrumb"')
        assertStringIncludes(html, 'Home')
        assertStringIncludes(html, 'Current')
        assertStringIncludes(html, '/')
    })

    await t.test('BreadcrumbLink renders href', () => {
        const html = renderToString(
            <BreadcrumbLink href='/products'>Products</BreadcrumbLink>,
        )
        assertStringIncludes(html, 'href="/products"')
        assertStringIncludes(html, 'Products')
    })

    await t.test('BreadcrumbPage renders current page', () => {
        const html = renderToString(<BreadcrumbPage>Current</BreadcrumbPage>)
        assertStringIncludes(html, 'aria-current="page"')
        assertStringIncludes(html, 'Current')
    })

    await t.test('BreadcrumbSeparator uses default separator', () => {
        const html = renderToString(<BreadcrumbSeparator />)
        assertStringIncludes(html, '/')
    })

    await t.test('BreadcrumbSeparator accepts custom content', () => {
        const html = renderToString(
            <BreadcrumbSeparator>›</BreadcrumbSeparator>,
        )
        assertStringIncludes(html, '›')
    })
})
