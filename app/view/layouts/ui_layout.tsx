import { route } from '@lockness/core'
import {
    Button,
    CopyLink,
    GithubIcon,
    Navbar,
    NavbarContent,
    NavbarMenuItem,
    RobotIcon,
    RootLayout,
    SidebarInset,
    SidebarProvider,
    SidebarTrigger,
    ThemeSwitch,
    ThemeSwitchScript,
    Title,
    UserIcon,
} from '@lockness/ui/components'
import { Brand } from '../components/brand.tsx'
import { UiSidebar } from '../components/ui-sidebar.tsx'
import { ThemeCustomizerScript } from '../components/theme-customizer.tsx'

const LlmLinks = (props: { llmSlug?: string }) => {
    if (!props.llmSlug) return null

    return (
        <div class='flex items-center gap-2'>
            <span class='text-muted-foreground font-pixel text-[10px] hidden sm:inline'>
                LLM DOCS:
            </span>
            <Button
                href={`/ui/llms/${props.llmSlug}.txt`}
                target='_blank'
                variant='outline'
                size='sm'
                class='gap-1.5 h-8'
                title='View LLM-optimized documentation'
            >
                <RobotIcon size={14} />
                <span class='font-pixel text-[9px]'>VIEW</span>
            </Button>
            <CopyLink
                path={`/ui/llms/${props.llmSlug}.txt`}
                variant='outline'
                size='sm'
                showLabel
                label='COPY'
                copiedLabel='COPIED!'
                class='gap-1.5 h-8'
            />
        </div>
    )
}

interface PageUiLayoutProps {
    title: string
    children: any
    /** Remove default padding from main content area */
    noPadding?: boolean
    /** LLM slug for documentation link (e.g., 'button', 'card') */
    llmSlug?: string
    filePath?: string
}

export const PageUiLayout = (
    { title, children, noPadding = false, llmSlug, filePath }:
        PageUiLayoutProps,
) => {
    return (
        <RootLayout
            title={title}
            styles={[
                <link key='app-css' rel='stylesheet' href='/css/app.css' />,
            ]}
        >
            <Navbar position='sticky'>
                <Brand />
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
                            <div class='flex items-center justify-between gap-4 mb-6 pb-4 border-b-2 border-border/50'>
                                <Title level={1} class='mb-0'>
                                    Lockness UI Component
                                </Title>
                                <LlmLinks llmSlug={llmSlug} />
                            </div>
                        )}
                        {children}

                        {filePath && (
                            <div class='mt-12 pt-6 border-t border-border flex justify-end'>
                                <Button
                                    href={`https://github.com/locknessland/lockness/blob/main/${filePath}`}
                                    target='_blank'
                                    variant='ghost'
                                    size='sm'
                                    class='gap-2 text-muted-foreground hover:text-primary'
                                >
                                    <GithubIcon size={16} />
                                    <span>Edit this page</span>
                                </Button>
                            </div>
                        )}
                    </main>
                </SidebarInset>
            </SidebarProvider>

            <ThemeSwitchScript />
            <ThemeCustomizerScript />
        </RootLayout>
    )
}
