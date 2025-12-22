/**
 * Tests for ACE make:view command
 */

import { assertEquals, assertStringIncludes } from '@std/assert'
import { existsSync } from '@std/fs'
import { Stub } from '@lockness/ace'

const STUB_PATH = './lockness/ace/stubs/make/view.stub'

Deno.test('make:view', async (t) => {
    await t.step('stub file exists', () => {
        assertEquals(existsSync(STUB_PATH), true)
    })

    await t.step('generates valid view component from stub', async () => {
        const content = await Stub.render('make', 'view', {
            className: 'HomePage',
            fileName: 'home_page',
        })

        assertStringIncludes(content, 'export const HomePage')
        assertStringIncludes(content, 'return (')
    })

    await t.step('generates JSX content', async () => {
        const content = await Stub.render('make', 'view', {
            className: 'AboutPage',
            fileName: 'about_page',
        })

        assertStringIncludes(content, '<')
        assertStringIncludes(content, '>')
    })
})
