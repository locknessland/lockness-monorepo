/**
 * @fileoverview Authentication layout based on RootLayout.
 *
 * Clean layout for auth pages (login, register, profile) with
 * consistent navbar and GitHub link.
 *
 * @module app/view/layouts/auth_layout
 */

import type { FC } from '@lockness/core'
import { route } from '@lockness/core'
import {
    GithubIcon,
    Navbar,
    NavbarBrand,
    NavbarContent,
    NavbarMenuItem,
    RootLayout,
    ThemeSwitch,
    ThemeSwitchScript,
    UserIcon,
} from '@lockness/ui/components'

/**
 * AuthLayout props
 */
export interface AuthLayoutProps {
    /** Page title */
    title: string
    /** Page content */
    children: unknown
}

/**
 * AuthLayout
 *
 * Layout for authentication pages using RootLayout as base.
 * Provides consistent navbar with logo, docs link, GitHub icon, and theme switch.
 *
 * @example
 * ```tsx
 * <AuthLayout title="Login">
 *   <LoginForm />
 * </AuthLayout>
 * ```
 */
export const AuthLayout: FC<AuthLayoutProps> = ({ title, children }) => {
    return (
        <RootLayout
            title={`${title} | Lockness`}
            meta={
                <meta
                    name='description'
                    content='Authentication for Lockness JS - The fullstack MVC framework for Deno'
                />
            }
            styles={[
                <link key='app-css' rel='stylesheet' href='/css/app.css' />,
                <link
                    key='fonts-preconnect'
                    rel='preconnect'
                    href='https://fonts.googleapis.com'
                />,
                <link
                    key='fonts-gstatic'
                    rel='preconnect'
                    href='https://fonts.gstatic.com'
                    crossorigin='anonymous'
                />,
                <link
                    key='fonts'
                    href='https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap'
                    rel='stylesheet'
                />,
            ]}
        >
            <div class='bg-background text-foreground min-h-screen antialiased overflow-x-hidden'>
                {/* Navbar */}
                <Navbar position='fixed'>
                    <NavbarBrand href='/'>
                        <div class='w-8 h-8 bg-primary rounded-(--radius) flex items-center justify-center'>
                            <span class='text-sm font-bold text-primary-foreground'>
                                L
                            </span>
                        </div>
                        <span class='font-semibold'>
                            Lockness<span class='text-primary'>JS</span>
                        </span>
                    </NavbarBrand>

                    <NavbarContent position='center' class='hidden md:flex'>
                        <NavbarMenuItem href='/docs'>Docs</NavbarMenuItem>
                        <NavbarMenuItem href='/ui'>UI Components</NavbarMenuItem>
                    </NavbarContent>

                    <NavbarContent position='right'>
                        <a
                            href={route('auth.profile')}
                            class='inline-flex items-center text-muted-foreground hover:text-primary transition-colors'
                            title='Profile'
                        >
                            <UserIcon size={20} />
                        </a>
                        <ThemeSwitch variant='toggle' />
                        <a
                            href='https://github.com/locknessland/lockness'
                            target='_blank'
                            class='inline-flex items-center text-muted-foreground hover:text-primary transition-colors'
                        >
                            <GithubIcon size={20} />
                        </a>
                    </NavbarContent>
                </Navbar>

                <ThemeSwitchScript />

                {/* Content */}
                <main class='pt-16'>{children}</main>
            </div>
        </RootLayout>
    )
}
