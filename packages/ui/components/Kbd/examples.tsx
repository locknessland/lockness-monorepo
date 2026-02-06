/**
 * @fileoverview Live examples for Kbd component
 * These examples are rendered on the documentation page
 */

import { Card, CardContent } from '../Card/mod.tsx'
import { CodeBlock } from '../CodeBlock/mod.tsx'
import { Kbd } from './mod.tsx'
import { createDocsSection } from '../../docs_renderer.tsx'

/**
 * Example section with live preview and code
 */
interface ExampleSection {
    title: string
    render: () => any
}

/**
 * All examples for the Kbd component
 */
export const examples: ExampleSection[] = [
    // Documentation section - renders DOCS.md content
    createDocsSection('Kbd'),
    {
        title: 'Basic Keys',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 flex flex-wrap gap-4'>
                        <Kbd>⌘</Kbd>
                        <Kbd>⇧</Kbd>
                        <Kbd>⌥</Kbd>
                        <Kbd>⌃</Kbd>
                        <Kbd>⏎</Kbd>
                        <Kbd>⌫</Kbd>
                        <Kbd>⇥</Kbd>
                        <Kbd>⎋</Kbd>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`import { Kbd } from '@lockness/ui/components'

<Kbd>⌘</Kbd>
<Kbd>⇧</Kbd>
<Kbd>⌥</Kbd>
<Kbd>⌃</Kbd>
<Kbd>⏎</Kbd>
<Kbd>⌫</Kbd>
<Kbd>⇥</Kbd>
<Kbd>⎋</Kbd>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Letter Keys',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 flex flex-wrap gap-2'>
                        <Kbd>A</Kbd>
                        <Kbd>B</Kbd>
                        <Kbd>C</Kbd>
                        <Kbd>D</Kbd>
                        <Kbd>E</Kbd>
                        <Kbd>F</Kbd>
                        <Kbd>G</Kbd>
                        <Kbd>H</Kbd>
                        <Kbd>I</Kbd>
                        <Kbd>J</Kbd>
                        <Kbd>K</Kbd>
                        <Kbd>L</Kbd>
                        <Kbd>M</Kbd>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<Kbd>A</Kbd>
<Kbd>B</Kbd>
<Kbd>C</Kbd>
...`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Keyboard Combinations',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-4'>
                        <div class='flex items-center gap-2'>
                            <span class='text-muted-foreground w-24'>
                                Copy:
                            </span>
                            <Kbd>⌘</Kbd>
                            <span class='text-muted-foreground'>+</span>
                            <Kbd>C</Kbd>
                        </div>
                        <div class='flex items-center gap-2'>
                            <span class='text-muted-foreground w-24'>
                                Paste:
                            </span>
                            <Kbd>⌘</Kbd>
                            <span class='text-muted-foreground'>+</span>
                            <Kbd>V</Kbd>
                        </div>
                        <div class='flex items-center gap-2'>
                            <span class='text-muted-foreground w-24'>
                                Save:
                            </span>
                            <Kbd>⌘</Kbd>
                            <span class='text-muted-foreground'>+</span>
                            <Kbd>S</Kbd>
                        </div>
                        <div class='flex items-center gap-2'>
                            <span class='text-muted-foreground w-24'>
                                Undo:
                            </span>
                            <Kbd>⌘</Kbd>
                            <span class='text-muted-foreground'>+</span>
                            <Kbd>Z</Kbd>
                        </div>
                        <div class='flex items-center gap-2'>
                            <span class='text-muted-foreground w-24'>
                                Find:
                            </span>
                            <Kbd>⌘</Kbd>
                            <span class='text-muted-foreground'>+</span>
                            <Kbd>F</Kbd>
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<div class="flex items-center gap-2">
    <span>Copy:</span>
    <Kbd>⌘</Kbd>
    <span>+</span>
    <Kbd>C</Kbd>
</div>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Complex Shortcuts',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 space-y-4'>
                        <div class='flex items-center gap-2'>
                            <span class='text-muted-foreground w-40'>
                                Command Palette:
                            </span>
                            <Kbd>⌘</Kbd>
                            <span class='text-muted-foreground'>+</span>
                            <Kbd>⇧</Kbd>
                            <span class='text-muted-foreground'>+</span>
                            <Kbd>P</Kbd>
                        </div>
                        <div class='flex items-center gap-2'>
                            <span class='text-muted-foreground w-40'>
                                Force Quit:
                            </span>
                            <Kbd>⌘</Kbd>
                            <span class='text-muted-foreground'>+</span>
                            <Kbd>⌥</Kbd>
                            <span class='text-muted-foreground'>+</span>
                            <Kbd>⎋</Kbd>
                        </div>
                        <div class='flex items-center gap-2'>
                            <span class='text-muted-foreground w-40'>
                                Screenshot:
                            </span>
                            <Kbd>⌘</Kbd>
                            <span class='text-muted-foreground'>+</span>
                            <Kbd>⇧</Kbd>
                            <span class='text-muted-foreground'>+</span>
                            <Kbd>4</Kbd>
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<div class="flex items-center gap-2">
    <span>Command Palette:</span>
    <Kbd>⌘</Kbd>
    <span>+</span>
    <Kbd>⇧</Kbd>
    <span>+</span>
    <Kbd>P</Kbd>
</div>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Inline with Text',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <p class='text-muted-foreground'>
                            Press <Kbd>⌘</Kbd> + <Kbd>K</Kbd>{' '}
                            to open the command menu. Use <Kbd>↑</Kbd> and{' '}
                            <Kbd>↓</Kbd> to navigate, then press <Kbd>⏎</Kbd>
                            {' '}
                            to select.
                        </p>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<p>
    Press <Kbd>⌘</Kbd> + <Kbd>K</Kbd> to open the command menu.
    Use <Kbd>↑</Kbd> and <Kbd>↓</Kbd> to navigate,
    then press <Kbd>⏎</Kbd> to select.
</p>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Function Keys',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 flex flex-wrap gap-2'>
                        <Kbd>F1</Kbd>
                        <Kbd>F2</Kbd>
                        <Kbd>F3</Kbd>
                        <Kbd>F4</Kbd>
                        <Kbd>F5</Kbd>
                        <Kbd>F6</Kbd>
                        <Kbd>F7</Kbd>
                        <Kbd>F8</Kbd>
                        <Kbd>F9</Kbd>
                        <Kbd>F10</Kbd>
                        <Kbd>F11</Kbd>
                        <Kbd>F12</Kbd>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<Kbd>F1</Kbd>
<Kbd>F2</Kbd>
...
<Kbd>F12</Kbd>`}
                </CodeBlock>
            </div>
        ),
    },
]

/**
 * Render all examples for the component page
 */
export const KbdExamples = () => (
    <div class='space-y-12'>
        {examples.map((example) => (
            <section key={example.title} class='space-y-4'>
                <h2 class='font-pixel text-sm text-foreground'>
                    {example.title.toUpperCase()}
                </h2>
                {example.render()}
            </section>
        ))}
    </div>
)
