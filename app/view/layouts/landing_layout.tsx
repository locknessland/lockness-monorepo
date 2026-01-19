import type { FC } from '@lockness/core'

export interface LandingLayoutProps {
    /**
     * Page title
     */
    title: string
    /**
     * Page description for SEO
     */
    description?: string
    /**
     * Page content
     */
    children?: unknown
}

/**
 * LandingLayout
 *
 * Clean, minimal layout for landing pages using @lockness/ui design system.
 */
export const LandingLayout: FC<LandingLayoutProps> = ({
    title,
    description =
        'Lockness JS is a high-performance, fullstack MVC web framework built natively for Deno. Inspired by Laravel and AdonisJS, powered by Hono.',
    children,
}) => {
    return (
        <html lang='en' class='dark'>
            <head>
                <meta charset='UTF-8' />
                <meta
                    name='viewport'
                    content='width=device-width, initial-scale=1.0'
                />
                <title>{title}</title>
                <meta name='description' content={description} />

                {/* Static CSS */}
                <link rel='stylesheet' href='/css/app.css' />

                {/* Fonts - Inter for body, JetBrains Mono for code */}
                <link rel='preconnect' href='https://fonts.googleapis.com' />
                <link
                    rel='preconnect'
                    href='https://fonts.gstatic.com'
                    crossorigin='anonymous'
                />
                <link
                    href='https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap'
                    rel='stylesheet'
                />
            </head>
            <body class='bg-background text-foreground min-h-screen antialiased font-sans'>
                {children}
            </body>
        </html>
    )
}
