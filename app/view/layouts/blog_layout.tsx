/**
 * @fileoverview Lightweight blog layout (Q10).
 *
 * Wraps blog pages in the shared site chrome — `RootLayout` plus the top
 * `Navbar` — without the docs sidebar. An optional `description` is bound to a
 * `<meta name="description">` via a JSX attribute (`content={description}`),
 * which the framework escapes; the blog never string-concatenates markup (S3).
 *
 * @module @view/layouts/blog_layout
 */

import type { FC } from '@lockness/core'
import {
    GithubIcon,
    Navbar,
    NavbarContent,
    NavbarMenuItem as NavbarLink,
    RootLayout,
    ThemeSwitch,
    ThemeSwitchScript,
} from '@lockness/ui/components'
import { Brand } from '../components/brand.tsx'

/**
 * Props for {@link BlogLayout}.
 */
export interface BlogLayoutProps {
    /** Page title (browser tab + shown by the pages themselves). */
    title: string
    /** Optional plain-text meta description (already excerpted, S3). */
    description?: string
    /** Page content. */
    children: unknown
}

/**
 * Blog layout — site chrome without the docs sidebar.
 *
 * @example
 * ```tsx
 * <BlogLayout title='Hello, world' description='A first post'>
 *   <article>…</article>
 * </BlogLayout>
 * ```
 */
export const BlogLayout: FC<BlogLayoutProps> = ({
    title,
    description,
    children,
}) => {
    return (
        <RootLayout
            title={`${title} | Lockness Blog`}
            meta={description
                ? [
                    <meta
                        key='description'
                        name='description'
                        content={description}
                    />,
                ]
                : []}
            styles={[
                <link key='app-css' rel='stylesheet' href='/css/app.css' />,
            ]}
        >
            <Navbar position='sticky'>
                <Brand />
                <NavbarContent position='center' class='hidden md:flex'>
                    <NavbarLink href='/blog' active>Blog</NavbarLink>
                    <NavbarLink href='/docs'>Docs</NavbarLink>
                    <NavbarLink href='/ui'>UI Components</NavbarLink>
                </NavbarContent>
                <NavbarContent position='right' class='hidden md:flex'>
                    <a
                        href='https://github.com/locknessland/lockness-monorepo'
                        target='_blank'
                        class='inline-flex items-center text-muted-foreground hover:text-primary transition-colors'
                    >
                        <GithubIcon size={20} />
                    </a>
                    <ThemeSwitch variant='toggle' />
                </NavbarContent>
            </Navbar>

            <ThemeSwitchScript />

            <main class='mx-auto max-w-3xl px-4 py-8 md:py-12'>
                {children}
            </main>
        </RootLayout>
    )
}
