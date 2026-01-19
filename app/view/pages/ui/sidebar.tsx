import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupAction,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarInset,
    SidebarMenu,
    SidebarMenuAction,
    SidebarMenuBadge,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuSub,
    SidebarMenuSubButton,
    SidebarMenuSubItem,
    SidebarProvider,
    SidebarRail,
    SidebarTrigger,
} from '@lockness/ui/components'
import { PageUiLayout } from '@view/layouts/ui_layout.tsx'
import { CodeBlock } from '@lockness/ui/components'

export const SidebarPage = () => {
    return (
        <PageUiLayout title='Sidebar - Lockness UI'>
            <div class='space-y-8 max-w-full'>
                <header>
                    <h1 class='font-pixel text-2xl text-foreground mb-2'>
                        SIDEBAR
                    </h1>
                    <p class='text-lg text-muted-foreground'>
                        Composable sidebar component for application layouts
                    </p>
                </header>

                {/* Demo */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>DEMO</h2>
                    <div
                        class='border rounded-lg overflow-hidden relative'
                        style='height: 500px'
                    >
                        <SidebarProvider class='flex h-full'>
                            <Sidebar
                                collapsible='icon'
                                class='block! relative!'
                            >
                                <SidebarHeader>
                                    <SidebarMenu>
                                        <SidebarMenuItem>
                                            <SidebarMenuButton
                                                href='#'
                                                isActive
                                            >
                                                <svg
                                                    xmlns='http://www.w3.org/2000/svg'
                                                    width='16'
                                                    height='16'
                                                    viewBox='0 0 24 24'
                                                    fill='none'
                                                    stroke='currentColor'
                                                    stroke-width='2'
                                                >
                                                    <path d='M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' />
                                                </svg>
                                                <span>Lockness</span>
                                            </SidebarMenuButton>
                                        </SidebarMenuItem>
                                    </SidebarMenu>
                                </SidebarHeader>
                                <SidebarContent>
                                    <SidebarGroup>
                                        <SidebarGroupLabel>
                                            Platform
                                        </SidebarGroupLabel>
                                        <SidebarGroupAction>
                                            <svg
                                                xmlns='http://www.w3.org/2000/svg'
                                                width='12'
                                                height='12'
                                                viewBox='0 0 24 24'
                                                fill='none'
                                                stroke='currentColor'
                                                stroke-width='2'
                                            >
                                                <path d='M12 5v14M5 12h14' />
                                            </svg>
                                        </SidebarGroupAction>
                                        <SidebarGroupContent>
                                            <SidebarMenu>
                                                <SidebarMenuItem>
                                                    <SidebarMenuButton
                                                        href='/ui'
                                                        isActive
                                                    >
                                                        <svg
                                                            xmlns='http://www.w3.org/2000/svg'
                                                            width='16'
                                                            height='16'
                                                            viewBox='0 0 24 24'
                                                            fill='none'
                                                            stroke='currentColor'
                                                            stroke-width='2'
                                                        >
                                                            <path d='M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' />
                                                        </svg>
                                                        <span>Home</span>
                                                    </SidebarMenuButton>
                                                    <SidebarMenuAction>
                                                        <svg
                                                            xmlns='http://www.w3.org/2000/svg'
                                                            width='12'
                                                            height='12'
                                                            viewBox='0 0 24 24'
                                                            fill='none'
                                                            stroke='currentColor'
                                                            stroke-width='2'
                                                        >
                                                            <circle
                                                                cx='12'
                                                                cy='12'
                                                                r='1'
                                                            />
                                                            <circle
                                                                cx='12'
                                                                cy='5'
                                                                r='1'
                                                            />
                                                            <circle
                                                                cx='12'
                                                                cy='19'
                                                                r='1'
                                                            />
                                                        </svg>
                                                    </SidebarMenuAction>
                                                </SidebarMenuItem>
                                                <SidebarMenuItem>
                                                    <SidebarMenuButton href='/ui/buttons'>
                                                        <svg
                                                            xmlns='http://www.w3.org/2000/svg'
                                                            width='16'
                                                            height='16'
                                                            viewBox='0 0 24 24'
                                                            fill='none'
                                                            stroke='currentColor'
                                                            stroke-width='2'
                                                        >
                                                            <rect
                                                                width='20'
                                                                height='14'
                                                                x='2'
                                                                y='5'
                                                                rx='2'
                                                            />
                                                        </svg>
                                                        <span>Components</span>
                                                    </SidebarMenuButton>
                                                    <SidebarMenuBadge>
                                                        24
                                                    </SidebarMenuBadge>
                                                    <SidebarMenuSub>
                                                        <SidebarMenuSubItem>
                                                            <SidebarMenuSubButton
                                                                href='/ui/buttons'
                                                                isActive
                                                            >
                                                                Buttons
                                                            </SidebarMenuSubButton>
                                                        </SidebarMenuSubItem>
                                                        <SidebarMenuSubItem>
                                                            <SidebarMenuSubButton href='/ui/cards'>
                                                                Cards
                                                            </SidebarMenuSubButton>
                                                        </SidebarMenuSubItem>
                                                        <SidebarMenuSubItem>
                                                            <SidebarMenuSubButton href='/ui/forms'>
                                                                Forms
                                                            </SidebarMenuSubButton>
                                                        </SidebarMenuSubItem>
                                                    </SidebarMenuSub>
                                                </SidebarMenuItem>
                                                <SidebarMenuItem>
                                                    <SidebarMenuButton href='#'>
                                                        <svg
                                                            xmlns='http://www.w3.org/2000/svg'
                                                            width='16'
                                                            height='16'
                                                            viewBox='0 0 24 24'
                                                            fill='none'
                                                            stroke='currentColor'
                                                            stroke-width='2'
                                                        >
                                                            <path d='M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z' />
                                                            <polyline points='14 2 14 8 20 8' />
                                                        </svg>
                                                        <span>
                                                            Documentation
                                                        </span>
                                                    </SidebarMenuButton>
                                                </SidebarMenuItem>
                                            </SidebarMenu>
                                        </SidebarGroupContent>
                                    </SidebarGroup>
                                </SidebarContent>
                                <SidebarFooter>
                                    <SidebarMenu>
                                        <SidebarMenuItem>
                                            <SidebarMenuButton href='#'>
                                                <svg
                                                    xmlns='http://www.w3.org/2000/svg'
                                                    width='16'
                                                    height='16'
                                                    viewBox='0 0 24 24'
                                                    fill='none'
                                                    stroke='currentColor'
                                                    stroke-width='2'
                                                >
                                                    <path d='M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2' />
                                                    <circle
                                                        cx='12'
                                                        cy='7'
                                                        r='4'
                                                    />
                                                </svg>
                                                <span>Profile</span>
                                            </SidebarMenuButton>
                                        </SidebarMenuItem>
                                    </SidebarMenu>
                                </SidebarFooter>
                                <SidebarRail />
                            </Sidebar>
                            <SidebarInset>
                                <header class='flex h-16 shrink-0 items-center gap-2 border-b px-4'>
                                    <SidebarTrigger />
                                    <div class='flex items-center gap-2 text-sm'>
                                        <span>Interactive Sidebar Demo</span>
                                    </div>
                                </header>
                                <div class='flex flex-1 flex-col gap-4 p-4'>
                                    <div class='grid auto-rows-min gap-4 md:grid-cols-3'>
                                        <div class='aspect-video rounded-xl bg-muted/50' />
                                        <div class='aspect-video rounded-xl bg-muted/50' />
                                        <div class='aspect-video rounded-xl bg-muted/50' />
                                    </div>
                                    <div class='min-h-screen flex-1 rounded-xl bg-muted/50' />
                                </div>
                            </SidebarInset>
                        </SidebarProvider>
                    </div>
                    <p class='text-sm text-muted-foreground'>
                        ⌘/Ctrl + B to toggle • Click trigger button • Hover over
                        icons in collapsed mode
                    </p>
                </section>

                {/* Features */}
                <section class='space-y-4'>
                    <div class='grid gap-4 md:grid-cols-2'>
                        <Card>
                            <CardHeader>
                                <CardTitle>🎯 Collapsible</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p class='text-sm text-muted-foreground'>
                                    Three modes: offcanvas (mobile), icon
                                    (collapsed), none (fixed)
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader>
                                <CardTitle>⌨️ Keyboard</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p class='text-sm text-muted-foreground'>
                                    Cmd/Ctrl + B shortcut for quick toggle
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader>
                                <CardTitle>🔄 Persistent</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p class='text-sm text-muted-foreground'>
                                    State saved in localStorage across sessions
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader>
                                <CardTitle>🎨 Themeable</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p class='text-sm text-muted-foreground'>
                                    CSS variables for full theme customization
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader>
                                <CardTitle>📱 Responsive</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p class='text-sm text-muted-foreground'>
                                    Overlay on mobile, docked on desktop
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader>
                                <CardTitle>🧩 Composable</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p class='text-sm text-muted-foreground'>
                                    17+ sub-components for flexible layouts
                                </p>
                            </CardContent>
                        </Card>
                    </div>
                </section>

                {/* Components */}
                <section class='space-y-4'>
                    <Card>
                        <CardHeader>
                            <CardTitle>Components</CardTitle>
                            <CardDescription>
                                All available sidebar sub-components
                            </CardDescription>
                        </CardHeader>
                        <CardContent class='space-y-2 text-sm'>
                            <div class='font-mono'>
                                <code class='bg-muted px-2 py-1 rounded'>
                                    SidebarProvider
                                </code>{' '}
                                - Root wrapper with state management
                            </div>
                            <div class='font-mono'>
                                <code class='bg-muted px-2 py-1 rounded'>
                                    Sidebar
                                </code>{' '}
                                - Main container with variants
                            </div>
                            <div class='font-mono'>
                                <code class='bg-muted px-2 py-1 rounded'>
                                    SidebarTrigger
                                </code>{' '}
                                - Toggle button
                            </div>
                            <div class='font-mono'>
                                <code class='bg-muted px-2 py-1 rounded'>
                                    SidebarHeader
                                </code>{' '}
                                - Top section
                            </div>
                            <div class='font-mono'>
                                <code class='bg-muted px-2 py-1 rounded'>
                                    SidebarContent
                                </code>{' '}
                                - Scrollable main area
                            </div>
                            <div class='font-mono'>
                                <code class='bg-muted px-2 py-1 rounded'>
                                    SidebarFooter
                                </code>{' '}
                                - Bottom section
                            </div>
                            <div class='font-mono'>
                                <code class='bg-muted px-2 py-1 rounded'>
                                    SidebarGroup
                                </code>{' '}
                                - Section container
                            </div>
                            <div class='font-mono'>
                                <code class='bg-muted px-2 py-1 rounded'>
                                    SidebarMenu
                                </code>{' '}
                                - Navigation menu
                            </div>
                            <div class='font-mono'>
                                <code class='bg-muted px-2 py-1 rounded'>
                                    SidebarMenuButton
                                </code>{' '}
                                - Menu item with Unpoly support
                            </div>
                            <div class='font-mono'>
                                <code class='bg-muted px-2 py-1 rounded'>
                                    SidebarInset
                                </code>{' '}
                                - Content wrapper
                            </div>
                        </CardContent>
                    </Card>
                </section>

                {/* Basic Usage */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        BASIC USAGE
                    </h2>
                    <CodeBlock lang='tsx'>
                        {`import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@lockness/ui/components'

<SidebarProvider>
  <Sidebar>
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton href="/home">
                Home
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
  </Sidebar>
  <SidebarInset>
    <main>Your content</main>
  </SidebarInset>
</SidebarProvider>`}
                    </CodeBlock>
                </section>

                {/* With Unpoly */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        WITH UNPOLY
                    </h2>
                    <CodeBlock lang='tsx'>
                        {`<SidebarMenuButton href="/dashboard">
  Dashboard
</SidebarMenuButton>

// Automatically includes:
// - up-follow for AJAX navigation
// - up-nav for active state detection`}
                    </CodeBlock>
                </section>

                {/* Theming */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        THEMING
                    </h2>
                    <CodeBlock lang='css'>
                        {`--sidebar: oklch(0.97 0.005 240)
--sidebar-foreground: oklch(0.15 0.020 240)
--sidebar-primary: oklch(0.35 0.080 240)
--sidebar-primary-foreground: oklch(0.98 0.005 240)
--sidebar-accent: oklch(0.95 0.010 240)
--sidebar-accent-foreground: oklch(0.25 0.020 240)
--sidebar-border: oklch(0.90 0.010 240)
--sidebar-ring: oklch(0.35 0.080 240)`}
                    </CodeBlock>
                </section>
            </div>
        </PageUiLayout>
    )
}
