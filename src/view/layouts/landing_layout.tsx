import { html } from 'lockness'

// deno-lint-ignore no-explicit-any
export const LandingLayout = (props: { title: string; children: any }) => {
    return html`
        <!DOCTYPE html>
        <html lang="en">
            <head>
                <meta charset="UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                <title>${props.title} | Lockness</title>
                <script src="https://cdn.tailwindcss.com"></script>
                <style>
                :root {
                --background: oklch(1.0000 0 0);
                --foreground: oklch(0.1884 0.0128 248.5103);
                --card: oklch(0.9784 0.0011 197.1387);
                --card-foreground: oklch(0.1884 0.0128 248.5103);
                --popover: oklch(1.0000 0 0);
                --popover-foreground: oklch(0.1884 0.0128 248.5103);
                --primary: oklch(0.6723 0.1606 244.9955);
                --primary-foreground: oklch(1.0000 0 0);
                --secondary: oklch(0.1884 0.0128 248.5103);
                --secondary-foreground: oklch(1.0000 0 0);
                --muted: oklch(0.9222 0.0013 286.3737);
                --muted-foreground: oklch(0.1884 0.0128 248.5103);
                --accent: oklch(0.9392 0.0166 250.8453);
                --accent-foreground: oklch(0.6723 0.1606 244.9955);
                --destructive: oklch(0.6188 0.2376 25.7658);
                --destructive-foreground: oklch(1.0000 0 0);
                --border: oklch(0.9317 0.0118 231.6594);
                --input: oklch(0.9809 0.0025 228.7836);
                --ring: oklch(0.6818 0.1584 243.3540);
                --radius: 1.3rem;
                }

                .dark {
                --background: oklch(0 0 0);
                --foreground: oklch(0.9328 0.0025 228.7857);
                --card: oklch(0.2097 0.0080 274.5332);
                --card-foreground: oklch(0.8853 0 0);
                --popover: oklch(0 0 0);
                --popover-foreground: oklch(0.9328 0.0025 228.7857);
                --primary: oklch(0.6692 0.1607 245.0110);
                --primary-foreground: oklch(1.0000 0 0);
                --secondary: oklch(0.9622 0.0035 219.5331);
                --secondary-foreground: oklch(0.1884 0.0128 248.5103);
                --muted: oklch(0.2090 0 0);
                --muted-foreground: oklch(0.5637 0.0078 247.9662);
                --accent: oklch(0.1928 0.0331 242.5459);
                --accent-foreground: oklch(0.6692 0.1607 245.0110);
                --destructive: oklch(0.6188 0.2376 25.7658);
                --destructive-foreground: oklch(1.0000 0 0);
                --border: oklch(0.2674 0.0047 248.0045);
                --input: oklch(0.3020 0.0288 244.8244);
                --ring: oklch(0.6818 0.1584 243.3540);
                }

                body {
                    background-color: var(--background);
                    color: var(--foreground);
                    font-family: 'Inter', sans-serif;
                }
                </style>
                <script>
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
                </script>
                <link
                    href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
                    rel="stylesheet"
                >
            </head>
            <body
                class="dark bg-background text-foreground min-h-screen antialiased overflow-x-hidden"
            >
                ${props.children}
            </body>
        </html>
    `
}
