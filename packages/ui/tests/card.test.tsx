import { assertStringIncludes } from '@std/assert'
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '../components/Card.tsx'

/**
 * Helper to render a component to string
 */
function renderToString(component: unknown): string {
    const result = component as unknown as { toString: () => string }
    return result.toString()
}

Deno.test('Card components', async (t) => {
    await t.step('Card renders with base styles', () => {
        const html = renderToString(
            <Card>
                <div>Content</div>
            </Card>,
        )
        assertStringIncludes(html, 'rounded-(--radius)')
        assertStringIncludes(html, 'bg-card')
        assertStringIncludes(html, 'text-card-foreground')
        assertStringIncludes(html, 'border')
        assertStringIncludes(html, 'Content')
    })

    await t.step('Card forwards custom class', () => {
        const html = renderToString(
            <Card class='custom-card'>Content</Card>,
        )
        assertStringIncludes(html, 'custom-card')
    })

    await t.step('CardHeader renders with spacing', () => {
        const html = renderToString(
            <CardHeader>
                <div>Header</div>
            </CardHeader>,
        )
        assertStringIncludes(html, 'flex')
        assertStringIncludes(html, 'p-(--card-header-padding)')
        assertStringIncludes(html, 'Header')
    })

    await t.step('CardTitle renders as h3 with font styles', () => {
        const html = renderToString(<CardTitle>My Title</CardTitle>)
        assertStringIncludes(html, '<h3')
        assertStringIncludes(html, 'text-(length:--card-title-font-size)')
        assertStringIncludes(html, 'font-semibold')
        assertStringIncludes(html, 'My Title')
    })

    await t.step('CardDescription renders with muted text', () => {
        const html = renderToString(
            <CardDescription>Description text</CardDescription>,
        )
        assertStringIncludes(html, '<p')
        assertStringIncludes(html, 'text-sm')
        assertStringIncludes(html, 'text-muted-foreground')
        assertStringIncludes(html, 'Description text')
    })

    await t.step('CardContent renders with padding', () => {
        const html = renderToString(
            <CardContent>
                <p>Main content</p>
            </CardContent>,
        )
        assertStringIncludes(html, 'p-(--card-content-padding)')
        assertStringIncludes(html, 'pt-0')
        assertStringIncludes(html, 'Main content')
    })

    await t.step('CardFooter renders with flex layout', () => {
        const html = renderToString(
            <CardFooter>
                <button type='button'>Action</button>
            </CardFooter>,
        )
        assertStringIncludes(html, 'flex')
        assertStringIncludes(html, 'items-center')
        assertStringIncludes(html, 'Action')
    })

    await t.step('renders full card composition', () => {
        const html = renderToString(
            <Card>
                <CardHeader>
                    <CardTitle>User Profile</CardTitle>
                    <CardDescription>Manage your account</CardDescription>
                </CardHeader>
                <CardContent>
                    <p>Profile information</p>
                </CardContent>
                <CardFooter>
                    <button type='button'>Save</button>
                </CardFooter>
            </Card>,
        )

        assertStringIncludes(html, 'User Profile')
        assertStringIncludes(html, 'Manage your account')
        assertStringIncludes(html, 'Profile information')
        assertStringIncludes(html, 'Save')
    })

    await t.step('all components forward HTML attributes', () => {
        const cardHtml = renderToString(<Card id='my-card'>Test</Card>)
        assertStringIncludes(cardHtml, 'id="my-card"')

        const headerHtml = renderToString(
            <CardHeader data-test='header'>Test</CardHeader>,
        )
        assertStringIncludes(headerHtml, 'data-test="header"')

        const titleHtml = renderToString(
            <CardTitle aria-label='title'>Test</CardTitle>,
        )
        assertStringIncludes(titleHtml, 'aria-label="title"')
    })
})
