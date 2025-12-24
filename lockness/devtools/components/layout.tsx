/** @jsx jsx */
/** @jsxImportSource hono/jsx */

interface LayoutProps {
    children: any
    title?: string
}

export function Layout({ children, title = 'Lockness Devtools' }: LayoutProps) {
    return (
        <html lang="en">
            <head>
                <meta charset="UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <title>{title}</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <style>{`
                    [data-panel] { display: none; }
                    [data-panel].active { display: block; }
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                `}</style>
            </head>
            <body class="bg-gray-50 min-h-screen">
                {children}
            </body>
        </html>
    )
}
