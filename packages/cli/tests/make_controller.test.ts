/**
 * Tests for CLI make:controller command
 */

import { test } from 'node:test'
import { assertEquals, assertStringIncludes } from '@std/assert'
import { Stub } from '../stubs.ts'

test('make:controller', async (t) => {
    await t.test('generates valid controller from stub', async () => {
        const content = await Stub.render('make', 'controller', {
            className: 'UserController',
        })

        assertStringIncludes(content, 'export class UserController')
        assertStringIncludes(content, '@Controller')
    })

    await t.test('generates controller with correct naming', async () => {
        const content = await Stub.render('make', 'controller', {
            className: 'ProductController',
        })

        assertStringIncludes(content, 'class ProductController')
    })

    await t.test('includes required decorators', async () => {
        const content = await Stub.render('make', 'controller', {
            className: 'TestController',
        })

        assertStringIncludes(content, '@Controller')
        const hasRouteDecorator = content.includes('@Get') ||
            content.includes('@Post') ||
            content.includes('@Put') ||
            content.includes('@Delete')
        assertEquals(hasRouteDecorator, true)
    })
})
