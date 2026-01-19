/**
 * Navbar Component Demo Page
 * Demonstrates the Navbar component with various configurations
 */

import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
    CodeBlock,
    Navbar,
    NavbarBrand,
    NavbarContent,
    NavbarMenu,
    NavbarMenuItem,
    NavbarToggle,
} from '@lockness/ui/components'
import { PageUiLayout } from '@view/layouts/ui_layout.tsx'

export const NavbarDemoPage = () => {
    return (
        <PageUiLayout title='Navbar - Lockness UI'>
            <div class='space-y-8'>
                {/* Header */}
                <div class='space-y-2'>
                    <h1 class='font-pixel text-3xl font-bold tracking-tight'>
                        Navbar
                    </h1>
                    <p class='text-(--muted-foreground)'>
                        A responsive navigation bar component inspired by
                        shadcn/ui Navigation Menu. Fully theme-aware using CSS
                        variables.
                    </p>
                </div>

                {/* Basic Example */}
                <Card>
                    <CardHeader>
                        <CardTitle>Basic Navbar</CardTitle>
                        <CardDescription>
                            A simple navbar with brand and navigation items
                        </CardDescription>
                    </CardHeader>
                    <CardContent class='space-y-4'>
                        <div class='rounded-(--radius) border border-(--border) overflow-hidden'>
                            <Navbar position='static'>
                                <NavbarBrand href='#'>
                                    <span class='text-xl'>🦕</span>
                                    <span>Lockness</span>
                                </NavbarBrand>
                                <NavbarContent
                                    position='center'
                                    class='hidden md:flex'
                                >
                                    <NavbarMenuItem href='#' active>
                                        Home
                                    </NavbarMenuItem>
                                    <NavbarMenuItem href='#'>
                                        Docs
                                    </NavbarMenuItem>
                                    <NavbarMenuItem href='#'>
                                        Components
                                    </NavbarMenuItem>
                                    <NavbarMenuItem href='#'>
                                        Examples
                                    </NavbarMenuItem>
                                </NavbarContent>
                                <NavbarContent position='right'>
                                    <NavbarMenuItem href='#'>
                                        Login
                                    </NavbarMenuItem>
                                </NavbarContent>
                            </Navbar>
                        </div>
                        <CodeBlock lang='tsx'>
                            {`<Navbar position="static">
  <NavbarBrand href="/">
    <span class="text-xl">🦕</span>
    <span>Lockness</span>
  </NavbarBrand>
  <NavbarContent position="center" class="hidden md:flex">
    <NavbarMenuItem href="/" active>Home</NavbarMenuItem>
    <NavbarMenuItem href="/docs">Docs</NavbarMenuItem>
    <NavbarMenuItem href="/components">Components</NavbarMenuItem>
    <NavbarMenuItem href="/examples">Examples</NavbarMenuItem>
  </NavbarContent>
  <NavbarContent position="right">
    <NavbarMenuItem href="/login">Login</NavbarMenuItem>
  </NavbarContent>
</Navbar>`}
                        </CodeBlock>
                    </CardContent>
                </Card>

                {/* Mobile Menu Example */}
                <Card>
                    <CardHeader>
                        <CardTitle>With Mobile Menu</CardTitle>
                        <CardDescription>
                            Navbar with collapsible mobile menu (resize window
                            to see toggle button)
                        </CardDescription>
                    </CardHeader>
                    <CardContent class='space-y-4'>
                        <div class='rounded-(--radius) border border-(--border) overflow-hidden'>
                            <div id='navbar-mobile-demo'>
                                <Navbar position='static'>
                                    <NavbarBrand href='#'>
                                        <span class='text-xl'>🦕</span>
                                        <span>Lockness</span>
                                    </NavbarBrand>
                                    <NavbarContent
                                        position='center'
                                        class='hidden md:flex'
                                    >
                                        <NavbarMenuItem href='#' active>
                                            Home
                                        </NavbarMenuItem>
                                        <NavbarMenuItem href='#'>
                                            Docs
                                        </NavbarMenuItem>
                                        <NavbarMenuItem href='#'>
                                            Components
                                        </NavbarMenuItem>
                                        <NavbarMenuItem href='#'>
                                            About
                                        </NavbarMenuItem>
                                    </NavbarContent>
                                    <NavbarToggle onclick="
										const menu = document.querySelector('#mobile-menu');
										const isOpen = menu.getAttribute('data-open') === 'true';
										menu.setAttribute('data-open', (!isOpen).toString());
									" />
                                </Navbar>
                                <NavbarMenu
                                    id='mobile-menu'
                                    open={false}
                                    data-open='false'
                                    class='data-[open="true"]:translate-y-0 data-[open="true"]:opacity-100 data-[open="true"]:pointer-events-auto'
                                >
                                    <NavbarMenuItem href='#' active>
                                        Home
                                    </NavbarMenuItem>
                                    <NavbarMenuItem href='#'>
                                        Docs
                                    </NavbarMenuItem>
                                    <NavbarMenuItem href='#'>
                                        Components
                                    </NavbarMenuItem>
                                    <NavbarMenuItem href='#'>
                                        About
                                    </NavbarMenuItem>
                                </NavbarMenu>
                            </div>
                        </div>
                        <CodeBlock lang='tsx'>
                            {`const [isOpen, setIsOpen] = useState(false)

<Navbar position="static">
  <NavbarBrand href="/">
    <span class="text-xl">🦕</span>
    <span>Lockness</span>
  </NavbarBrand>
  <NavbarContent position="center" class="hidden md:flex">
    <NavbarMenuItem href="/" active>Home</NavbarMenuItem>
    <NavbarMenuItem href="/docs">Docs</NavbarMenuItem>
    <NavbarMenuItem href="/components">Components</NavbarMenuItem>
    <NavbarMenuItem href="/about">About</NavbarMenuItem>
  </NavbarContent>
  <NavbarToggle onClick={() => setIsOpen(!isOpen)} open={isOpen} />
</Navbar>
<NavbarMenu open={isOpen}>
  <NavbarMenuItem href="/" active>Home</NavbarMenuItem>
  <NavbarMenuItem href="/docs">Docs</NavbarMenuItem>
  <NavbarMenuItem href="/components">Components</NavbarMenuItem>
  <NavbarMenuItem href="/about">About</NavbarMenuItem>
</NavbarMenu>`}
                        </CodeBlock>
                    </CardContent>
                </Card>

                {/* Sticky Example */}
                <Card>
                    <CardHeader>
                        <CardTitle>Sticky Navbar</CardTitle>
                        <CardDescription>
                            Navbar that sticks to the top while scrolling
                            (default behavior)
                        </CardDescription>
                    </CardHeader>
                    <CardContent class='space-y-4'>
                        <div class='rounded-(--radius) border border-(--border) overflow-hidden h-100 relative'>
                            <Navbar position='sticky'>
                                <NavbarBrand href='#'>
                                    <span class='text-xl'>🦕</span>
                                    <span>Lockness</span>
                                </NavbarBrand>
                                <NavbarContent
                                    position='center'
                                    class='hidden md:flex'
                                >
                                    <NavbarMenuItem href='#'>
                                        Home
                                    </NavbarMenuItem>
                                    <NavbarMenuItem href='#'>
                                        Products
                                    </NavbarMenuItem>
                                    <NavbarMenuItem href='#'>
                                        Pricing
                                    </NavbarMenuItem>
                                </NavbarContent>
                            </Navbar>
                            <div class='p-6 space-y-4 overflow-auto h-84'>
                                <p class='text-(--muted-foreground)'>
                                    Scroll down to see the navbar stick to the
                                    top...
                                </p>
                                {Array.from({ length: 20 }).map((_, i) => (
                                    <p
                                        key={i}
                                        class='text-(--muted-foreground)'
                                    >
                                        Content paragraph{' '}
                                        {i + 1}. This demonstrates the sticky
                                        behavior of the navbar.
                                    </p>
                                ))}
                            </div>
                        </div>
                        <CodeBlock lang='tsx'>
                            {`<Navbar position="sticky">
  <NavbarBrand href="/">
    <span class="text-xl">🦕</span>
    <span>Lockness</span>
  </NavbarBrand>
  <NavbarContent position="center" class="hidden md:flex">
    <NavbarMenuItem href="/">Home</NavbarMenuItem>
    <NavbarMenuItem href="/products">Products</NavbarMenuItem>
    <NavbarMenuItem href="/pricing">Pricing</NavbarMenuItem>
  </NavbarContent>
</Navbar>`}
                        </CodeBlock>
                    </CardContent>
                </Card>

                {/* Props Documentation */}
                <Card>
                    <CardHeader>
                        <CardTitle>Component API</CardTitle>
                        <CardDescription>
                            Props and configuration options
                        </CardDescription>
                    </CardHeader>
                    <CardContent class='space-y-6'>
                        <div>
                            <h3 class='font-semibold mb-2'>Navbar Props</h3>
                            <div class='rounded-(--radius) border border-(--border) overflow-hidden'>
                                <table class='w-full text-sm'>
                                    <thead class='bg-(--muted)'>
                                        <tr>
                                            <th class='text-left p-3'>Prop</th>
                                            <th class='text-left p-3'>Type</th>
                                            <th class='text-left p-3'>
                                                Default
                                            </th>
                                            <th class='text-left p-3'>
                                                Description
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody class='divide-y divide-(--border)'>
                                        <tr>
                                            <td class='p-3 font-mono text-xs'>
                                                position
                                            </td>
                                            <td class='p-3 font-mono text-xs'>
                                                "sticky" | "fixed" | "static"
                                            </td>
                                            <td class='p-3 font-mono text-xs'>
                                                "sticky"
                                            </td>
                                            <td class='p-3'>
                                                Position behavior of the navbar
                                            </td>
                                        </tr>
                                        <tr>
                                            <td class='p-3 font-mono text-xs'>
                                                className
                                            </td>
                                            <td class='p-3 font-mono text-xs'>
                                                string
                                            </td>
                                            <td class='p-3'>-</td>
                                            <td class='p-3'>
                                                Additional CSS classes
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div>
                            <h3 class='font-semibold mb-2'>
                                NavbarContent Props
                            </h3>
                            <div class='rounded-(--radius) border border-(--border) overflow-hidden'>
                                <table class='w-full text-sm'>
                                    <thead class='bg-(--muted)'>
                                        <tr>
                                            <th class='text-left p-3'>Prop</th>
                                            <th class='text-left p-3'>Type</th>
                                            <th class='text-left p-3'>
                                                Default
                                            </th>
                                            <th class='text-left p-3'>
                                                Description
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody class='divide-y divide-(--border)'>
                                        <tr>
                                            <td class='p-3 font-mono text-xs'>
                                                position
                                            </td>
                                            <td class='p-3 font-mono text-xs'>
                                                "left" | "center" | "right"
                                            </td>
                                            <td class='p-3 font-mono text-xs'>
                                                "center"
                                            </td>
                                            <td class='p-3'>
                                                Horizontal alignment of content
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div>
                            <h3 class='font-semibold mb-2'>
                                NavbarMenuItem Props
                            </h3>
                            <div class='rounded-(--radius) border border-(--border) overflow-hidden'>
                                <table class='w-full text-sm'>
                                    <thead class='bg-(--muted)'>
                                        <tr>
                                            <th class='text-left p-3'>Prop</th>
                                            <th class='text-left p-3'>Type</th>
                                            <th class='text-left p-3'>
                                                Default
                                            </th>
                                            <th class='text-left p-3'>
                                                Description
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody class='divide-y divide-(--border)'>
                                        <tr>
                                            <td class='p-3 font-mono text-xs'>
                                                href
                                            </td>
                                            <td class='p-3 font-mono text-xs'>
                                                string
                                            </td>
                                            <td class='p-3 font-mono text-xs'>
                                                "#"
                                            </td>
                                            <td class='p-3'>
                                                Navigation link URL
                                            </td>
                                        </tr>
                                        <tr>
                                            <td class='p-3 font-mono text-xs'>
                                                active
                                            </td>
                                            <td class='p-3 font-mono text-xs'>
                                                boolean
                                            </td>
                                            <td class='p-3 font-mono text-xs'>
                                                false
                                            </td>
                                            <td class='p-3'>
                                                Active/selected state
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Features */}
                <Card>
                    <CardHeader>
                        <CardTitle>Features</CardTitle>
                        <CardDescription>
                            Key capabilities of the Navbar component
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ul class='space-y-2 text-(--muted-foreground)'>
                            <li class='flex items-start gap-2'>
                                <span class='text-(--primary)'>✓</span>
                                <span>
                                    <strong>Fully Theme-Aware:</strong>{' '}
                                    Uses all CSS variables from app.css for
                                    consistent theming
                                </span>
                            </li>
                            <li class='flex items-start gap-2'>
                                <span class='text-(--primary)'>✓</span>
                                <span>
                                    <strong>Responsive Design:</strong>{' '}
                                    Built-in mobile menu with smooth transitions
                                </span>
                            </li>
                            <li class='flex items-start gap-2'>
                                <span class='text-(--primary)'>✓</span>
                                <span>
                                    <strong>Flexible Positioning:</strong>{' '}
                                    Supports sticky, fixed, and static
                                    positioning
                                </span>
                            </li>
                            <li class='flex items-start gap-2'>
                                <span class='text-(--primary)'>✓</span>
                                <span>
                                    <strong>Unpoly Integration:</strong>{' '}
                                    Works seamlessly with Unpoly for SPA-like
                                    navigation
                                </span>
                            </li>
                            <li class='flex items-start gap-2'>
                                <span class='text-(--primary)'>✓</span>
                                <span>
                                    <strong>Accessibility:</strong>{' '}
                                    Proper ARIA attributes and keyboard
                                    navigation support
                                </span>
                            </li>
                            <li class='flex items-start gap-2'>
                                <span class='text-(--primary)'>✓</span>
                                <span>
                                    <strong>Composable:</strong>{' '}
                                    Mix and match sub-components for custom
                                    layouts
                                </span>
                            </li>
                        </ul>
                    </CardContent>
                </Card>
            </div>
        </PageUiLayout>
    )
}
