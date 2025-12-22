/**
 * Tests for ACE make:middleware command
 */

import { assertEquals, assertStringIncludes } from '@std/assert'
import { existsSync } from '@std/fs'
import { Stub } from '@lockness/ace'

const STUB_PATH = './lockness/ace/stubs/make/middleware.stub'

Deno.test('make:middleware', async (t) => {
    await t.step('stub file exists', () => {
        assertEquals(existsSync(STUB_PATH), true)
    })

    await t.step('generates valid middleware from stub', async () => {
        const content = await Stub.render('make', 'middleware', {
            className: 'AuthMiddleware',
        })

        assertStringIncludes(content, 'export class AuthMiddleware')
        assertStringIncludes(content, 'implements IMiddleware')
    })

    await t.step('includes handle method', async () => {
        const content = await Stub.render('make', 'middleware', {
            className: 'LoggerMiddleware',
        })

        assertStringIncludes(content, 'handle(')
        assertStringIncludes(content, 'next()')
    })

    await t.step('imports required types', async () => {
        const content = await Stub.render('make', 'middleware', {
            className: 'CorsMiddleware',
        })

        assertStringIncludes(content, 'IMiddleware')
        assertStringIncludes(content, 'Context')
    })
})
