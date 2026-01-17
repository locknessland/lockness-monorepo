import type { FC } from '@lockness/core'

/**
 * RootLayout component props
 */
export interface RootLayoutProps {
    /**
     * Page title (shows in browser tab)
     */
    title?: string
    /**
     * Additional meta tags
     */
    meta?: unknown
    /**
     * Additional stylesheets or style tags
     */
    styles?: unknown
    /**
     * Additional scripts
     */
    scripts?: unknown
    /**
     * Page content
     */
    children?: unknown
}

/**
 * RootLayout
 *
 * Base HTML layout component that provides the HTML5 boilerplate
 * and injects Unpoly via CDN for progressive enhancement.
 *
 * Unpoly provides SPA-like navigation without heavy client-side frameworks,
 * allowing seamless page transitions and progressive enhancement.
 *
 * @example
 * ```tsx
 * import { RootLayout, Card, Button } from '@lockness/ui'
 *
 * export const HomePage = () => (
 *   <RootLayout title="Home">
 *     <div class="container mx-auto p-4">
 *       <Card>
 *         <CardHeader>
 *           <CardTitle>Welcome</CardTitle>
 *         </CardHeader>
 *         <CardContent>
 *           <p>Hello, world!</p>
 *         </CardContent>
 *         <CardFooter>
 *           <Button up-target=".main" up-href="/about">
 *             Learn More
 *           </Button>
 *         </CardFooter>
 *       </Card>
 *     </div>
 *   </RootLayout>
 * )
 * ```
 */
export const RootLayout: FC<RootLayoutProps> = ({
    title = 'Lockness App',
    meta = [],
    styles = [],
    scripts = [],
    children,
}) => {
    return (
        <html lang='en'>
            <head>
                <meta charset='UTF-8' />
                <meta
                    name='viewport'
                    content='width=device-width, initial-scale=1.0'
                />
                <title>{title}</title>

                {/* Unpoly CSS - Progressive enhancement styles */}
                <link
                    rel='stylesheet'
                    href={'https://cdn.jsdelivr.net/npm/unpoly@3.12.1/' +
                        'unpoly.min.css'}
                />

                {/* Custom meta tags */}
                {meta}

                {/* Custom styles */}
                {styles}
            </head>
            <body>
                {/* Main content */}
                {children}

                {/* Unpoly JS - Progressive enhancement & SPA navigation */}
                <script
                    src={'https://cdn.jsdelivr.net/npm/unpoly@3.12.1/' +
                        'unpoly.min.js'}
                >
                </script>

                {/* Custom scripts */}
                {scripts}
            </body>
        </html>
    )
}
