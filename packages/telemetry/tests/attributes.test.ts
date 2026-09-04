/**
 * @fileoverview Tests for the span attribute allow-list (SC-007) and exception
 * redaction (S4): the route PATTERN is emitted, never resolved param values or a
 * stack.
 *
 * @module @lockness/telemetry/tests/attributes
 */

import { assert, assertEquals } from '@std/assert'
import { buildAttributes, toRecordedException } from '../mod.ts'
import type { Context } from '@lockness/hono'

function fakeCtx(routePath: string, path: string, method = 'GET'): Context {
    return {
        req: { routePath, path, method },
    } as unknown as Context
}

Deno.test('SC-007: attributes carry the route PATTERN, never a resolved param value', () => {
    const attrs = buildAttributes(
        fakeCtx('/verify/:id', '/verify/SUPER-SECRET-TOKEN'),
    )
    assertEquals(attrs['http.route'], '/verify/:id')
    assertEquals(attrs['http.request.method'], 'GET')
    const serialised = JSON.stringify(attrs)
    assert(
        !serialised.includes('SUPER-SECRET-TOKEN'),
        'a resolved param value must never be an attribute',
    )
})

Deno.test('unmatched route falls back to a placeholder, not the resolved path', () => {
    const attrs = buildAttributes(fakeCtx(undefined as unknown as string, '/x'))
    assertEquals(attrs['http.route'], '(unmatched)')
})

Deno.test('S4: toRecordedException redacts — name + message, no stack, no planted secret', () => {
    const err = new Error('connection failed') as Error & { cause?: unknown }
    err.stack =
        'Error: connection failed\n  at postgres://admin:STACKSECRET@db/app'
    err.cause = 'postgres://admin:CAUSESECRET@db/app'

    const recorded = toRecordedException(err)
    assertEquals(recorded.name, 'Error')
    assertEquals(recorded.message, 'Error: connection failed')
    const serialised = JSON.stringify(recorded)
    assert(!serialised.includes('STACKSECRET'), 'stack must not leak')
    assert(!serialised.includes('CAUSESECRET'), 'cause must not leak')
    assert(!('stack' in recorded), 'no stack field')
})
