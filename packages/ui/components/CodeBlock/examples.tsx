/**
 * @fileoverview Live examples for CodeBlock component
 */

import { Card, CardContent } from '../Card/mod.tsx'
import { createDocsSection } from '../../docs_renderer.tsx'
import { CodeBlock, Command, CommandBlock, InlineCode } from './mod.tsx'

export interface ExampleSection {
    title: string
    render: () => unknown
}

export const examples: ExampleSection[] = [
    // Documentation section - renders DOCS.md content
    createDocsSection('CodeBlock'),
    {
        title: 'Inline Code',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <p class='text-foreground'>
                            Use the <InlineCode>deno run</InlineCode>{' '}
                            command to execute scripts. The{' '}
                            <InlineCode>--allow-net</InlineCode>{' '}
                            flag enables network access.
                        </p>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<p>
  Use the <InlineCode>deno run</InlineCode> command to execute scripts.
</p>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Command',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <Command>deno run -A main.ts</Command>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<Command>deno run -A main.ts</Command>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Command Block',
        render: () => (
            <div class='space-y-4'>
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
            </div>
        ),
    },
    {
        title: 'Code Block',
        render: () => (
            <div class='space-y-4'>
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
}\`}
</CodeBlock>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Default Theme',
        render: () => (
            <div class='space-y-4'>
                <CodeBlock lang='typescript' theme='default'>
                    {`function greet(name: string): string {
  const message = \`Hello, \${name}!\`;
  console.log(message);
  return message;
}`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Monokai Theme',
        render: () => (
            <div class='space-y-4'>
                <CodeBlock lang='typescript' theme='monokai'>
                    {`function greet(name: string): string {
  const message = \`Hello, \${name}!\`;
  console.log(message);
  return message;
}`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'GitHub Theme',
        render: () => (
            <div class='space-y-4'>
                <CodeBlock lang='typescript' theme='github'>
                    {`function greet(name: string): string {
  const message = \`Hello, \${name}!\`;
  console.log(message);
  return message;
}`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Nord Theme',
        render: () => (
            <div class='space-y-4'>
                <CodeBlock lang='typescript' theme='nord'>
                    {`function greet(name: string): string {
  const message = \`Hello, \${name}!\`;
  console.log(message);
  return message;
}`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Plain Theme (No Highlighting)',
        render: () => (
            <div class='space-y-4'>
                <CodeBlock lang='typescript' theme='plain'>
                    {`function greet(name: string): string {
  const message = \`Hello, \${name}!\`;
  console.log(message);
  return message;
}`}
                </CodeBlock>
            </div>
        ),
    },
]
