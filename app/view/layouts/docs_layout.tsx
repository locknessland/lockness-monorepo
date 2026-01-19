import { route } from '@lockness/core'
import {
    Button,
    CopyLink,
    Navbar,
    NavbarBrand,
    NavbarContent,
    NavbarMenuItem as NavbarLink,
    RobotIcon,
    RootLayout,
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarInset,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarProvider,
    SidebarTrigger,
    ThemeToggle,
    ThemeToggleScript,
    Title,
} from '@lockness/ui/components'

const LlmLinks = (props: { llmPath?: string }) => {
    if (!props.llmPath) return null

    return (
        <div class='flex items-center gap-2'>
            <span class='text-muted-foreground font-pixel text-[10px] hidden sm:inline'>
                LLM DOCS:
            </span>
            <Button
                href={`/llms/${props.llmPath}.txt`}
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
                path={`/llms/${props.llmPath}.txt`}
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

export const DocsLayout = (
    props: {
        title: string
        children: unknown
        currentPath: string
        llmPath?: string
    },
) => {
    return (
        <RootLayout
            title={`${props.title} | Lockness Documentation`}
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
                    <NavbarLink href='/'>Home</NavbarLink>
                    <NavbarLink href='/docs' active>Docs</NavbarLink>
                    <NavbarLink href='/ui'>UI Components</NavbarLink>
                </NavbarContent>
                <NavbarContent position='right' class='hidden md:flex'>
                    <NavbarLink
                        href='https://github.com/locknessland/lockness'
                        target='_blank'
                    >
                        GitHub
                    </NavbarLink>
                    <ThemeToggle />
                </NavbarContent>
            </Navbar>

            <ThemeToggleScript />
            <SidebarProvider>
                {/* Sidebar */}
                <DocsSidebar currentPath={props.currentPath} />

                <SidebarInset class='ml-0 md:ml-64 transition-all duration-200 overflow-x-hidden'>
                    {/* Mobile sidebar trigger */}
                    <div class='flex md:hidden h-12 items-center gap-2 border-b border-border px-4 sticky top-16 bg-background z-10'>
                        <SidebarTrigger />
                        <span class='font-semibold text-foreground text-sm'>
                            {props.title}
                        </span>
                    </div>

                    {/* Page content */}
                    <main class='flex-1 p-4 md:p-8 max-w-4xl'>
                        {/* Header with Title and LLM Links */}
                        <div class='flex items-center justify-between gap-4 mb-6 pb-4 border-b-2 border-border/50'>
                            <Title level={1} class='mb-0'>
                                {props.title}
                            </Title>
                            <LlmLinks llmPath={props.llmPath} />
                        </div>
                        {props.children}
                    </main>
                </SidebarInset>
            </SidebarProvider>
        </RootLayout>
    )
}

// Navigation sections for docs sidebar
const navSections = [
    {
        title: 'Getting Started',
        links: [
            { title: 'Installation', name: 'docs.installation' },
            { title: 'Introduction', name: 'docs.getting-started' },
        ],
    },
    {
        title: 'Core Concepts',
        links: [
            { title: 'Routing & Controllers', name: 'docs.routing' },
            {
                title: 'Dependency Injection',
                name: 'docs.dependency-injection',
            },
            { title: 'Middleware', name: 'docs.middleware' },
            { title: 'Validation', name: 'docs.validation' },
        ],
    },
    {
        title: 'Database & State',
        links: [
            { title: 'Models & Database', name: 'docs.models' },
            { title: 'Session Management', name: 'docs.sessions' },
        ],
    },
    {
        title: 'Development Tools',
        links: [
            { title: 'Lockness Devtools', name: 'docs.devtools' },
            { title: 'Deprecation Contracts', name: 'docs.deprecation' },
            { title: 'CLI Engine', name: 'docs.cli' },
            { title: 'Nessy CLI', name: 'docs.nessy' },
        ],
    },
    {
        title: 'Advanced',
        links: [
            { title: 'View Components', name: 'docs.components' },
            { title: 'UI Components', name: 'docs.ui' },
            { title: 'Table Component', name: 'docs.table' },
            { title: 'Package Management', name: 'docs.packages' },
        ],
    },
    {
        title: 'Contributing',
        links: [
            { title: 'Framework Contribution', name: 'docs.contribution' },
        ],
    },
]

// Docs Sidebar using @lockness/ui Sidebar components
const DocsSidebar = (props: { currentPath: string }) => {
    return (
        <Sidebar topOffset='16'>
            <SidebarHeader class='p-4'>
                <span class='text-sm font-semibold text-sidebar-foreground'>
                    Documentation
                </span>
            </SidebarHeader>
            <SidebarContent>
                {navSections.map((section) => (
                    <SidebarGroup key={section.title}>
                        <SidebarGroupLabel>{section.title}</SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                {section.links.map((link) => {
                                    const href = route(link.name)
                                    const isActive = props.currentPath === href
                                    return (
                                        <SidebarMenuItem key={link.name}>
                                            <SidebarMenuButton
                                                href={href}
                                                isActive={isActive}
                                                up-preload
                                                up-transition='move-left'
                                            >
                                                {link.title}
                                            </SidebarMenuButton>
                                        </SidebarMenuItem>
                                    )
                                })}
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>
                ))}
            </SidebarContent>
        </Sidebar>
    )
}
