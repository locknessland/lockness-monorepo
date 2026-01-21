import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CodeBlock,
    SearchBar,
    SearchBarFilter,
    SearchBarGroup,
} from '@lockness/ui/components'
import { PageUiLayout } from '@view/layouts/ui_layout.tsx'

export const SearchBarPage = () => {
    return (
        <PageUiLayout title='Search Bar - Lockness UI'>
            <div class='space-y-8 max-w-full'>
                <header>
                    <h1 class='font-pixel text-2xl text-foreground mb-2'>
                        SEARCH BAR
                    </h1>
                    <p class='text-lg text-muted-foreground'>
                        Customizable search input with variants, sizes, and
                        Unpoly integration
                    </p>
                </header>

                {/* Installation */}
                <section class='space-y-4'>
                    <Card>
                        <CardHeader>
                            <CardTitle>Installation</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <CodeBlock lang='bash'>
                                {`deno run -A jsr:@lockness/ui add search-bar`}
                            </CodeBlock>
                        </CardContent>
                    </Card>
                </section>

                {/* Basic Usage */}
                <section class='space-y-4'>
                    <Card>
                        <CardHeader>
                            <CardTitle>Basic Usage</CardTitle>
                        </CardHeader>
                        <CardContent class='space-y-4'>
                            <div class='flex flex-wrap gap-4'>
                                <SearchBar placeholder='Search...' />
                            </div>
                            <CodeBlock lang='tsx'>
                                {`<SearchBar placeholder="Search..." />`}
                            </CodeBlock>
                        </CardContent>
                    </Card>
                </section>

                {/* Variants */}
                <section class='space-y-4'>
                    <Card>
                        <CardHeader>
                            <CardTitle>Variants</CardTitle>
                        </CardHeader>
                        <CardContent class='space-y-4'>
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
                            <CodeBlock lang='tsx'>
                                {`<SearchBar variant="default" placeholder="Default variant" />
<SearchBar variant="ghost" placeholder="Ghost variant" />
<SearchBar variant="outline" placeholder="Outline variant" />
<SearchBar variant="filled" placeholder="Filled variant" />`}
                            </CodeBlock>
                        </CardContent>
                    </Card>
                </section>

                {/* Sizes */}
                <section class='space-y-4'>
                    <Card>
                        <CardHeader>
                            <CardTitle>Sizes</CardTitle>
                        </CardHeader>
                        <CardContent class='space-y-4'>
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
                            <CodeBlock lang='tsx'>
                                {`<SearchBar size="sm" placeholder="Small" />
<SearchBar size="md" placeholder="Medium (default)" />
<SearchBar size="lg" placeholder="Large" />
<SearchBar size="xl" placeholder="Extra Large" />`}
                            </CodeBlock>
                        </CardContent>
                    </Card>
                </section>

                {/* Icon Position */}
                <section class='space-y-4'>
                    <Card>
                        <CardHeader>
                            <CardTitle>Icon Position</CardTitle>
                        </CardHeader>
                        <CardContent class='space-y-4'>
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
                            <CodeBlock lang='tsx'>
                                {`<SearchBar iconPosition="left" placeholder="Icon on the left" />
<SearchBar iconPosition="right" placeholder="Icon on the right" />
<SearchBar showIcon={false} placeholder="No icon" />`}
                            </CodeBlock>
                        </CardContent>
                    </Card>
                </section>

                {/* With Clear Button */}
                <section class='space-y-4'>
                    <Card>
                        <CardHeader>
                            <CardTitle>Clear Button</CardTitle>
                        </CardHeader>
                        <CardContent class='space-y-4'>
                            <p class='text-sm text-muted-foreground'>
                                Add a clear button to reset the search input.
                            </p>
                            <div class='flex flex-col gap-4'>
                                <SearchBar
                                    showClear
                                    placeholder='Type and click X to clear...'
                                />
                            </div>
                            <CodeBlock lang='tsx'>
                                {`<SearchBar showClear placeholder="Type and click X to clear..." />`}
                            </CodeBlock>
                        </CardContent>
                    </Card>
                </section>

                {/* Keyboard Shortcut */}
                <section class='space-y-4'>
                    <Card>
                        <CardHeader>
                            <CardTitle>Keyboard Shortcut</CardTitle>
                        </CardHeader>
                        <CardContent class='space-y-4'>
                            <p class='text-sm text-muted-foreground'>
                                Display a keyboard shortcut badge inside the
                                search bar.
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
                            <CodeBlock lang='tsx'>
                                {`<SearchBar shortcut="⌘K" showShortcut placeholder="Quick search..." />
<SearchBar shortcut="Ctrl+K" showShortcut placeholder="Quick search (Windows)..." />`}
                            </CodeBlock>
                        </CardContent>
                    </Card>
                </section>

                {/* Loading State */}
                <section class='space-y-4'>
                    <Card>
                        <CardHeader>
                            <CardTitle>Loading State</CardTitle>
                        </CardHeader>
                        <CardContent class='space-y-4'>
                            <p class='text-sm text-muted-foreground'>
                                Show a spinner when searching.
                            </p>
                            <div class='flex flex-col gap-4'>
                                <SearchBar
                                    loading
                                    placeholder='Searching...'
                                />
                                <SearchBar
                                    loading
                                    iconPosition='right'
                                    placeholder='Searching (icon right)...'
                                />
                            </div>
                            <CodeBlock lang='tsx'>
                                {`<SearchBar loading placeholder="Searching..." />
<SearchBar loading iconPosition="right" placeholder="Searching..." />`}
                            </CodeBlock>
                        </CardContent>
                    </Card>
                </section>

                {/* Full Width */}
                <section class='space-y-4'>
                    <Card>
                        <CardHeader>
                            <CardTitle>Full Width</CardTitle>
                        </CardHeader>
                        <CardContent class='space-y-4'>
                            <SearchBar
                                fullWidth
                                placeholder='Full width search...'
                            />
                            <CodeBlock lang='tsx'>
                                {`<SearchBar fullWidth placeholder="Full width search..." />`}
                            </CodeBlock>
                        </CardContent>
                    </Card>
                </section>

                {/* Disabled */}
                <section class='space-y-4'>
                    <Card>
                        <CardHeader>
                            <CardTitle>Disabled</CardTitle>
                        </CardHeader>
                        <CardContent class='space-y-4'>
                            <SearchBar
                                disabled
                                placeholder='Disabled search...'
                            />
                            <CodeBlock lang='tsx'>
                                {`<SearchBar disabled placeholder="Disabled search..." />`}
                            </CodeBlock>
                        </CardContent>
                    </Card>
                </section>

                {/* SearchBarGroup with Filters */}
                <section class='space-y-4'>
                    <Card>
                        <CardHeader>
                            <CardTitle>Search with Filters</CardTitle>
                        </CardHeader>
                        <CardContent class='space-y-4'>
                            <p class='text-sm text-muted-foreground'>
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
                                    <option value='electronics'>
                                        Electronics
                                    </option>
                                    <option value='clothing'>Clothing</option>
                                    <option value='books'>Books</option>
                                </SearchBarFilter>
                            </SearchBarGroup>
                            <CodeBlock lang='tsx'>
                                {`import {
    SearchBar,
    SearchBarGroup,
    SearchBarFilter,
} from '@view/components/ui/SearchBar.tsx'

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
                        </CardContent>
                    </Card>
                </section>

                {/* Unpoly Integration */}
                <section class='space-y-4'>
                    <Card>
                        <CardHeader>
                            <CardTitle>Unpoly Integration</CardTitle>
                        </CardHeader>
                        <CardContent class='space-y-4'>
                            <p class='text-sm text-muted-foreground'>
                                Use Unpoly attributes for real-time AJAX search
                                with debouncing.
                            </p>
                            <CodeBlock lang='tsx'>
                                {`<form up-submit up-target=".search-results">
    <SearchBar
        name="q"
        up-autosubmit
        up-delay="300"
        placeholder="Search with debounce..."
    />
</form>

<div class="search-results">
    {/* Results will be updated here */}
</div>`}
                            </CodeBlock>
                            <p class='text-sm text-muted-foreground mt-4'>
                                <strong>Attributes:</strong>
                            </p>
                            <ul class='text-sm text-muted-foreground list-disc list-inside space-y-1'>
                                <li>
                                    <code>up-autosubmit</code>{' '}
                                    - Automatically submit on input change
                                </li>
                                <li>
                                    <code>up-delay="300"</code>{' '}
                                    - Debounce for 300ms
                                </li>
                                <li>
                                    <code>up-target=".results"</code>{' '}
                                    - Replace target element with response
                                </li>
                            </ul>
                        </CardContent>
                    </Card>
                </section>

                {/* Complete Example */}
                <section class='space-y-4'>
                    <Card>
                        <CardHeader>
                            <CardTitle>Complete Example</CardTitle>
                        </CardHeader>
                        <CardContent class='space-y-4'>
                            <p class='text-sm text-muted-foreground'>
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
                        </CardContent>
                    </Card>
                </section>

                {/* Props Reference */}
                <section class='space-y-4'>
                    <Card>
                        <CardHeader>
                            <CardTitle>Props Reference</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div class='overflow-x-auto'>
                                <table class='w-full text-sm'>
                                    <thead>
                                        <tr class='border-b border-border'>
                                            <th class='text-left py-2 pr-4 font-medium'>
                                                Prop
                                            </th>
                                            <th class='text-left py-2 pr-4 font-medium'>
                                                Type
                                            </th>
                                            <th class='text-left py-2 pr-4 font-medium'>
                                                Default
                                            </th>
                                            <th class='text-left py-2 font-medium'>
                                                Description
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody class='text-muted-foreground'>
                                        <tr class='border-b border-border/50'>
                                            <td class='py-2 pr-4'>
                                                <code>variant</code>
                                            </td>
                                            <td class='py-2 pr-4'>
                                                'default' | 'ghost' | 'outline'
                                                | 'filled'
                                            </td>
                                            <td class='py-2 pr-4'>'default'</td>
                                            <td class='py-2'>
                                                Visual style variant
                                            </td>
                                        </tr>
                                        <tr class='border-b border-border/50'>
                                            <td class='py-2 pr-4'>
                                                <code>size</code>
                                            </td>
                                            <td class='py-2 pr-4'>
                                                'sm' | 'md' | 'lg' | 'xl'
                                            </td>
                                            <td class='py-2 pr-4'>'md'</td>
                                            <td class='py-2'>Component size</td>
                                        </tr>
                                        <tr class='border-b border-border/50'>
                                            <td class='py-2 pr-4'>
                                                <code>placeholder</code>
                                            </td>
                                            <td class='py-2 pr-4'>string</td>
                                            <td class='py-2 pr-4'>
                                                'Search...'
                                            </td>
                                            <td class='py-2'>
                                                Placeholder text
                                            </td>
                                        </tr>
                                        <tr class='border-b border-border/50'>
                                            <td class='py-2 pr-4'>
                                                <code>showIcon</code>
                                            </td>
                                            <td class='py-2 pr-4'>boolean</td>
                                            <td class='py-2 pr-4'>true</td>
                                            <td class='py-2'>
                                                Show search icon
                                            </td>
                                        </tr>
                                        <tr class='border-b border-border/50'>
                                            <td class='py-2 pr-4'>
                                                <code>iconPosition</code>
                                            </td>
                                            <td class='py-2 pr-4'>
                                                'left' | 'right'
                                            </td>
                                            <td class='py-2 pr-4'>'left'</td>
                                            <td class='py-2'>Icon position</td>
                                        </tr>
                                        <tr class='border-b border-border/50'>
                                            <td class='py-2 pr-4'>
                                                <code>showClear</code>
                                            </td>
                                            <td class='py-2 pr-4'>boolean</td>
                                            <td class='py-2 pr-4'>false</td>
                                            <td class='py-2'>
                                                Show clear button
                                            </td>
                                        </tr>
                                        <tr class='border-b border-border/50'>
                                            <td class='py-2 pr-4'>
                                                <code>shortcut</code>
                                            </td>
                                            <td class='py-2 pr-4'>string</td>
                                            <td class='py-2 pr-4'>-</td>
                                            <td class='py-2'>
                                                Keyboard shortcut to display
                                            </td>
                                        </tr>
                                        <tr class='border-b border-border/50'>
                                            <td class='py-2 pr-4'>
                                                <code>showShortcut</code>
                                            </td>
                                            <td class='py-2 pr-4'>boolean</td>
                                            <td class='py-2 pr-4'>false</td>
                                            <td class='py-2'>
                                                Show shortcut badge
                                            </td>
                                        </tr>
                                        <tr class='border-b border-border/50'>
                                            <td class='py-2 pr-4'>
                                                <code>loading</code>
                                            </td>
                                            <td class='py-2 pr-4'>boolean</td>
                                            <td class='py-2 pr-4'>false</td>
                                            <td class='py-2'>Loading state</td>
                                        </tr>
                                        <tr class='border-b border-border/50'>
                                            <td class='py-2 pr-4'>
                                                <code>disabled</code>
                                            </td>
                                            <td class='py-2 pr-4'>boolean</td>
                                            <td class='py-2 pr-4'>false</td>
                                            <td class='py-2'>Disabled state</td>
                                        </tr>
                                        <tr>
                                            <td class='py-2 pr-4'>
                                                <code>fullWidth</code>
                                            </td>
                                            <td class='py-2 pr-4'>boolean</td>
                                            <td class='py-2 pr-4'>false</td>
                                            <td class='py-2'>
                                                Full width mode
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                </section>
            </div>
        </PageUiLayout>
    )
}
