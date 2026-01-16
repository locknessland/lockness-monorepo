import { assertStringIncludes } from '@std/assert'
import { RootLayout } from '../components/RootLayout.tsx'

/**
 * Helper to render a component to string
 */
function renderToString(component: unknown): string {
    const result = component as unknown as { toString: () => string }
    return result.toString()
}

Deno.test('RootLayout component', async (t) => {
    await t.step('renders HTML5 boilerplate', () => {
        const html = renderToString(
            <RootLayout>
                <div>Content</div>
            </RootLayout>,
        )
        assertStringIncludes(html, '<html lang="en">')
        assertStringIncludes(html, '<head>')
        assertStringIncludes(html, '<body>')
        assertStringIncludes(html, 'charset="UTF-8"')
        assertStringIncludes(html, 'viewport')
    })

    await t.step('renders default title', () => {
        const html = renderToString(
            <RootLayout>
                <div>Content</div>
            </RootLayout>,
        )
        assertStringIncludes(html, '<title>Lockness App</title>')
    })

    await t.step('renders custom title', () => {
        const html = renderToString(
            <RootLayout title='My Custom App'>
                <div>Content</div>
            </RootLayout>,
        )
        assertStringIncludes(html, '<title>My Custom App</title>')
    })

    await t.step('includes Unpoly CDN links', () => {
        const html = renderToString(
            <RootLayout>
                <div>Content</div>
            </RootLayout>,
        )
        // Unpoly CSS in head
        assertStringIncludes(
            html,
            'cdn.jsdelivr.net/npm/unpoly@3.12.1/unpoly.min.css',
        )
        // Unpoly JS before closing body
        assertStringIncludes(
            html,
            'cdn.jsdelivr.net/npm/unpoly@3.12.1/unpoly.min.js',
        )
    })

    await t.step('renders children content', () => {
        const html = renderToString(
            <RootLayout>
                <main class='container'>
                    <h1>Hello World</h1>
                </main>
            </RootLayout>,
        )
        assertStringIncludes(html, '<main class="container">')
        assertStringIncludes(html, '<h1>Hello World</h1>')
    })

    await t.step('renders custom meta tags', () => {
        const html = renderToString(
            <RootLayout
                meta={[
                    <meta
                        key='desc'
                        name='description'
                        content='My app description'
                    />,
                    <meta key='og' property='og:title' content='My App' />,
                ]}
            >
                <div>Content</div>
            </RootLayout>,
        )
        assertStringIncludes(html, 'name="description"')
        assertStringIncludes(html, 'My app description')
        assertStringIncludes(html, 'property="og:title"')
    })

    await t.step('renders custom styles', () => {
        const html = renderToString(
            <RootLayout
                styles={[
                    <link key='css' rel='stylesheet' href='/css/app.css' />,
                    <style key='inline'>body {'{ margin: 0; }'}</style>,
                ]}
            >
                <div>Content</div>
            </RootLayout>,
        )
        assertStringIncludes(html, 'href="/css/app.css"')
        assertStringIncludes(html, 'body { margin: 0; }')
    })

    await t.step('renders custom scripts', () => {
        const html = renderToString(
            <RootLayout
                scripts={[
                    <script key='js' src='/js/app.js'></script>,
                    <script key='inline'>console.log("loaded")</script>,
                ]}
            >
                <div>Content</div>
            </RootLayout>,
        )
        assertStringIncludes(html, 'src="/js/app.js"')
        // Quotes are HTML-escaped in the output
        assertStringIncludes(html, 'console.log')
    })

    await t.step('renders complete page structure', () => {
        const html = renderToString(
            <RootLayout
                title='Dashboard'
                meta={[
                    <meta
                        key='desc'
                        name='description'
                        content='User dashboard'
                    />,
                ]}
                styles={[
                    <link
                        key='css'
                        rel='stylesheet'
                        href='/css/dashboard.css'
                    />,
                ]}
                scripts={[<script key='js' src='/js/dashboard.js'></script>]}
            >
                <header>
                    <h1>Dashboard</h1>
                </header>
                <main>
                    <p>Welcome back!</p>
                </main>
            </RootLayout>,
        )

        // Check all parts are present
        assertStringIncludes(html, '<title>Dashboard</title>')
        assertStringIncludes(html, 'User dashboard')
        assertStringIncludes(html, '/css/dashboard.css')
        assertStringIncludes(html, '/js/dashboard.js')
        assertStringIncludes(html, '<header>')
        assertStringIncludes(html, 'Dashboard')
        assertStringIncludes(html, 'Welcome back!')
    })
})
