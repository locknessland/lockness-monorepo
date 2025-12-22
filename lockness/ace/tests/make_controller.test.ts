/**
 * Tests for ACE make:controller command
 */

import { assertEquals, assertStringIncludes } from '@std/assert'
import { Stub } from '../stubs.ts'

Deno.test('make:controller', async (t) => {
    await t.step('generates valid controller from stub', async () => {
        const content = await Stub.render('make', 'controller', {
            className: 'UserController',
        })

        assertStringIncludes(content, 'export class UserController')
        assertStringIncludes(content, '@Controller')
    })

    await t.step('generates controller with correct naming', async () => {
        const content = await Stub.render('make', 'controller', {
            className: 'ProductController',
        })

        assertStringIncludes(content, 'class ProductController')
    })

    await t.step('includes required decorators', async () => {
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
