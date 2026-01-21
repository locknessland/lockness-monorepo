import { route } from '@lockness/core'
import {
    GithubIcon,
    Navbar,
    NavbarBrand,
    NavbarContent,
    NavbarMenuItem,
    RootLayout,
    SidebarInset,
    SidebarProvider,
    SidebarTrigger,
    ThemeSwitch,
    ThemeSwitchScript,
    Title,
    UserIcon,
} from '@lockness/ui/components'
import { UiSidebar } from '../components/ui-sidebar.tsx'
import { ThemeCustomizerScript } from '../components/theme-customizer.tsx'

interface PageUiLayoutProps {
    title: string
    children: any
    /** Remove default padding from main content area */
    noPadding?: boolean
}

export const PageUiLayout = (
    { title, children, noPadding = false }: PageUiLayoutProps,
) => {
    return (
        <RootLayout
            title={title}
            styles={[
                <link key='app-css' rel='stylesheet' href='/css/app.css' />,
            ]}
        >
            <Navbar position='sticky'>
                <NavbarBrand href='/'>
                    <span class='text-xl'>🦕</span>
                    <span class='font-pixel'>Lockness</span>
                </NavbarBrand>
                <NavbarContent position='center' class='hidden md:flex'>
                    <NavbarMenuItem href='/docs' active={false}>
                        Docs
                    </NavbarMenuItem>
                    <NavbarMenuItem href='/ui' active>
                        UI Components
                    </NavbarMenuItem>
                </NavbarContent>
                <NavbarContent position='right' class='hidden md:flex'>
                    <a
                        href={route('auth.profile')}
                        class='inline-flex items-center text-muted-foreground hover:text-primary transition-colors'
                        title='Profile'
                    >
                        <UserIcon size={20} />
                    </a>
                    <a
                        href='https://github.com/locknessland/lockness'
                        target='_blank'
                        class='inline-flex items-center text-muted-foreground hover:text-primary transition-colors'
                    >
                        <GithubIcon size={20} />
                    </a>
                    <ThemeSwitch variant='toggle' />
                </NavbarContent>
            </Navbar>

            <SidebarProvider>
                <UiSidebar />

                <SidebarInset class='ml-0 md:ml-64 transition-all duration-200 overflow-x-hidden'>
                    {/* Mobile sidebar trigger */}
                    <div class='flex md:hidden h-12 items-center gap-2 border-b border-border px-4 sticky top-16 bg-background z-10'>
                        <SidebarTrigger />
                        <span class='font-pixel text-sm text-foreground'>
                            {title}
                        </span>
                    </div>
                    {/* Page content injected here */}
                    <main
                        class={`flex-1 max-w-full${
                            noPadding ? '' : ' p-4 md:p-8'
                        }`}
                        id='main'
                    >
                        {/* SEO H1 Title - only when padding is applied (no custom hero) */}
                        {!noPadding && (
                            <Title level={1} class='mb-6'>
                                {title}
                            </Title>
                        )}
                        {children}
                    </main>
                </SidebarInset>
            </SidebarProvider>

            <ThemeSwitchScript />
            <ThemeCustomizerScript />
        </RootLayout>
    )
}
