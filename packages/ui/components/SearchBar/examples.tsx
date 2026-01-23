/**
 * @fileoverview Live examples for SearchBar component
 */

import { Card, CardContent } from '../Card/mod.tsx'
import { CodeBlock } from '../CodeBlock/mod.tsx'
import { type PropDefinition, PropsTable } from '../PropsTable/mod.tsx'
import { SearchBar, SearchBarFilter, SearchBarGroup } from './mod.tsx'

const searchBarProps: PropDefinition[] = [
    {
        name: 'variant',
        type: 'default | ghost | outline | filled',
        default: 'default',
        description: 'Visual style variant',
    },
    {
        name: 'size',
        type: 'sm | md | lg | xl',
        default: 'md',
        description: 'Component size',
    },
    {
        name: 'placeholder',
        type: 'string',
        default: 'Search...',
        description: 'Placeholder text',
    },
    { name: 'name', type: 'string', description: 'Input name attribute' },
    { name: 'value', type: 'string', description: 'Input value' },
    {
        name: 'showIcon',
        type: 'boolean',
        default: 'true',
        description: 'Show search icon',
    },
    {
        name: 'iconPosition',
        type: 'left | right',
        default: 'left',
        description: 'Icon position',
    },
    {
        name: 'showClear',
        type: 'boolean',
        default: 'false',
        description: 'Show clear button when input has value',
    },
    {
        name: 'shortcut',
        type: 'string',
        description: "Keyboard shortcut to display (e.g., '⌘K')",
    },
    {
        name: 'showShortcut',
        type: 'boolean',
        default: 'false',
        description: 'Show keyboard shortcut badge',
    },
    {
        name: 'loading',
        type: 'boolean',
        default: 'false',
        description: 'Loading state',
    },
    {
        name: 'disabled',
        type: 'boolean',
        default: 'false',
        description: 'Disable input',
    },
    {
        name: 'fullWidth',
        type: 'boolean',
        default: 'false',
        description: 'Full width mode',
    },
    {
        name: 'class',
        type: 'string',
        description: 'Additional CSS class names',
    },
]

export interface ExampleSection {
    title: string
    render: () => unknown
}

