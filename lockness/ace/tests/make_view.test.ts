/**
 * Tests for ACE make:view command
 */

import { assertStringIncludes } from '@std/assert'
import { Stub } from '../stubs.ts'

Deno.test('make:view', async (t) => {
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
