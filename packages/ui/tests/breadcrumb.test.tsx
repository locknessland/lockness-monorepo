import { assertStringIncludes } from '@std/assert'
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from '../components/Breadcrumb.tsx'

/**
 * Helper to render a component to string
 */
function renderToString(component: unknown): string {
    const result = component as unknown as { toString: () => string }
    return result.toString()
}

Deno.test('Breadcrumb components', async (t) => {
    await t.step('renders complete breadcrumb', () => {
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

    await t.step('BreadcrumbLink renders href', () => {
        const html = renderToString(
            <BreadcrumbLink href='/products'>Products</BreadcrumbLink>,
        )
        assertStringIncludes(html, 'href="/products"')
        assertStringIncludes(html, 'Products')
    })

    await t.step('BreadcrumbPage renders current page', () => {
        const html = renderToString(<BreadcrumbPage>Current</BreadcrumbPage>)
        assertStringIncludes(html, 'aria-current="page"')
        assertStringIncludes(html, 'Current')
    })

    await t.step('BreadcrumbSeparator uses default separator', () => {
        const html = renderToString(<BreadcrumbSeparator />)
        assertStringIncludes(html, '/')
    })

    await t.step('BreadcrumbSeparator accepts custom content', () => {
        const html = renderToString(
            <BreadcrumbSeparator>›</BreadcrumbSeparator>,
        )
        assertStringIncludes(html, '›')
    })
})
