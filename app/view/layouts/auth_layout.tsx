import { Navbar } from '@view/components/navbar.tsx'

export const AuthLayout = (props: { title: string; children: unknown }) => {
    return (
        <html lang='en' class='dark'>
            <head>
                <meta charset='UTF-8' />
                <meta
                    name='viewport'
                    content='width=device-width, initial-scale=1.0'
                />
                <title>{props.title} | Lockness</title>
                <meta
                    name='description'
                    content='Authentication for Lockness JS - The fullstack MVC framework for Deno'
                />

                {/* Favicons */}
                <link rel='icon' type='image/x-icon' href='/favicon.ico' />
                <link
                    rel='icon'
                    type='image/png'
                    sizes='16x16'
                    href='/favicon-16x16.png'
                />
                <link
                    rel='icon'
                    type='image/png'
                    sizes='32x32'
                    href='/favicon-32x32.png'
                />
                <link
                    rel='apple-touch-icon'
                    sizes='180x180'
                    href='/apple-touch-icon.png'
                />

                {/* Static CSS */}
                <link rel='stylesheet' href='/css/app.css' />

                {/* Fonts */}
                <link rel='preconnect' href='https://fonts.googleapis.com' />
                <link
                    rel='preconnect'
                    href='https://fonts.gstatic.com'
                    crossorigin='anonymous'
                />
                <link
                    href='https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap'
                    rel='stylesheet'
                />
            </head>
            <body class='bg-background text-foreground min-h-screen antialiased overflow-x-hidden'>
                {/* Navbar */}
                <Navbar />

                {/* Content */}
                <main class='pt-16'>{props.children}</main>
            </body>
        </html>
    )
}
