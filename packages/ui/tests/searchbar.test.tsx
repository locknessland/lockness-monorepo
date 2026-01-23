import { assertStringIncludes } from '@std/assert'
import {
    SearchBar,
    SearchBarFilter,
    SearchBarGroup,
} from '../components/SearchBar/mod.tsx'

/**
 * Helper to render a component to string
 * Since Hono JSX uses precompile mode, we need to convert the result to string
 */
function renderToString(component: unknown): string {
    // Hono JSX returns a Promise or HtmlEscapedString
    const result = component as unknown as { toString: () => string }
    return result.toString()
}

Deno.test('SearchBar component', async (t) => {
    await t.step('renders with default props', () => {
        const html = renderToString(<SearchBar />)
        assertStringIncludes(html, 'type="search"')
        assertStringIncludes(html, 'placeholder="Search..."')
        assertStringIncludes(html, 'autocomplete="off"')
    })

    await t.step('renders with custom placeholder', () => {
        const html = renderToString(
            <SearchBar placeholder='Find users...' />,
        )
        assertStringIncludes(html, 'placeholder="Find users..."')
    })

    await t.step('renders default variant', () => {
        const html = renderToString(<SearchBar variant='default' />)
        assertStringIncludes(html, 'border-(--input)')
        assertStringIncludes(html, 'bg-(--background)')
    })

    await t.step('renders ghost variant', () => {
        const html = renderToString(<SearchBar variant='ghost' />)
        assertStringIncludes(html, 'bg-transparent')
    })

    await t.step('renders outline variant', () => {
        const html = renderToString(<SearchBar variant='outline' />)
        assertStringIncludes(html, 'border-2')
        assertStringIncludes(html, 'border-(--border)')
    })

    await t.step('renders filled variant', () => {
        const html = renderToString(<SearchBar variant='filled' />)
        assertStringIncludes(html, 'bg-(--muted)')
    })

    await t.step('renders small size', () => {
        const html = renderToString(<SearchBar size='sm' />)
        assertStringIncludes(html, 'h-8')
        assertStringIncludes(html, 'text-xs')
    })

    await t.step('renders medium size (default)', () => {
        const html = renderToString(<SearchBar size='md' />)
        assertStringIncludes(html, 'h-10')
        assertStringIncludes(html, 'text-sm')
    })

    await t.step('renders large size', () => {
        const html = renderToString(<SearchBar size='lg' />)
        assertStringIncludes(html, 'h-12')
        assertStringIncludes(html, 'text-base')
    })

    await t.step('renders extra large size', () => {
        const html = renderToString(<SearchBar size='xl' />)
        assertStringIncludes(html, 'h-14')
        assertStringIncludes(html, 'text-lg')
    })

    await t.step('renders search icon by default', () => {
        const html = renderToString(<SearchBar />)
        // Check for SVG path that represents the search icon
        assertStringIncludes(html, '<circle')
    })

    await t.step('hides icon when showIcon is false', () => {
        const html = renderToString(<SearchBar showIcon={false} />)
        // Should not have the icon span
        const hasIconSpan = html.includes(
            'flex-shrink-0 text-(--muted-foreground)',
        )
        if (hasIconSpan) {
            throw new Error('Icon span should not be present')
        }
    })

    await t.step('renders icon on right when iconPosition is right', () => {
        const html = renderToString(<SearchBar iconPosition='right' />)
        assertStringIncludes(html, 'type="search"')
        // Icon should still be present
        assertStringIncludes(html, '<circle')
    })

    await t.step('renders clear button', () => {
        const html = renderToString(<SearchBar showClear />)
        assertStringIncludes(html, 'Clear search')
        assertStringIncludes(html, 'aria-label="Clear search"')
    })

    await t.step('renders keyboard shortcut badge', () => {
        const html = renderToString(
            <SearchBar shortcut='⌘K' showShortcut />,
        )
        assertStringIncludes(html, '⌘K')
        assertStringIncludes(html, '<kbd')
        assertStringIncludes(html, 'font-mono')
    })

    await t.step('renders loading state with left icon', () => {
        const html = renderToString(<SearchBar loading />)
        assertStringIncludes(html, 'animate-spin')
    })

    await t.step('renders loading state with right icon', () => {
        const html = renderToString(
            <SearchBar loading iconPosition='right' />,
        )
        assertStringIncludes(html, 'animate-spin')
    })

    await t.step('handles disabled state', () => {
        const html = renderToString(<SearchBar disabled />)
        assertStringIncludes(html, 'disabled')
        assertStringIncludes(html, 'opacity-50')
    })

    await t.step('renders full width', () => {
        const html = renderToString(<SearchBar fullWidth />)
        assertStringIncludes(html, 'w-full')
    })

    await t.step('forwards custom class names', () => {
        const html = renderToString(<SearchBar class='custom-input' />)
        assertStringIncludes(html, 'custom-input')
    })

    await t.step('forwards container class names', () => {
        const html = renderToString(
            <SearchBar containerClass='custom-container' />,
        )
        assertStringIncludes(html, 'custom-container')
    })

    await t.step('forwards HTML attributes', () => {
        const html = renderToString(
            <SearchBar id='search-input' name='query' value='test' />,
        )
        assertStringIncludes(html, 'id="search-input"')
        assertStringIncludes(html, 'name="query"')
        assertStringIncludes(html, 'value="test"')
    })

    await t.step('supports Unpoly directives', () => {
        const html = renderToString(
            <SearchBar
                up-autosubmit
                up-delay='300'
                up-target='.results'
                name='q'
            />,
        )
        assertStringIncludes(html, 'up-autosubmit')
        assertStringIncludes(html, 'up-delay="300"')
        assertStringIncludes(html, 'up-target=".results"')
    })

    await t.step('uses CSS variables for styling', () => {
        const html = renderToString(<SearchBar />)
        assertStringIncludes(html, '(--radius)')
        assertStringIncludes(html, '(--muted-foreground)')
        assertStringIncludes(html, '(--background)')
    })
})

