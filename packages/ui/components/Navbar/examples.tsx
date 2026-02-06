/**
 * @fileoverview Live examples for Navbar component
 */

import { Card, CardContent } from '../Card/mod.tsx'
import { CodeBlock } from '../CodeBlock/mod.tsx'
import {
    Navbar,
    NavbarBrand,
    NavbarContent,
    NavbarMenu,
    NavbarMenuItem,
    NavbarToggle,
} from './mod.tsx'
import { createDocsSection } from '../../docs_renderer.tsx'

export interface ExampleSection {
    title: string
    render: () => unknown
}

export const examples: ExampleSection[] = [
    // Documentation section - renders DOCS.md content
    createDocsSection('Navbar'),
    {
        title: 'Basic Navbar',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-0'>
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
                    </CardContent>
                </Card>
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
            </div>
        ),
    },
    {
        title: 'With Mobile Menu',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-0'>
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
                                            const menu = document.querySelector('#mobile-menu-example');
                                            const isOpen = menu.getAttribute('data-open') === 'true';
                                            menu.setAttribute('data-open', (!isOpen).toString());
                                        " />
                                </Navbar>
                                <NavbarMenu
                                    id='mobile-menu-example'
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
                    </CardContent>
                </Card>
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
            </div>
        ),
    },
    {
        title: 'Sticky Navbar',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-0'>
                        <div class='rounded-(--radius) border border-(--border) overflow-hidden h-64 relative'>
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
                            <div class='p-6 space-y-4 overflow-auto h-48'>
                                <p class='text-(--muted-foreground)'>
                                    Scroll down to see the navbar stick to the
                                    top...
                                </p>
                                <p class='text-(--muted-foreground)'>
                                    Content paragraph 1. This demonstrates the
                                    sticky behavior of the navbar.
                                </p>
                                <p class='text-(--muted-foreground)'>
                                    Content paragraph 2. This demonstrates the
                                    sticky behavior of the navbar.
                                </p>
                                <p class='text-(--muted-foreground)'>
                                    Content paragraph 3. This demonstrates the
                                    sticky behavior of the navbar.
                                </p>
                                <p class='text-(--muted-foreground)'>
                                    Content paragraph 4. This demonstrates the
                                    sticky behavior of the navbar.
                                </p>
                                <p class='text-(--muted-foreground)'>
                                    Content paragraph 5. This demonstrates the
                                    sticky behavior of the navbar.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
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
            </div>
        ),
    },
]
