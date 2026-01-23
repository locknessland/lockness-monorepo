/**
 * @fileoverview Live examples for ThemeSwitch component
 */

import { Card, CardContent } from '../Card/mod.tsx'
import { CodeBlock } from '../CodeBlock/mod.tsx'
import { type PropDefinition, PropsTable } from '../PropsTable/mod.tsx'
import { ThemeSwitch, ThemeSwitchScript } from './mod.tsx'

const themeSwitchProps: PropDefinition[] = [
    {
        name: 'variant',
        type: 'classic | toggle | switch',
        default: 'classic',
        description: 'Visual variant of the theme switcher',
    },
    {
        name: 'size',
        type: 'sm | md | lg',
        default: 'md',
        description:
            'Size variant affecting padding, font size, and icon dimensions',
    },
    {
        name: 'darkLabel',
        type: 'string',
        default: 'Dark',
        description: 'Label for dark mode button (classic variant)',
    },
    {
        name: 'lightLabel',
        type: 'string',
        default: 'Light',
        description: 'Label for light mode button (classic variant)',
    },
    {
        name: 'sunIconClass',
        type: 'string',
        description: 'Custom CSS class for the sun icon',
    },
    {
        name: 'moonIconClass',
        type: 'string',
        description: 'Custom CSS class for the moon icon',
    },
    {
        name: 'class',
        type: 'string',
        description: 'Additional CSS classes for the container',
    },
]

export interface ExampleSection {
    title: string
    description?: string
    render: () => unknown
}

export const examples: ExampleSection[] = [
    {
        title: 'Classic Variant',
        description: 'Two buttons style, ideal for headers or footers.',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <ThemeSwitch variant='classic' />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<ThemeSwitch variant="classic" />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Classic with Custom Labels',
        description: 'Customize the button labels.',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <ThemeSwitch
                            variant='classic'
                            darkLabel='Moon'
                            lightLabel='Sun'
                        />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<ThemeSwitch variant="classic" darkLabel="Moon" lightLabel="Sun" />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Classic with Colored Icons',
        description: 'Add colors to the icons via props.',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <ThemeSwitch
                            variant='classic'
                            sunIconClass='text-amber-500'
                            moonIconClass='text-blue-500'
                        />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<ThemeSwitch variant="classic" sunIconClass="text-amber-500" moonIconClass="text-blue-500" />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Toggle Variant',
        description: 'Single button swapping icons. Compact and clean.',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 flex flex-wrap gap-4 items-center'>
                        <ThemeSwitch variant='toggle' />
                        <ThemeSwitch variant='toggle' size='lg' />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<ThemeSwitch variant="toggle" />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Toggle with Colored Icons',
        description: 'Add colors to the toggle icons.',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6 flex flex-wrap gap-4 items-center'>
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
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<ThemeSwitch variant="toggle" sunIconClass="text-amber-500" moonIconClass="text-indigo-500" />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Switch Variant',
        description: 'Checkbox-style toggle with Sun/Moon icons.',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <div class='flex items-center gap-6'>
                            <ThemeSwitch variant='switch' size='sm' />
                            <ThemeSwitch variant='switch' size='md' />
                            <ThemeSwitch variant='switch' size='lg' />
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<ThemeSwitch variant="switch" />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Switch with Colored Icons',
        description: 'Add colors to the switch icons via props.',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
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
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<ThemeSwitch variant="switch" sunIconClass="text-amber-500" moonIconClass="text-blue-500" />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Integration',
        description:
            'To ensure the theme is initialized on page load and all switchers are synchronized, add the ThemeSwitchScript to your main layout.',
        render: () => (
            <div class='space-y-4'>
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
                <ThemeSwitchScript />
            </div>
        ),
    },
    {
        title: 'Props',
        render: () => <PropsTable props={themeSwitchProps} />,
    },
]
