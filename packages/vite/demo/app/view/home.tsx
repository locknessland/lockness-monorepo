/**
 * @fileoverview The demo home page — a JSX component rendered server-side through
 * the `@lockness/core` JSX runtime. Its `<h1>` marker is what the e2e smoke test
 * asserts on to prove SSR works end-to-end.
 *
 * @module demo/view/home
 */

/** Props for {@link Home}. */
export interface HomeProps {
    /** Pre-rendered `@lockness/vite` asset tags (script/link) for the `<head>`. */
    assetTags: string
}

/**
 * The demo home page.
 *
 * @param props - The rendered asset tags to place in the document head.
 * @returns The full HTML document as a JSX node.
 */
export function Home(props: HomeProps) {
    return (
        <html lang='en'>
            <head>
                <meta charSet='utf-8' />
                <meta
                    name='viewport'
                    content='width=device-width, initial-scale=1'
                />
                <title>Lockness + Vite Demo</title>
                <div dangerouslySetInnerHTML={{ __html: props.assetTags }} />
            </head>
            <body>
                <main>
                    <h1 data-testid='demo-heading'>Lockness + Vite Demo</h1>
                    <p>
                        This page is server-rendered through @lockness/core and
                        wired to Vite by @lockness/vite.
                    </p>
                </main>
            </body>
        </html>
    )
}
