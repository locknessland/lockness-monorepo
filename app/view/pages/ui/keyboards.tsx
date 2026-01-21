import { Card, CardContent, CodeBlock, Kbd } from '@lockness/ui/components'
import { PageUiLayout } from '@view/layouts/ui_layout.tsx'

export const KeyboardsPage = () => {
    return (
        <PageUiLayout
            title='Keyboards - Lockness UI'
           
        >
            <div class='space-y-12 max-w-full'>
                <header>
                    <h1 class='font-pixel text-2xl text-foreground mb-2'>
                        KEYBOARD SHORTCUTS
                    </h1>
                    <p class='text-lg text-muted-foreground'>
                        Display keyboard shortcuts and key combinations with a
                        visually distinct style.
                    </p>
                </header>

                {/* Basic Keys */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        BASIC KEYS
                    </h2>
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
                </section>

                {/* Letter Keys */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        LETTER KEYS
                    </h2>
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
                </section>

                {/* Keyboard Combinations */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        KEYBOARD COMBINATIONS
                    </h2>
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
                </section>

                {/* Complex Shortcuts */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        COMPLEX SHORTCUTS
                    </h2>
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
                </section>

                {/* In Text */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        INLINE WITH TEXT
                    </h2>
                    <Card>
                        <CardContent class='p-6'>
                            <p class='text-muted-foreground'>
                                Press <Kbd>⌘</Kbd> + <Kbd>K</Kbd>{' '}
                                to open the command menu. Use <Kbd>↑</Kbd> and
                                {' '}
                                <Kbd>↓</Kbd> to navigate, then press{' '}
                                <Kbd>⏎</Kbd> to select.
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
                </section>

                {/* Function Keys */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        FUNCTION KEYS
                    </h2>
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
                </section>

                {/* CSS Variables */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        CSS VARIABLES
                    </h2>
                    <CodeBlock lang='css'>
                        {`@theme {
    /* Kbd customization */
    --kbd-padding-x: 0.375rem;
    --kbd-height: 1.25rem;
    --kbd-font-size: 0.625rem;
    --kbd-border-radius: calc(var(--radius) * 0.5);
}`}
                    </CodeBlock>
                </section>

                {/* Props Reference */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        PROPS REFERENCE
                    </h2>
                    <div class='overflow-x-auto'>
                        <table class='w-full text-sm'>
                            <thead>
                                <tr class='border-b border-border'>
                                    <th class='text-left py-3 px-4 font-medium'>
                                        Prop
                                    </th>
                                    <th class='text-left py-3 px-4 font-medium'>
                                        Type
                                    </th>
                                    <th class='text-left py-3 px-4 font-medium'>
                                        Default
                                    </th>
                                    <th class='text-left py-3 px-4 font-medium'>
                                        Description
                                    </th>
                                </tr>
                            </thead>
                            <tbody class='text-muted-foreground'>
                                <tr class='border-b border-border'>
                                    <td class='py-3 px-4 font-mono text-foreground'>
                                        children
                                    </td>
                                    <td class='py-3 px-4 font-mono'>
                                        ReactNode
                                    </td>
                                    <td class='py-3 px-4'>-</td>
                                    <td class='py-3 px-4'>
                                        Key label or symbol to display
                                    </td>
                                </tr>
                                <tr class='border-b border-border'>
                                    <td class='py-3 px-4 font-mono text-foreground'>
                                        class
                                    </td>
                                    <td class='py-3 px-4 font-mono'>string</td>
                                    <td class='py-3 px-4'>-</td>
                                    <td class='py-3 px-4'>
                                        Additional CSS classes
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* Key Symbols Reference */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        KEY SYMBOLS REFERENCE
                    </h2>
                    <div class='overflow-x-auto'>
                        <table class='w-full text-sm'>
                            <thead>
                                <tr class='border-b border-border'>
                                    <th class='text-left py-3 px-4 font-medium'>
                                        Symbol
                                    </th>
                                    <th class='text-left py-3 px-4 font-medium'>
                                        Key
                                    </th>
                                    <th class='text-left py-3 px-4 font-medium'>
                                        Unicode
                                    </th>
                                </tr>
                            </thead>
                            <tbody class='text-muted-foreground'>
                                <tr class='border-b border-border'>
                                    <td class='py-3 px-4'>
                                        <Kbd>⌘</Kbd>
                                    </td>
                                    <td class='py-3 px-4'>Command</td>
                                    <td class='py-3 px-4 font-mono'>U+2318</td>
                                </tr>
                                <tr class='border-b border-border'>
                                    <td class='py-3 px-4'>
                                        <Kbd>⇧</Kbd>
                                    </td>
                                    <td class='py-3 px-4'>Shift</td>
                                    <td class='py-3 px-4 font-mono'>U+21E7</td>
                                </tr>
                                <tr class='border-b border-border'>
                                    <td class='py-3 px-4'>
                                        <Kbd>⌥</Kbd>
                                    </td>
                                    <td class='py-3 px-4'>Option/Alt</td>
                                    <td class='py-3 px-4 font-mono'>U+2325</td>
                                </tr>
                                <tr class='border-b border-border'>
                                    <td class='py-3 px-4'>
                                        <Kbd>⌃</Kbd>
                                    </td>
                                    <td class='py-3 px-4'>Control</td>
                                    <td class='py-3 px-4 font-mono'>U+2303</td>
                                </tr>
                                <tr class='border-b border-border'>
                                    <td class='py-3 px-4'>
                                        <Kbd>⏎</Kbd>
                                    </td>
                                    <td class='py-3 px-4'>Return/Enter</td>
                                    <td class='py-3 px-4 font-mono'>U+23CE</td>
                                </tr>
                                <tr class='border-b border-border'>
                                    <td class='py-3 px-4'>
                                        <Kbd>⌫</Kbd>
                                    </td>
                                    <td class='py-3 px-4'>Delete/Backspace</td>
                                    <td class='py-3 px-4 font-mono'>U+232B</td>
                                </tr>
                                <tr class='border-b border-border'>
                                    <td class='py-3 px-4'>
                                        <Kbd>⇥</Kbd>
                                    </td>
                                    <td class='py-3 px-4'>Tab</td>
                                    <td class='py-3 px-4 font-mono'>U+21E5</td>
                                </tr>
                                <tr class='border-b border-border'>
                                    <td class='py-3 px-4'>
                                        <Kbd>⎋</Kbd>
                                    </td>
                                    <td class='py-3 px-4'>Escape</td>
                                    <td class='py-3 px-4 font-mono'>U+238B</td>
                                </tr>
                                <tr class='border-b border-border'>
                                    <td class='py-3 px-4'>
                                        <Kbd>↑</Kbd>
                                    </td>
                                    <td class='py-3 px-4'>Up Arrow</td>
                                    <td class='py-3 px-4 font-mono'>U+2191</td>
                                </tr>
                                <tr class='border-b border-border'>
                                    <td class='py-3 px-4'>
                                        <Kbd>↓</Kbd>
                                    </td>
                                    <td class='py-3 px-4'>Down Arrow</td>
                                    <td class='py-3 px-4 font-mono'>U+2193</td>
                                </tr>
                                <tr class='border-b border-border'>
                                    <td class='py-3 px-4'>
                                        <Kbd>←</Kbd>
                                    </td>
                                    <td class='py-3 px-4'>Left Arrow</td>
                                    <td class='py-3 px-4 font-mono'>U+2190</td>
                                </tr>
                                <tr class='border-b border-border'>
                                    <td class='py-3 px-4'>
                                        <Kbd>→</Kbd>
                                    </td>
                                    <td class='py-3 px-4'>Right Arrow</td>
                                    <td class='py-3 px-4 font-mono'>U+2192</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* Installation */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        INSTALLATION
                    </h2>
                    <CodeBlock lang='bash'>
                        {`deno run -A jsr:@lockness/ui add kbd`}
                    </CodeBlock>
                </section>
            </div>
        </PageUiLayout>
    )
}
