import { DocsSidebar } from '@view/components/docs_sidebar.tsx'

const BookIcon = () => (
    <svg
        xmlns='http://www.w3.org/2000/svg'
        width='20'
        height='20'
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        stroke-width='2'
        stroke-linecap='round'
        stroke-linejoin='round'
    >
        <path d='M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20'>
        </path>
    </svg>
)

const HomeIcon = () => (
    <svg
        xmlns='http://www.w3.org/2000/svg'
        width='16'
        height='16'
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        stroke-width='2'
        stroke-linecap='round'
        stroke-linejoin='round'
    >
        <path d='m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'></path>
        <polyline points='9 22 9 12 15 12 15 22'></polyline>
    </svg>
)

export const DocsLayout = (
    // deno-lint-ignore no-explicit-any
    props: { title: string; children: any; currentPath: string },
) => {
    return (
        <html lang='en' class='dark'>
            <head>
                <meta charset='UTF-8' />
                <meta
                    name='viewport'
                    content='width=device-width, initial-scale=1.0'
                />
                <title>{props.title} | Lockness Documentation</title>
                <meta
                    name='description'
                    content='Complete documentation for Lockness JS - The fullstack MVC framework for Deno'
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
                <link
                    rel='icon'
                    type='image/png'
                    sizes='192x192'
                    href='/android-chrome-192x192.png'
                />
                <link
                    rel='icon'
                    type='image/png'
                    sizes='512x512'
                    href='/android-chrome-512x512.png'
                />

                {/* Automatic asset resolution & dependency injection */}
                {/* Pure SSR - No client-side JS needed */}

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

                {/* Prism.js for syntax highlighting */}
                <link
                    href='https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css'
                    rel='stylesheet'
                />
                <script src='https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js'>
                </script>
                <script src='https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-typescript.min.js'>
                </script>
                <script src='https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-bash.min.js'>
                </script>
                <script src='https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-json.min.js'>
                </script>
                <script src='https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-jsx.min.js'>
                </script>
                <script src='https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-tsx.min.js'>
                </script>

                <style
                    dangerouslySetInnerHTML={{
                        __html: `
                    /* Text selection colors */
                    ::selection {
                        background-color: rgba(34, 211, 238, 0.3);
                        color: #ffffff;
                    }
                    
                    ::-moz-selection {
                        background-color: rgba(34, 211, 238, 0.3);
                        color: #ffffff;
                    }
                    
                    /* Monokai theme colors for Prism */
                    .token.comment,
                    .token.prolog,
                    .token.doctype,
                    .token.cdata { color: #75715e; font-style: italic; }
                    
                    .token.punctuation { color: #f8f8f2; }
                    
                    .token.property,
                    .token.tag,
                    .token.constant,
                    .token.symbol,
                    .token.deleted { color: #f92672; }
                    
                    .token.boolean,
                    .token.number { color: #ae81ff; }
                    
                    .token.selector,
                    .token.attr-name,
                    .token.string,
                    .token.char,
                    .token.builtin,
                    .token.inserted { color: #e6db74; }
                    
                    .token.operator,
                    .token.entity,
                    .token.url,
                    .language-css .token.string,
                    .style .token.string { color: #f92672; }
                    
                    .token.atrule,
                    .token.attr-value,
                    .token.keyword { color: #f92672; font-style: italic; }
                    
                    .token.function { color: #66d9ef; }
                    
                    .token.class-name { color: #a6e22e; }
                    
                    .token.regex,
                    .token.important,
                    .token.variable { color: #f8f8f2; }
                    
                    pre[class*="language-"] {
                        background: transparent !important;
                        margin: 0 !important;
                        padding: 0 !important;
                    }
                    
                    code[class*="language-"] {
                        background: transparent !important;
                        color: #f8f8f2;
                        font-family: 'VT323', monospace !important;
                        font-size: 1.125rem;
                        line-height: 1.8;
                    }
                `,
                    }}
                />
            </head>
            <body class='bg-background text-foreground min-h-screen antialiased overflow-x-hidden'>
                {/* Header */}
                <header class='fixed top-0 left-0 right-0 z-50 border-b-4 border-border bg-background/95'>
                    <div class='max-w-7xl mx-auto px-6 h-16 flex items-center justify-between'>
                        <div class='flex items-center gap-6'>
                            <a href='/' class='flex items-center gap-3 group'>
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
                            </a>
                            <div class='flex items-center gap-2 text-muted-foreground'>
                                <span class='font-pixel text-[8px]'>/</span>
                                <BookIcon />
                                <span class='font-pixel text-[8px] mt-0.5'>
                                    DOCS
                                </span>
                            </div>
                        </div>

                        <nav class='flex items-center gap-4'>
                            <a
                                href='/'
                                class='text-muted-foreground hover:text-primary transition-colors flex items-center gap-2'
                                title='Back to home'
                            >
                                <HomeIcon />
                            </a>
                            <a
                                href='https://github.com/locknessjs/lockness'
                                class='text-muted-foreground hover:text-primary transition-colors'
                            >
                                <svg
                                    xmlns='http://www.w3.org/2000/svg'
                                    width='20'
                                    height='20'
                                    viewBox='0 0 24 24'
                                    fill='none'
                                    stroke='currentColor'
                                    stroke-width='2'
                                >
                                    <path d='M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4'>
                                    </path>
                                    <path d='M9 18c-4.51 2-5-2-7-2'></path>
                                </svg>
                            </a>
                        </nav>
                    </div>
                </header>

                {/* Main Layout */}
                <div class='pt-16 md:flex'>
                    {/* Sidebar */}
                    <DocsSidebar currentPath={props.currentPath} />

                    {/* Content */}
                    <main class='flex-1 p-6 md:p-12 max-w-4xl'>
                        {props.children}
                    </main>
                </div>
            </body>
        </html>
    )
}
