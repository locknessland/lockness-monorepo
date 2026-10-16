/**
 * Tests for CLI make:view command
 */

import { test } from 'node:test'
import { assertStringIncludes } from '@std/assert'
import { Stub } from '../stubs.ts'

test('make:view', async (t) => {
    await t.test('generates valid view component from stub', async () => {
        const content = await Stub.render('make', 'view', {
            className: 'HomePage',
            fileName: 'home_page',
        })

        assertStringIncludes(content, 'export const HomePage')
        assertStringIncludes(content, 'return (')
    })

    await t.test('generates JSX content', async () => {
        const content = await Stub.render('make', 'view', {
            className: 'AboutPage',
            fileName: 'about_page',
        })

        assertStringIncludes(content, '<')
        assertStringIncludes(content, '>')
    })
})
