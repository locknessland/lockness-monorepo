import { PageUiLayout } from '@view/layouts/ui_layout.tsx'

export const UiIndex = () => {
    return (
        <PageUiLayout title='UI Showcase - Lockness Components' currentPath='/ui'>
            <div class='space-y-8 max-w-4xl'>
                <header>
                    <h1 class='font-pixel text-2xl text-foreground mb-4'>
                        GETTING STARTED
                    </h1>
                    <p class='text-lg text-muted-foreground mb-6'>
                        Welcome to the Lockness UI component library. A
                        collection of beautifully designed components built with
                        Hono JSX, Tailwind CSS, and Unpoly.
                    </p>
                </header>

                <section class='space-y-4'>
                    <h2 class='font-pixel text-lg text-foreground'>
                        INSTALLATION
                    </h2>
                    <p class='text-muted-foreground'>
                        You can use components in two ways:
                    </p>

                    <div class='space-y-4'>
                        <div class='p-6 bg-card rounded-lg'>
                            <h3 class='font-pixel text-sm text-foreground mb-3'>
                                CLI Mode (Recommended)
                            </h3>
                            <p class='text-sm text-muted-foreground mb-4'>
                                Copy components directly to your project for
                                full control and customization.
                            </p>
                            <code class='block px-4 py-3 bg-background text-sm font-pixel-body rounded'>
                                deno run -A jsr:@lockness/ui add button
                            </code>
                        </div>

                        <div class='p-6 bg-card rounded-lg'>
                            <h3 class='font-pixel text-sm text-foreground mb-3'>
                                Library Mode
                            </h3>
                            <p class='text-sm text-muted-foreground mb-4'>
                                Import components directly from the package for
                                quick prototyping.
                            </p>
                            <code class='block px-4 py-3 bg-background text-sm font-pixel-body rounded'>
                                import {'{'} Button, Card {'}'}{' '}
                                from '@lockness/ui/components'
                            </code>
                        </div>
                    </div>
                </section>

                <section class='space-y-4'>
                    <h2 class='font-pixel text-lg text-foreground'>
                        FEATURES
                    </h2>
                    <ul class='space-y-3 text-muted-foreground'>
                        <li class='flex items-start gap-3'>
                            <span class='text-primary'>▸</span>
                            <span>
                                <strong>Type-safe:</strong>{' '}
                                Built with TypeScript for full type safety
                            </span>
                        </li>
                        <li class='flex items-start gap-3'>
                            <span class='text-primary'>▸</span>
                            <span>
                                <strong>Composable:</strong>{' '}
                                Components designed to work together seamlessly
                            </span>
                        </li>
                        <li class='flex items-start gap-3'>
                            <span class='text-primary'>▸</span>
                            <span>
                                <strong>Accessible:</strong>{' '}
                                WAI-ARIA compliant with keyboard navigation
                            </span>
                        </li>
                        <li class='flex items-start gap-3'>
                            <span class='text-primary'>▸</span>
                            <span>
                                <strong>Themeable:</strong>{' '}
                                Full dark mode support with CSS variables
                            </span>
                        </li>
                        <li class='flex items-start gap-3'>
                            <span class='text-primary'>▸</span>
                            <span>
                                <strong>Progressive Enhancement:</strong>{' '}
                                Powered by Unpoly for smooth, JavaScript-light
                                interactions
                            </span>
                        </li>
                    </ul>
                </section>

                <section class='space-y-4'>
                    <h2 class='font-pixel text-lg text-foreground'>
                        NAVIGATION
                    </h2>
                    <p class='text-muted-foreground'>
                        Use the sidebar menu to explore all available
                        components. Each section provides live examples and
                        usage patterns.
                    </p>
                </section>
            </div>
        </PageUiLayout>
    )
}
