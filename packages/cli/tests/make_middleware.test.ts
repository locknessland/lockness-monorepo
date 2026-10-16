/**
 * Tests for CLI make:middleware command
 */

import { test } from 'node:test'
import { assertStringIncludes } from '@std/assert'
import { Stub } from '../stubs.ts'

test('make:middleware', async (t) => {
    await t.test('generates valid middleware from stub', async () => {
        const content = await Stub.render('make', 'middleware', {
            className: 'AuthMiddleware',
        })

        assertStringIncludes(content, 'export class AuthMiddleware')
        assertStringIncludes(content, 'implements MiddlewareContract')
    })

    await t.test('includes handle method', async () => {
        const content = await Stub.render('make', 'middleware', {
            className: 'LoggerMiddleware',
        })

        assertStringIncludes(content, 'handle(')
        assertStringIncludes(content, 'next()')
    })

    await t.test('imports required types', async () => {
        const content = await Stub.render('make', 'middleware', {
            className: 'CorsMiddleware',
        })

        assertStringIncludes(content, 'MiddlewareContract')
        assertStringIncludes(content, 'Context')
    })
})
