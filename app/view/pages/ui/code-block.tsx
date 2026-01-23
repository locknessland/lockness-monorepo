import { PageUiLayout } from '@view/layouts/ui_layout.tsx'
import { CodeBlock, CommandBlock, Command, InlineCode } from '@lockness/ui/components'

export const CodeBlockPage = () => {
    return (
        <PageUiLayout title='Code Block - Lockness UI'>
            <div class='space-y-8 max-w-full'>
                <header>
                    <h1 class='font-pixel text-2xl text-foreground mb-2'>
                        CODE BLOCK
                    </h1>
                    <p class='text-lg text-muted-foreground'>
                        Components for displaying code with syntax highlighting and copy-to-clipboard functionality
                    </p>
                </header>

                {/* InlineCode */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>INLINE CODE</h2>
                    <p class='text-muted-foreground'>
                        For inline code within paragraphs.
                    </p>
                    <div class='py-6 bg-card rounded-lg px-4'>
                        <p class='text-foreground'>
                            Use the <InlineCode>deno run</InlineCode> command to execute scripts.
                            The <InlineCode>--allow-net</InlineCode> flag enables network access.
                        </p>
                    </div>
                    <CodeBlock lang='tsx'>
{`<p>
  Use the <InlineCode>deno run</InlineCode> command to execute scripts.
</p>`}
                    </CodeBlock>
                </section>

                {/* Command */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>COMMAND</h2>
                    <p class='text-muted-foreground'>
                        Displays a command with a copy button, ideal for one-liner terminal commands.
                    </p>
                    <div class='py-6 bg-card rounded-lg px-4'>
                        <Command>deno run -A main.ts</Command>
                    </div>
                    <CodeBlock lang='tsx'>
{`<Command>deno run -A main.ts</Command>`}
                    </CodeBlock>
                </section>

                {/* CommandBlock */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>COMMAND BLOCK</h2>
                    <p class='text-muted-foreground'>
                        A full code block styled for terminal commands with header and copy button.
                    </p>
                    <CommandBlock lang='bash'>
{`# Clone the repository
git clone https://github.com/lockness/app.git

# Install dependencies  
deno install

# Start the development server
deno task dev`}
                    </CommandBlock>
                    <CodeBlock lang='tsx'>
{`<CommandBlock lang="bash">
{\`# Clone the repository
git clone https://github.com/lockness/app.git

# Install dependencies
deno install\`}
</CommandBlock>`}
                    </CodeBlock>
                </section>

                {/* CodeBlock */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>CODE BLOCK</h2>
                    <p class='text-muted-foreground'>
                        Full code block with syntax highlighting, language label, and copy button.
                    </p>
                    <CodeBlock lang='typescript'>
{`interface User {
  id: number;
  name: string;
  email: string;
}

async function fetchUsers(): Promise<User[]> {
  const response = await fetch('/api/users');
  return response.json();
}`}
                    </CodeBlock>
                    <CodeBlock lang='tsx'>
{`<CodeBlock lang="typescript">
{\`interface User {
  id: number;
  name: string;
  email: string;
}\`}
</CodeBlock>`}
                    </CodeBlock>
                </section>

                {/* Themes */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>THEMES</h2>
                    <p class='text-muted-foreground'>
                        Four built-in themes are available: <InlineCode>default</InlineCode>, <InlineCode>monokai</InlineCode>, <InlineCode>github</InlineCode>, and <InlineCode>nord</InlineCode>.
                    </p>
                    
                    <h3 class='text-foreground text-sm mt-6'>Default Theme</h3>
                    <CodeBlock lang='typescript' theme='default'>
{`function greet(name: string): string {
  return \`Hello, \${name}!\`;
}`}
                    </CodeBlock>

                    <h3 class='text-foreground text-sm mt-6'>Monokai Theme</h3>
                    <CodeBlock lang='typescript' theme='monokai'>
{`function greet(name: string): string {
  return \`Hello, \${name}!\`;
}`}
                    </CodeBlock>

                    <h3 class='text-foreground text-sm mt-6'>GitHub Theme</h3>
                    <CodeBlock lang='typescript' theme='github'>
{`function greet(name: string): string {
  return \`Hello, \${name}!\`;
}`}
                    </CodeBlock>

                    <h3 class='text-foreground text-sm mt-6'>Nord Theme</h3>
                    <CodeBlock lang='typescript' theme='nord'>
{`function greet(name: string): string {
  return \`Hello, \${name}!\`;
}`}
                    </CodeBlock>
                </section>

                {/* Props Table */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>PROPS</h2>
                    
                    <h3 class='text-foreground text-sm mt-4'>CodeBlock / CommandBlock</h3>
                    <div class='overflow-x-auto'>
                        <table class='w-full text-sm'>
                            <thead>
                                <tr class='border-b border-border'>
                                    <th class='text-left py-2 px-3 text-foreground'>Prop</th>
                                    <th class='text-left py-2 px-3 text-foreground'>Type</th>
                                    <th class='text-left py-2 px-3 text-foreground'>Default</th>
                                    <th class='text-left py-2 px-3 text-foreground'>Description</th>
                                </tr>
                            </thead>
                            <tbody class='text-muted-foreground'>
                                <tr class='border-b border-border/50'>
                                    <td class='py-2 px-3'><code>children</code></td>
                                    <td class='py-2 px-3'><code>string</code></td>
                                    <td class='py-2 px-3'>-</td>
                                    <td class='py-2 px-3'>The code content to display</td>
                                </tr>
                                <tr class='border-b border-border/50'>
                                    <td class='py-2 px-3'><code>lang</code></td>
                                    <td class='py-2 px-3'><code>string</code></td>
                                    <td class='py-2 px-3'><code>'typescript'</code></td>
                                    <td class='py-2 px-3'>Programming language for syntax highlighting</td>
                                </tr>
                                <tr class='border-b border-border/50'>
                                    <td class='py-2 px-3'><code>theme</code></td>
                                    <td class='py-2 px-3'><code>ThemeName</code></td>
                                    <td class='py-2 px-3'><code>'default'</code></td>
                                    <td class='py-2 px-3'>Syntax highlighting theme</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <h3 class='text-foreground text-sm mt-6'>InlineCode / Command</h3>
                    <div class='overflow-x-auto'>
                        <table class='w-full text-sm'>
                            <thead>
                                <tr class='border-b border-border'>
                                    <th class='text-left py-2 px-3 text-foreground'>Prop</th>
                                    <th class='text-left py-2 px-3 text-foreground'>Type</th>
                                    <th class='text-left py-2 px-3 text-foreground'>Default</th>
                                    <th class='text-left py-2 px-3 text-foreground'>Description</th>
                                </tr>
                            </thead>
                            <tbody class='text-muted-foreground'>
                                <tr class='border-b border-border/50'>
                                    <td class='py-2 px-3'><code>children</code></td>
                                    <td class='py-2 px-3'><code>string</code></td>
                                    <td class='py-2 px-3'>-</td>
                                    <td class='py-2 px-3'>The code text to display</td>
                                </tr>
                                <tr class='border-b border-border/50'>
                                    <td class='py-2 px-3'><code>id</code></td>
                                    <td class='py-2 px-3'><code>string</code></td>
                                    <td class='py-2 px-3'>auto-generated</td>
                                    <td class='py-2 px-3'>Optional HTML id attribute</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* Language Support */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>LANGUAGE SUPPORT</h2>
                    <p class='text-muted-foreground'>
                        Syntax highlighting is powered by highlight.js. Common supported languages:
                    </p>
                    <div class='flex flex-wrap gap-2 py-4'>
                        {['typescript', 'javascript', 'python', 'rust', 'go', 'bash', 'json', 'html', 'css', 'sql', 'yaml', 'markdown'].map(lang => (
                            <span class='px-2 py-1 bg-muted text-muted-foreground rounded text-sm font-mono'>
                                {lang}
                            </span>
                        ))}
                    </div>
                </section>
            </div>
        </PageUiLayout>
    )
}
