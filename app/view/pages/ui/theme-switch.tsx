import { ThemeSwitch, ThemeSwitchScript } from '@lockness/ui/components'
import { PageUiLayout } from '@view/layouts/ui_layout.tsx'
import { CodeBlock } from '@lockness/ui/components'

export const ThemeSwitchPage = () => {
    return (
        <PageUiLayout title='Theme Switch - Lockness UI' currentPath='/ui/theme-switch'>
            <div class='space-y-8 max-w-full'>
                <header>
                    <h1 class='font-pixel text-2xl text-foreground mb-2'>
                        THEME SWITCH
                    </h1>
                    <p class='text-lg text-muted-foreground'>
                        A versatile theme switcher with multiple visual styles
                        and native JavaScript logic.
                    </p>
                </header>

                {/* Classic Variant */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        CLASSIC VARIANT
                    </h2>
                    <p class='text-sm text-muted-foreground'>
                        Two buttons style, ideal for headers or footers.
                    </p>
                    <div class='flex flex-wrap gap-4 items-center py-6 px-6 bg-card rounded-lg'>
                        <ThemeSwitch variant='classic' />
                    </div>
                    <CodeBlock lang='tsx'>
                        {`<ThemeSwitch variant="classic" />`}
                    </CodeBlock>
                </section>

                {/* Classic Variant with custom labels */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        CLASSIC WITH CUSTOM LABELS
                    </h2>
                    <p class='text-sm text-muted-foreground'>
                        Customize the button labels.
                    </p>
                    <div class='flex flex-wrap gap-4 items-center py-6 px-6 bg-card rounded-lg'>
                        <ThemeSwitch
                            variant='classic'
                            darkLabel='Moon'
                            lightLabel='Sun'
                        />
                    </div>
                    <CodeBlock lang='tsx'>
                        {`<ThemeSwitch variant="classic" darkLabel="Moon" lightLabel="Sun" />`}
                    </CodeBlock>
                </section>

                {/* Classic Variant with colored icons */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        CLASSIC WITH COLORED ICONS
                    </h2>
                    <p class='text-sm text-muted-foreground'>
                        Add colors to the icons via props.
                    </p>
                    <div class='flex flex-wrap gap-4 items-center py-6 px-6 bg-card rounded-lg'>
                        <ThemeSwitch
                            variant='classic'
                            sunIconClass='text-amber-500'
                            moonIconClass='text-blue-500'
                        />
                    </div>
                    <CodeBlock lang='tsx'>
                        {`<ThemeSwitch variant="classic" sunIconClass="text-amber-500" moonIconClass="text-blue-500" />`}
                    </CodeBlock>
                </section>

                {/* Toggle Variant */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        TOGGLE VARIANT
                    </h2>
                    <p class='text-sm text-muted-foreground'>
                        Single button swapping icons. Compact and clean.
                    </p>
                    <div class='flex flex-wrap gap-4 items-center py-6 px-6 bg-card rounded-lg'>
                        <ThemeSwitch variant='toggle' />
                        <ThemeSwitch variant='toggle' size='lg' />
                    </div>
                    <CodeBlock lang='tsx'>
                        {`<ThemeSwitch variant="toggle" />`}
                    </CodeBlock>
                </section>

                {/* Toggle Variant with colored icons */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        TOGGLE WITH COLORED ICONS
                    </h2>
                    <p class='text-sm text-muted-foreground'>
                        Add colors to the toggle icons.
                    </p>
                    <div class='flex flex-wrap gap-4 items-center py-6 px-6 bg-card rounded-lg'>
                        <ThemeSwitch
                            variant='toggle'
                            sunIconClass='text-amber-500'
                            moonIconClass='text-indigo-500'
                        />
                        <ThemeSwitch
                            variant='toggle'
                            size='lg'
                            sunIconClass='text-orange-400'
                            moonIconClass='text-purple-500'
                        />
                    </div>
                    <CodeBlock lang='tsx'>
                        {`<ThemeSwitch variant="toggle" sunIconClass="text-amber-500" moonIconClass="text-indigo-500" />`}
                    </CodeBlock>
                </section>

                {/* Switch Variant */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        SWITCH VARIANT
                    </h2>
                    <p class='text-sm text-muted-foreground'>
                        Checkbox-style toggle with Sun/Moon icons.
                    </p>
                    <div class='flex flex-wrap gap-4 items-center py-6 px-6 bg-card rounded-lg'>
                        <div class='flex items-center gap-6'>
                            <ThemeSwitch variant='switch' size='sm' />
                            <ThemeSwitch variant='switch' size='md' />
                            <ThemeSwitch variant='switch' size='lg' />
                        </div>
                    </div>
                    <CodeBlock lang='tsx'>
                        {`<ThemeSwitch variant="switch" />`}
                    </CodeBlock>
                </section>

                {/* Switch with colored icons */}
                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        SWITCH WITH COLORED ICONS
                    </h2>
                    <p class='text-sm text-muted-foreground'>
                        Add colors to the switch icons via props.
                    </p>
                    <div class='flex flex-wrap gap-4 items-center py-6 px-6 bg-card rounded-lg'>
                        <div class='flex items-center gap-6'>
                            <ThemeSwitch
                                variant='switch'
                                sunIconClass='text-amber-500'
                                moonIconClass='text-blue-500'
                            />
                            <ThemeSwitch
                                variant='switch'
                                size='lg'
                                sunIconClass='text-orange-400'
                                moonIconClass='text-indigo-400'
                            />
                        </div>
                    </div>
                    <CodeBlock lang='tsx'>
                        {`<ThemeSwitch variant="switch" sunIconClass="text-amber-500" moonIconClass="text-blue-500" />`}
                    </CodeBlock>
                </section>

                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>PROPS</h2>
                    <div class='overflow-x-auto'>
                        <table class='w-full text-sm'>
                            <thead>
                                <tr class='border-b border-border'>
                                    <th class='text-left py-2 px-3 text-foreground'>
                                        Prop
                                    </th>
                                    <th class='text-left py-2 px-3 text-foreground'>
                                        Type
                                    </th>
                                    <th class='text-left py-2 px-3 text-foreground'>
                                        Default
                                    </th>
                                    <th class='text-left py-2 px-3 text-foreground'>
                                        Description
                                    </th>
                                </tr>
                            </thead>
                            <tbody class='text-muted-foreground'>
                                <tr class='border-b border-border/50'>
                                    <td class='py-2 px-3'>
                                        <code>variant</code>
                                    </td>
                                    <td class='py-2 px-3'>
                                        <code>
                                            'classic' | 'toggle' | 'switch'
                                        </code>
                                    </td>
                                    <td class='py-2 px-3'>
                                        <code>'classic'</code>
                                    </td>
                                    <td class='py-2 px-3'>
                                        Visual style of the switcher
                                    </td>
                                </tr>
                                <tr class='border-b border-border/50'>
                                    <td class='py-2 px-3'>
                                        <code>size</code>
                                    </td>
                                    <td class='py-2 px-3'>
                                        <code>'sm' | 'md' | 'lg'</code>
                                    </td>
                                    <td class='py-2 px-3'>
                                        <code>'md'</code>
                                    </td>
                                    <td class='py-2 px-3'>
                                        Size variant for buttons and icons
                                    </td>
                                </tr>
                                <tr class='border-b border-border/50'>
                                    <td class='py-2 px-3'>
                                        <code>class</code>
                                    </td>
                                    <td class='py-2 px-3'>
                                        <code>string</code>
                                    </td>
                                    <td class='py-2 px-3'>-</td>
                                    <td class='py-2 px-3'>
                                        Additional CSS classes
                                    </td>
                                </tr>
                                <tr class='border-b border-border/50'>
                                    <td class='py-2 px-3'>
                                        <code>darkLabel</code>
                                    </td>
                                    <td class='py-2 px-3'>
                                        <code>string</code>
                                    </td>
                                    <td class='py-2 px-3'>
                                        <code>'Dark'</code>
                                    </td>
                                    <td class='py-2 px-3'>
                                        Label shown in light mode (classic
                                        variant)
                                    </td>
                                </tr>
                                <tr class='border-b border-border/50'>
                                    <td class='py-2 px-3'>
                                        <code>lightLabel</code>
                                    </td>
                                    <td class='py-2 px-3'>
                                        <code>string</code>
                                    </td>
                                    <td class='py-2 px-3'>
                                        <code>'Light'</code>
                                    </td>
                                    <td class='py-2 px-3'>
                                        Label shown in dark mode (classic
                                        variant)
                                    </td>
                                </tr>
                                <tr class='border-b border-border/50'>
                                    <td class='py-2 px-3'>
                                        <code>sunIconClass</code>
                                    </td>
                                    <td class='py-2 px-3'>
                                        <code>string</code>
                                    </td>
                                    <td class='py-2 px-3'>-</td>
                                    <td class='py-2 px-3'>
                                        Custom class for the sun icon (e.g.
                                        color)
                                    </td>
                                </tr>
                                <tr class='border-b border-border/50'>
                                    <td class='py-2 px-3'>
                                        <code>moonIconClass</code>
                                    </td>
                                    <td class='py-2 px-3'>
                                        <code>string</code>
                                    </td>
                                    <td class='py-2 px-3'>-</td>
                                    <td class='py-2 px-3'>
                                        Custom class for the moon icon (e.g.
                                        color)
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </section>

                <section class='space-y-4'>
                    <h2 class='font-pixel text-sm text-foreground'>
                        INTEGRATION
                    </h2>
                    <p class='text-sm text-muted-foreground'>
                        To ensure the theme is initialized on page load and all
                        switchers are synchronized, add the{' '}
                        <code>ThemeSwitchScript</code> to your main layout.
                    </p>
                    <CodeBlock lang='tsx'>
                        {`import { ThemeSwitchScript } from '@lockness/ui/components'

export const RootLayout = ({ children }) => (
    <html>
        <head>...</head>
        <body>
            {children}
            <ThemeSwitchScript />
        </body>
    </html>
)`}
                    </CodeBlock>
                </section>
            </div>
            {/* Component logic script for the demo page */}
            <ThemeSwitchScript />
        </PageUiLayout>
    )
}
