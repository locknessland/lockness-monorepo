import { Asset, ViteScripts } from 'lockness'

// deno-lint-ignore no-explicit-any
export const LandingLayout = (props: { title: string; children: any }) => {
    return (
        <html lang="en">
            <head>
                <meta charset="UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <title>{props.title} | Lockness</title>

                {/* Automatic asset resolution & dependency injection */}
                <ViteScripts entry="src/view/app.ts" />

                <script src="https://cdn.tailwindcss.com"></script>
                <script dangerouslySetInnerHTML={{
                    __html: `
                tailwind.config = {
                    darkMode: 'class',
                    theme: {
                        extend: {
                            colors: {
                                background: 'var(--background)',
                                foreground: 'var(--foreground)',
                                primary: {
                                    DEFAULT: 'var(--primary)',
                                    foreground: 'var(--primary-foreground)',
                                },
                                secondary: {
                                    DEFAULT: 'var(--secondary)',
                                    foreground: 'var(--secondary-foreground)',
                                },
                                card: {
                                    DEFAULT: 'var(--card)',
                                    foreground: 'var(--card-foreground)',
                                },
                                muted: {
                                    DEFAULT: 'var(--muted)',
                                    foreground: 'var(--muted-foreground)',
                                },
                                accent: {
                                    DEFAULT: 'var(--accent)',
                                    foreground: 'var(--accent-foreground)',
                                },
                                border: 'var(--border)',
                                input: 'var(--input)',
                                ring: 'var(--ring)',
                            },
                            borderRadius: {
                                lg: 'var(--radius)',
                                md: 'calc(var(--radius) - 2px)',
                                sm: 'calc(var(--radius) - 4px)',
                            }
                        }
                    }
                }
                ` }} />
                <link
                    href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
                    rel="stylesheet"
                />
            </head>
            <body
                class="dark bg-background text-foreground min-h-screen antialiased overflow-x-hidden"
            >
                {props.children}
            </body>
        </html>
    )
}


