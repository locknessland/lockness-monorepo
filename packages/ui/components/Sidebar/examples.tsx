/**
 * @fileoverview Live examples for Sidebar component
 */

import { Card, CardContent } from '../Card/mod.tsx'
import { CodeBlock } from '../CodeBlock/mod.tsx'
import {
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
} from './mod.tsx'
import { createDocsSection } from '../../docs_renderer.tsx'

export interface ExampleSection {
    title: string
    render: () => unknown
}

// Icons for examples
const HomeIcon = () => (
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
)

const ComponentsIcon = () => (
    <svg
        xmlns='http://www.w3.org/2000/svg'
        width='16'
        height='16'
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        stroke-width='2'
    >
        <rect width='20' height='14' x='2' y='5' rx='2' />
    </svg>
)

const DocsIcon = () => (
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
)

const UserIcon = () => (
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
        <circle cx='12' cy='7' r='4' />
    </svg>
)

const PlusIcon = () => (
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
)

const MoreIcon = () => (
    <svg
        xmlns='http://www.w3.org/2000/svg'
        width='12'
        height='12'
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        stroke-width='2'
    >
        <circle cx='12' cy='12' r='1' />
        <circle cx='12' cy='5' r='1' />
        <circle cx='12' cy='19' r='1' />
    </svg>
)

export const examples: ExampleSection[] = [
    // Documentation section - renders DOCS.md content
    createDocsSection('Sidebar'),
    {
        title: 'Interactive Demo',
        render: () => (
            <div class='space-y-4'>
                <div
                    class='border rounded-lg overflow-hidden relative'
                    style='height: 500px'
                >
                    <SidebarProvider class='flex h-full'>
                        <Sidebar collapsible='icon' class='block! relative!'>
                            <SidebarHeader>
                                <SidebarMenu>
                                    <SidebarMenuItem>
                                        <SidebarMenuButton href='#' isActive>
                                            <HomeIcon />
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
                                        <PlusIcon />
                                    </SidebarGroupAction>
                                    <SidebarGroupContent>
                                        <SidebarMenu>
                                            <SidebarMenuItem>
                                                <SidebarMenuButton
                                                    href='#'
                                                    isActive
                                                >
                                                    <HomeIcon />
                                                    <span>Home</span>
                                                </SidebarMenuButton>
                                                <SidebarMenuAction>
                                                    <MoreIcon />
                                                </SidebarMenuAction>
                                            </SidebarMenuItem>
                                            <SidebarMenuItem>
                                                <SidebarMenuButton href='#'>
                                                    <ComponentsIcon />
                                                    <span>Components</span>
                                                </SidebarMenuButton>
                                                <SidebarMenuBadge>
                                                    24
                                                </SidebarMenuBadge>
                                                <SidebarMenuSub>
                                                    <SidebarMenuSubItem>
                                                        <SidebarMenuSubButton
                                                            href='#'
                                                            isActive
                                                        >
                                                            Buttons
                                                        </SidebarMenuSubButton>
                                                    </SidebarMenuSubItem>
                                                    <SidebarMenuSubItem>
                                                        <SidebarMenuSubButton href='#'>
                                                            Cards
                                                        </SidebarMenuSubButton>
                                                    </SidebarMenuSubItem>
                                                    <SidebarMenuSubItem>
                                                        <SidebarMenuSubButton href='#'>
                                                            Forms
                                                        </SidebarMenuSubButton>
                                                    </SidebarMenuSubItem>
                                                </SidebarMenuSub>
                                            </SidebarMenuItem>
                                            <SidebarMenuItem>
                                                <SidebarMenuButton href='#'>
                                                    <DocsIcon />
                                                    <span>Documentation</span>
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
                                            <UserIcon />
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
                                <div class='min-h-32 flex-1 rounded-xl bg-muted/50' />
                            </div>
                        </SidebarInset>
                    </SidebarProvider>
                </div>
                <p class='text-sm text-muted-foreground'>
                    ⌘/Ctrl + B to toggle • Click trigger button • Hover over
                    icons in collapsed mode
                </p>
            </div>
        ),
    },
    {
        title: 'Features',
        render: () => (
            <div class='space-y-4'>
                <div class='grid gap-4 md:grid-cols-2'>
                    <Card>
                        <CardContent class='p-6'>
                            <h3 class='font-semibold mb-2'>🎯 Collapsible</h3>
                            <p class='text-sm text-muted-foreground'>
                                Three modes: offcanvas (mobile), icon
                                (collapsed), none (fixed)
                            </p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent class='p-6'>
                            <h3 class='font-semibold mb-2'>⌨️ Keyboard</h3>
                            <p class='text-sm text-muted-foreground'>
                                Cmd/Ctrl + B shortcut for quick toggle
                            </p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent class='p-6'>
                            <h3 class='font-semibold mb-2'>🔄 Persistent</h3>
                            <p class='text-sm text-muted-foreground'>
                                State saved in localStorage across sessions
                            </p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent class='p-6'>
                            <h3 class='font-semibold mb-2'>🎨 Themeable</h3>
                            <p class='text-sm text-muted-foreground'>
                                CSS variables for full theme customization
                            </p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent class='p-6'>
                            <h3 class='font-semibold mb-2'>📱 Responsive</h3>
                            <p class='text-sm text-muted-foreground'>
                                Overlay on mobile, docked on desktop
                            </p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent class='p-6'>
                            <h3 class='font-semibold mb-2'>🧩 Composable</h3>
                            <p class='text-sm text-muted-foreground'>
                                17+ sub-components for flexible layouts
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        ),
    },
    {
        title: 'Basic Usage',
        render: () => (
            <div class='space-y-4'>
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
            </div>
        ),
    },
    {
        title: 'With Unpoly',
        render: () => (
            <div class='space-y-4'>
                <CodeBlock lang='tsx'>
                    {`<SidebarMenuButton href="/dashboard">
  Dashboard
</SidebarMenuButton>

// Automatically includes:
// - up-follow for AJAX navigation
// - up-nav for active state detection`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Theming',
        render: () => (
            <div class='space-y-4'>
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
            </div>
        ),
    },
]
