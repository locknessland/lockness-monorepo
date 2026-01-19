import {
    Navbar,
    NavbarBrand,
    NavbarContent,
    NavbarMenuItem,
} from '@lockness/ui/components'

const GithubIcon = () => (
    <svg
        xmlns='http://www.w3.org/2000/svg'
        width='20'
        height='20'
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        stroke-width='2'
    >
        <path d='M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4' />
        <path d='M9 18c-4.51 2-5-2-7-2' />
    </svg>
)

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
                <Navbar position='fixed'>
                    <NavbarBrand href='/'>
                        <div
                            class='w-8 h-8 bg-primary flex items-center justify-center border-2 border-primary-foreground/20'
                            style='box-shadow: 2px 2px 0 0 rgba(0,0,0,0.5);'
                        >
                            <span class='font-pixel text-[8px] text-primary-foreground'>
                                L
                            </span>
                        </div>
                        <span class='font-pixel text-xs text-foreground tracking-tight mt-1'>
                            LOCKNESS<span class='text-primary'>JS</span>
                        </span>
                    </NavbarBrand>

                    <NavbarContent position='right'>
                        <NavbarMenuItem href='/docs'>Docs</NavbarMenuItem>
                        <a
                            href='https://github.com/locknessland/lockness'
                            class='text-muted-foreground hover:text-primary transition-colors'
                            target='_blank'
                            rel='noopener noreferrer'
                        >
                            <GithubIcon />
                        </a>
                    </NavbarContent>
                </Navbar>

                {/* Content */}
                <main class='pt-16'>{props.children}</main>
            </body>
        </html>
    )
}
