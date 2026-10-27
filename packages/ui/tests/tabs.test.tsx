import { assertStringIncludes } from '@std/assert'
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from '../components/Tabs/mod.tsx'

/** Render a Hono JSX node to its HTML string. */
function renderToString(component: unknown): string {
    return (component as { toString: () => string }).toString()
}

Deno.test('Tabs', async (t) => {
    await t.step(
        'Tabs wires the up-switch state selector to the group name',
        () => {
            const html = renderToString(<Tabs name='grp'>x</Tabs>)
            assertStringIncludes(html, 'up-switch=".tab-content-grp"')
            assertStringIncludes(html, 'data-tab-name="grp"')
        },
    )

    await t.step('TabsList is a tablist', () => {
        const html = renderToString(<TabsList>x</TabsList>)
        assertStringIncludes(html, 'role="tablist"')
    })

    await t.step('TabsTrigger is a hidden radio carrying the value', () => {
        const html = renderToString(
            <TabsTrigger value='overview' name='grp'>Overview</TabsTrigger>,
        )
        assertStringIncludes(html, 'type="radio"')
        assertStringIncludes(html, 'name="grp"')
        assertStringIncludes(html, 'value="overview"')
        assertStringIncludes(html, 'Overview')
    })

    await t.step('TabsContent is a panel shown for its value', () => {
        const html = renderToString(
            <TabsContent value='overview' name='grp'>Panel</TabsContent>,
        )
        assertStringIncludes(html, 'role="tabpanel"')
        assertStringIncludes(html, 'up-show-for="overview"')
        assertStringIncludes(html, 'tab-content-grp')
        assertStringIncludes(html, 'Panel')
    })
})
