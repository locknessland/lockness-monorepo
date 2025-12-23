import { DocsLayout } from '@view/layouts/docs_layout.tsx'
import { CommandBlock, CodeBlock } from '@view/components/code_block.tsx'

export const ComponentsPage = () => {
    return (
        <DocsLayout title="Components - Lockness JS">
            <div class="max-w-4xl mx-auto">
                <h1 class="text-4xl font-bold mb-4">Components</h1>
                <p class="text-xl text-gray-600 mb-8">
                    Lockness uses JSX for building UI components. Generate reusable components with the Ace CLI.
                </p>

                <section class="mb-12">
                    <h2 class="text-3xl font-bold mb-4">Creating Components</h2>
                    <p class="mb-4">Use the <code class="bg-gray-100 px-2 py-1 rounded">make:component</code> command to scaffold new JSX components:</p>
                    <CommandBlock lang='terminal'>
{`deno task ace make:component Button`}
                    </CommandBlock>
                    <p class="mb-4">This creates <code class="bg-gray-100 px-2 py-1 rounded">src/view/components/button.tsx</code> with:</p>
                    <CodeBlock lang='typescript'>
{`export const Button = (props: ButtonProps) => {
    return (
        <div>
            {/* Button component */}
            {props.children}
        </div>
    )
}`}
                    </CodeBlock>
                </section>

                <section class="mb-12">
                    <h2 class="text-3xl font-bold mb-4">Naming Conventions</h2>
                    <p class="mb-4">Lockness follows these naming conventions for components:</p>
                    <div class="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6">
                        <ul class="list-disc list-inside space-y-2">
                            <li><strong>Component class name:</strong> PascalCase (e.g., <code class="bg-gray-100 px-2 py-1 rounded">Button</code>, <code class="bg-gray-100 px-2 py-1 rounded">UserCard</code>)</li>
                            <li><strong>File name:</strong> snake_case (e.g., <code class="bg-gray-100 px-2 py-1 rounded">button.tsx</code>, <code class="bg-gray-100 px-2 py-1 rounded">user_card.tsx</code>)</li>
                            <li><strong>Props interface:</strong> <code class="bg-gray-100 px-2 py-1 rounded">{"<ComponentName>Props"}</code></li>
                        </ul>
                    </div>
                </section>

                <section class="mb-12">
                    <h2 class="text-3xl font-bold mb-4">Nested Components</h2>
                    <p class="mb-4">Create components in subdirectories for better organization:</p>
                    <CommandBlock lang='terminal'>
{`deno task ace make:component ui/Card
deno task ace make:component forms/Input`}
                    </CommandBlock>
                    <p class="mb-4">This creates:</p>
                    <ul class="list-disc list-inside mb-6 ml-4 space-y-2">
                        <li><code class="bg-gray-100 px-2 py-1 rounded">src/view/components/ui/card.tsx</code></li>
                        <li><code class="bg-gray-100 px-2 py-1 rounded">src/view/components/forms/input.tsx</code></li>
                    </ul>
                </section>

                <section class="mb-12">
                    <h2 class="text-3xl font-bold mb-4">Component Props</h2>
                    <p class="mb-4">Define typed props for your components:</p>
                    <CodeBlock lang='typescript'>
{`interface ButtonProps {
    variant?: 'primary' | 'secondary' | 'danger'
    size?: 'sm' | 'md' | 'lg'
    disabled?: boolean
    onClick?: () => void
    children?: any
}

export const Button = (props: ButtonProps) => {
    const variant = props.variant || 'primary'
    const size = props.size || 'md'
    
    return (
        <button
            class={\`btn btn-\${variant} btn-\${size}\`}
            disabled={props.disabled}
            onClick={props.onClick}
        >
            {props.children}
        </button>
    )
}`}
                    </CodeBlock>
                </section>

                <section class="mb-12">
                    <h2 class="text-3xl font-bold mb-4">Using Components</h2>
                    <p class="mb-4">Import and use components in your pages:</p>
                    <CodeBlock lang='typescript'>
{`import { Button } from '@view/components/button.tsx'
import { Card } from '@view/components/ui/card.tsx'

export const HomePage = () => {
    return (
        <div>
            <Card>
                <h1>Welcome</h1>
                <Button variant="primary" size="lg">
                    Get Started
                </Button>
            </Card>
        </div>
    )
}`}
                    </CodeBlock>
                </section>

                <section class="mb-12">
                    <h2 class="text-3xl font-bold mb-4">JSX in Lockness</h2>
                    <p class="mb-4">Lockness uses Hono's JSX runtime for server-side rendering. Key features:</p>
                    <div class="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-6">
                        <ul class="space-y-3">
                            <li>
                                <strong class="text-lg">✓ Standard JSX syntax</strong>
                                <p class="text-gray-600 ml-6">Use familiar JSX with TypeScript support</p>
                            </li>
                            <li>
                                <strong class="text-lg">✓ Props typing</strong>
                                <p class="text-gray-600 ml-6">Full TypeScript intellisense for props</p>
                            </li>
                            <li>
                                <strong class="text-lg">✓ Server-side rendering</strong>
                                <p class="text-gray-600 ml-6">Components render on the server for fast initial load</p>
                            </li>
                            <li>
                                <strong class="text-lg">✓ Children support</strong>
                                <p class="text-gray-600 ml-6">Pass children to components like React</p>
                            </li>
                        </ul>
                    </div>
                </section>

                <section class="mb-12">
                    <h2 class="text-3xl font-bold mb-4">Component Structure</h2>
                    <p class="mb-4">Organize your components by feature or type:</p>
                    <CodeBlock lang='plaintext'>
{`src/view/components/
├── ui/
│   ├── button.tsx
│   ├── card.tsx
│   └── badge.tsx
├── forms/
│   ├── input.tsx
│   ├── select.tsx
│   └── textarea.tsx
├── layout/
│   ├── header.tsx
│   ├── footer.tsx
│   └── sidebar.tsx
└── docs_sidebar.tsx`}
                    </CodeBlock>
                </section>

                <section class="mb-12">
                    <h2 class="text-3xl font-bold mb-4">Best Practices</h2>
                    <div class="space-y-4">
                        <div class="bg-green-50 border-l-4 border-green-500 p-4">
                            <p class="font-bold mb-2">✓ Keep components small and focused</p>
                            <p class="text-gray-700">Each component should do one thing well</p>
                        </div>
                        <div class="bg-green-50 border-l-4 border-green-500 p-4">
                            <p class="font-bold mb-2">✓ Use TypeScript interfaces for props</p>
                            <p class="text-gray-700">Define clear contracts for component APIs</p>
                        </div>
                        <div class="bg-green-50 border-l-4 border-green-500 p-4">
                            <p class="font-bold mb-2">✓ Export const arrow functions</p>
                            <p class="text-gray-700">Consistent with Lockness conventions</p>
                        </div>
                        <div class="bg-green-50 border-l-4 border-green-500 p-4">
                            <p class="font-bold mb-2">✓ Group related components</p>
                            <p class="text-gray-700">Use subdirectories for organization</p>
                        </div>
                    </div>
                </section>

                <div class="bg-blue-50 border-l-4 border-blue-500 p-6">
                    <p class="font-bold mb-2">💡 Next Steps</p>
                    <p class="mb-4">Now that you know how to create components, learn how to use them in pages and layouts:</p>
                    <ul class="list-disc list-inside space-y-2">
                        <li><a href="/docs/routing" class="text-blue-600 hover:underline">Routing & Controllers</a></li>
                        <li><a href="/docs/getting-started" class="text-blue-600 hover:underline">Getting Started Guide</a></li>
                        <li><a href="/docs/cli" class="text-blue-600 hover:underline">CLI Commands</a></li>
                    </ul>
                </div>
            </div>
        </DocsLayout>
    )
}
