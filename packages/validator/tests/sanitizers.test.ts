/**
 * Tests for @lockness/validator - Sanitizers
 */

import { assertEquals } from '@std/assert'
import {
    defaultValue,
    escapeHtml,
    lowercase,
    minLength,
    stripTags,
    toBoolean,
    toNumber,
    trim,
    uppercase,
    validator,
} from '../mod.ts'

Deno.test('Validator - Sanitizers', async (t) => {
    await t.step('trim sanitizer', async () => {
        const v = validator()
        v.sanitize('name', [trim()])
        v.field('name', [minLength(3)])

        const result = await v.validate({ name: '  John  ' })
        assertEquals(result.valid, true)

        const sanitized = v.applySanitizers({ name: '  John  ' })
        assertEquals(sanitized.name, 'John')
    })

    await t.step('lowercase and uppercase', () => {
        const v = validator()
        v.sanitize('email', [lowercase()])
        v.sanitize('code', [uppercase()])

        const sanitized = v.applySanitizers({
            email: 'TEST@EXAMPLE.COM',
            code: 'abc123',
        })
        assertEquals(sanitized.email, 'test@example.com')
        assertEquals(sanitized.code, 'ABC123')
    })

    await t.step('escapeHtml', () => {
        const v = validator()
        v.sanitize('content', [escapeHtml()])

        const sanitized = v.applySanitizers({
            content: '<script>alert("xss")</script>',
        })
        assertEquals(
            sanitized.content,
            '&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;',
        )
    })

    await t.step('stripTags', () => {
        const v = validator()
        v.sanitize('text', [stripTags()])

        const sanitized = v.applySanitizers({
            text: '<p>Hello <strong>World</strong></p>',
        })
        assertEquals(sanitized.text, 'Hello World')
    })

    await t.step('toNumber and toBoolean', () => {
        const v = validator()
        v.sanitize('age', [toNumber()])
        v.sanitize('active', [toBoolean()])

        const sanitized = v.applySanitizers({
            age: '25',
            active: 'true',
        })
        assertEquals(sanitized.age, 25)
        assertEquals(sanitized.active, true)
    })

    await t.step('defaultValue', () => {
        const v = validator()
        v.sanitize('status', [defaultValue('pending')])

        const sanitized = v.applySanitizers({ status: '' })
        assertEquals(sanitized.status, 'pending')
    })
})
