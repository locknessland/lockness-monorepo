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

const RobotIcon = () => (
    <svg
        xmlns='http://www.w3.org/2000/svg'
        width='18'
        height='18'
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        stroke-width='2'
        stroke-linecap='round'
        stroke-linejoin='round'
    >
        <path d='M12 8V4H8'></path>
        <rect width='16' height='12' x='4' y='8' rx='2'></rect>
        <path d='M2 14h2'></path>
        <path d='M20 14h2'></path>
        <path d='M15 13v2'></path>
        <path d='M9 13v2'></path>
    </svg>
)

const CopyIcon = () => (
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
        <rect width='14' height='14' x='8' y='8' rx='2' ry='2'></rect>
        <path d='M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2'></path>
    </svg>
)

const CheckIcon = () => (
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
        <path d='M20 6 9 17l-5-5'></path>
    </svg>
)

const LlmLinks = (props: { llmPath?: string }) => {
    if (!props.llmPath) return null

    return (
        <div class='flex items-center gap-2 mb-6 pb-4 border-b-2 border-border/50'>
            <span class='text-muted-foreground font-pixel text-[10px]'>LLM DOCS:</span>
            <a
                href={`/llms/${props.llmPath}.txt`}
                target='_blank'
                class='flex items-center gap-1.5 px-2 py-1 bg-primary/10 hover:bg-primary/20 border-2 border-primary/30 text-primary transition-colors'
                title='View LLM-optimized documentation'
                style='box-shadow: 2px 2px 0 0 rgba(34, 211, 238, 0.2);'
            >
                <RobotIcon />
                <span class='font-pixel text-[9px] mt-0.5'>VIEW</span>
            </a>
            <button
                onclick={`
                    const btn = event.currentTarget;
                    const icon = btn.querySelector('.copy-icon');
                    const check = btn.querySelector('.check-icon');
                    const text = btn.querySelector('.copy-text');
                    const url = window.location.origin + '/llms/${props.llmPath}.txt';
                    
                    navigator.clipboard.writeText(url).then(() => {
                        // Bounce animation
                        btn.style.animation = 'none';
                        setTimeout(() => {
                            btn.style.animation = 'bounce 0.5s ease';
                        }, 10);
                        
                        // Switch icons
                        icon.style.display = 'none';
                        check.style.display = 'block';
                        text.textContent = 'COPIED!';
                        btn.style.backgroundColor = 'rgba(34, 211, 238, 0.2)';
                        btn.style.borderColor = 'rgba(34, 211, 238, 0.5)';
                        btn.style.color = 'rgb(34, 211, 238)';
                        
                        setTimeout(() => {
                            icon.style.display = 'block';
                            check.style.display = 'none';
                            text.textContent = 'COPY';
                            btn.style.backgroundColor = '';
                            btn.style.borderColor = '';
                            btn.style.color = '';
                            btn.style.animation = '';
                        }, 2000);
                    });
                `}
                class='flex items-center gap-1.5 px-2 py-1 bg-muted/30 hover:bg-muted/50 border-2 border-muted-foreground/30 text-muted-foreground hover:text-foreground transition-all cursor-pointer'
                title='Copy link to clipboard'
                style='box-shadow: 2px 2px 0 0 rgba(0, 0, 0, 0.2);'
            >
                <span class='copy-icon'><CopyIcon /></span>
                <span class='check-icon' style='display: none;'><CheckIcon /></span>
                <span class='font-pixel text-[9px] mt-0.5 copy-text'>COPY</span>
            </button>
        </div>
    )
}

export const DocsLayout = (
    // deno-lint-ignore no-explicit-any
    props: { title: string; children: any; currentPath: string; llmPath?: string },
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
                    
                    /* Bounce animation for copy button */
                    @keyframes bounce {
                        0%, 100% { transform: translateY(0); }
                        25% { transform: translateY(-8px); }
                        50% { transform: translateY(-4px); }
                        75% { transform: translateY(-6px); }
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
                        <LlmLinks llmPath={props.llmPath} />
                        {props.children}
                    </main>
                </div>
            </body>
        </html>
    )
}
