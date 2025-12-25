/**
 * Tests for CLI make:service command
 */

import { assertStringIncludes } from '@std/assert'
import { Stub } from '../stubs.ts'

Deno.test('make:service', async (t) => {
    await t.step('generates valid service from stub', async () => {
        const content = await Stub.render('make', 'service', {
            className: 'UserService',
        })

        assertStringIncludes(content, 'export class UserService')
        assertStringIncludes(content, '@Service')
    })

    await t.step('includes Service decorator', async () => {
        const content = await Stub.render('make', 'service', {
            className: 'PaymentService',
        })

        assertStringIncludes(content, '@Service()')
        assertStringIncludes(content, "import { Service } from 'lockness'")
    })
})