Deno.test('SearchBarGroup component', async (t) => {
    await t.step('renders with children', () => {
        const html = renderToString(
            <SearchBarGroup>
                <SearchBar placeholder='Search...' />
            </SearchBarGroup>,
        )
        assertStringIncludes(html, 'type="search"')
        assertStringIncludes(html, 'inline-flex')
    })

    await t.step('renders with custom class', () => {
        const html = renderToString(
            <SearchBarGroup class='custom-group'>
                <SearchBar />
            </SearchBarGroup>,
        )
        assertStringIncludes(html, 'custom-group')
    })

    await t.step('renders with SearchBar and SearchBarFilter', () => {
        const html = renderToString(
            <SearchBarGroup>
                <SearchBar placeholder='Search...' />
                <SearchBarFilter name='category'>
                    <option value='all'>All</option>
                </SearchBarFilter>
            </SearchBarGroup>,
        )
        assertStringIncludes(html, 'type="search"')
        assertStringIncludes(html, '<select')
    })
})

Deno.test('SearchBarFilter component', async (t) => {
    await t.step('renders select element', () => {
        const html = renderToString(
            <SearchBarFilter name='type'>
                <option value='users'>Users</option>
                <option value='posts'>Posts</option>
            </SearchBarFilter>,
        )
        assertStringIncludes(html, '<select')
        assertStringIncludes(html, 'name="type"')
    })

    await t.step('renders options', () => {
        const html = renderToString(
            <SearchBarFilter name='category'>
                <option value='all'>All Categories</option>
                <option value='electronics'>Electronics</option>
            </SearchBarFilter>,
        )
        assertStringIncludes(html, 'All Categories')
        assertStringIncludes(html, 'Electronics')
    })

    await t.step('forwards custom class names', () => {
        const html = renderToString(
            <SearchBarFilter class='custom-filter' name='filter'>
                <option value='1'>Option 1</option>
            </SearchBarFilter>,
        )
        assertStringIncludes(html, 'custom-filter')
    })

    await t.step('forwards HTML attributes', () => {
        const html = renderToString(
            <SearchBarFilter name='status' id='status-filter'>
                <option value='active'>Active</option>
            </SearchBarFilter>,
        )
        assertStringIncludes(html, 'name="status"')
        assertStringIncludes(html, 'id="status-filter"')
    })
})

Deno.test('SearchBar combined features', async (t) => {
    await t.step('renders with all features enabled', () => {
        const html = renderToString(
            <SearchBar
                variant='filled'
                size='lg'
                placeholder='Search products...'
                showIcon
                showClear
                shortcut='⌘K'
                showShortcut
                name='q'
            />,
        )
        assertStringIncludes(html, 'bg-(--muted)') // filled variant
        assertStringIncludes(html, 'h-12') // lg size
        assertStringIncludes(html, 'placeholder="Search products..."')
        assertStringIncludes(html, 'Clear search') // clear button
        assertStringIncludes(html, '⌘K') // shortcut badge
    })

    await t.step('renders outline variant with loading', () => {
        const html = renderToString(
            <SearchBar variant='outline' loading />,
        )
        assertStringIncludes(html, 'border-2')
        assertStringIncludes(html, 'animate-spin')
    })

    await t.step('renders small ghost variant disabled', () => {
        const html = renderToString(
            <SearchBar variant='ghost' size='sm' disabled />,
        )
        assertStringIncludes(html, 'bg-transparent')
        assertStringIncludes(html, 'h-8')
        assertStringIncludes(html, 'disabled')
        assertStringIncludes(html, 'opacity-50')
    })
})