export const examples: ExampleSection[] = [
    {
        title: 'Basic Usage',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <div class='flex flex-wrap gap-4'>
                            <SearchBar placeholder='Search...' />
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<SearchBar placeholder="Search..." />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Variants',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <div class='flex flex-col gap-6'>
                            <div>
                                <label class='text-sm font-medium text-muted-foreground mb-2 block'>
                                    Default
                                </label>
                                <SearchBar
                                    variant='default'
                                    placeholder='Default variant'
                                />
                            </div>
                            <div>
                                <label class='text-sm font-medium text-muted-foreground mb-2 block'>
                                    Ghost
                                </label>
                                <SearchBar
                                    variant='ghost'
                                    placeholder='Ghost variant'
                                />
                            </div>
                            <div>
                                <label class='text-sm font-medium text-muted-foreground mb-2 block'>
                                    Outline
                                </label>
                                <SearchBar
                                    variant='outline'
                                    placeholder='Outline variant'
                                />
                            </div>
                            <div>
                                <label class='text-sm font-medium text-muted-foreground mb-2 block'>
                                    Filled
                                </label>
                                <SearchBar
                                    variant='filled'
                                    placeholder='Filled variant'
                                />
                            </div>
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<SearchBar variant="default" placeholder="Default variant" />
<SearchBar variant="ghost" placeholder="Ghost variant" />
<SearchBar variant="outline" placeholder="Outline variant" />
<SearchBar variant="filled" placeholder="Filled variant" />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Sizes',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <div class='flex flex-col gap-4'>
                            <SearchBar size='sm' placeholder='Small (sm)' />
                            <SearchBar
                                size='md'
                                placeholder='Medium (md) - default'
                            />
                            <SearchBar size='lg' placeholder='Large (lg)' />
                            <SearchBar
                                size='xl'
                                placeholder='Extra Large (xl)'
                            />
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<SearchBar size="sm" placeholder="Small" />
<SearchBar size="md" placeholder="Medium (default)" />
<SearchBar size="lg" placeholder="Large" />
<SearchBar size="xl" placeholder="Extra Large" />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Icon Position',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <div class='flex flex-col gap-4'>
                            <SearchBar
                                iconPosition='left'
                                placeholder='Icon on the left (default)'
                            />
                            <SearchBar
                                iconPosition='right'
                                placeholder='Icon on the right'
                            />
                            <SearchBar
                                showIcon={false}
                                placeholder='No icon'
                            />
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<SearchBar iconPosition="left" placeholder="Icon on the left" />
<SearchBar iconPosition="right" placeholder="Icon on the right" />
<SearchBar showIcon={false} placeholder="No icon" />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Clear Button',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <p class='text-sm text-muted-foreground mb-4'>
                            Add a clear button to reset the search input.
                        </p>
                        <div class='flex flex-col gap-4'>
                            <SearchBar
                                showClear
                                placeholder='Type and click X to clear...'
                            />
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<SearchBar showClear placeholder="Type and click X to clear..." />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Keyboard Shortcut',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <p class='text-sm text-muted-foreground mb-4'>
                            Display a keyboard shortcut badge inside the search
                            bar.
                        </p>
                        <div class='flex flex-col gap-4'>
                            <SearchBar
                                shortcut='⌘K'
                                showShortcut
                                placeholder='Quick search...'
                            />
                            <SearchBar
                                shortcut='Ctrl+K'
                                showShortcut
                                placeholder='Quick search (Windows)...'
                            />
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<SearchBar shortcut="⌘K" showShortcut placeholder="Quick search..." />
<SearchBar shortcut="Ctrl+K" showShortcut placeholder="Quick search (Windows)..." />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Loading State',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <p class='text-sm text-muted-foreground mb-4'>
                            Show a spinner when searching.
                        </p>
                        <div class='flex flex-col gap-4'>
                            <SearchBar loading placeholder='Searching...' />
                            <SearchBar
                                loading
                                iconPosition='right'
                                placeholder='Searching (icon right)...'
                            />
                        </div>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<SearchBar loading placeholder="Searching..." />
<SearchBar loading iconPosition="right" placeholder="Searching..." />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Full Width',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <SearchBar
                            fullWidth
                            placeholder='Full width search...'
                        />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<SearchBar fullWidth placeholder="Full width search..." />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Disabled',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <SearchBar disabled placeholder='Disabled search...' />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<SearchBar disabled placeholder="Disabled search..." />`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Search with Filters',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <p class='text-sm text-muted-foreground mb-4'>
                            Combine SearchBar with SearchBarFilter in a
                            SearchBarGroup for filtering.
                        </p>
                        <SearchBarGroup>
                            <SearchBar
                                placeholder='Search products...'
                                variant='ghost'
                                showIcon={false}
                            />
                            <SearchBarFilter name='category'>
                                <option value='all'>All Categories</option>
                                <option value='electronics'>Electronics</option>
                                <option value='clothing'>Clothing</option>
                                <option value='books'>Books</option>
                            </SearchBarFilter>
                        </SearchBarGroup>
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`import {
    SearchBar,
    SearchBarGroup,
    SearchBarFilter,
} from '@lockness/ui/components'

<SearchBarGroup>
    <SearchBar
        placeholder="Search products..."
        variant="ghost"
        showIcon={false}
    />
    <SearchBarFilter name="category">
        <option value="all">All Categories</option>
        <option value="electronics">Electronics</option>
        <option value="clothing">Clothing</option>
        <option value="books">Books</option>
    </SearchBarFilter>
</SearchBarGroup>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Complete Example',
        render: () => (
            <div class='space-y-4'>
                <Card>
                    <CardContent class='p-6'>
                        <p class='text-sm text-muted-foreground mb-4'>
                            A search bar with all features combined.
                        </p>
                        <SearchBar
                            variant='filled'
                            size='lg'
                            shortcut='⌘K'
                            showShortcut
                            showClear
                            fullWidth
                            placeholder='Search anything...'
                        />
                    </CardContent>
                </Card>
                <CodeBlock lang='tsx'>
                    {`<SearchBar
    variant="filled"
    size="lg"
    shortcut="⌘K"
    showShortcut
    showClear
    fullWidth
    placeholder="Search anything..."
/>`}
                </CodeBlock>
            </div>
        ),
    },
    {
        title: 'Props',
        render: () => <PropsTable props={searchBarProps} />,
    },
]
