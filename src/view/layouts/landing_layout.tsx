import { ViteScripts } from 'lockness'

// deno-lint-ignore no-explicit-any
export const LandingLayout = (props: { title: string; children: any }) => {
    return (
        <html lang='en' class='dark'>
            <head>
                <meta charset='UTF-8' />
                <meta
                    name='viewport'
                    content='width=device-width, initial-scale=1.0'
                />
                <title>{props.title}</title>
                <meta name='description' content='Lockness JS is a high-performance, fullstack MVC web framework built natively for Deno. Inspired by Laravel and AdonisJS, powered by Hono.' />

                {/* Automatic asset resolution & dependency injection */}
                <ViteScripts entry='src/view/app.ts' />

                {/* Fonts */}
                <link rel='preconnect' href='https://fonts.googleapis.com' />
                <link rel='preconnect' href='https://fonts.gstatic.com' crossorigin='anonymous' />
                <link
                    href='https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap'
                    rel='stylesheet'
                />
            </head>
            <body class='bg-background text-foreground min-h-screen antialiased'>
                {props.children}
            </body>
        </html>
    )
}
