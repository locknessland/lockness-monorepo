/**
 * @fileoverview Direct coverage of `toError` and `normalizeError` — the
 * scheduler's one shared error-normalisation helper (#398), previously three
 * near-identical copies across `scheduler.ts` and `task_runner.ts`.
 *
 * @module @lockness/scheduler/tests/errors
 */

import { assertEquals, assertStrictEquals } from '@std/assert'
import { normalizeError, toError } from '../errors.ts'

Deno.test('toError - an Error instance is returned as-is, not rebuilt', () => {
    const original = new TypeError('boom')
    assertStrictEquals(toError(original), original)
})

Deno.test('toError - a non-Error value is wrapped in a fresh Error', () => {
    const wrapped = toError('not an error')
    assertEquals(wrapped instanceof Error, true)
    assertEquals(wrapped.message, 'not an error')
})

Deno.test('normalizeError - a real Error is flattened to its name and message', () => {
    assertEquals(normalizeError(new RangeError('out of range')), {
        name: 'RangeError',
        message: 'out of range',
    })
})

Deno.test('normalizeError - a non-Error value is flattened the same way', () => {
    assertEquals(normalizeError('not an error'), {
        name: 'Error',
        message: 'not an error',
    })
})

Deno.test('normalizeError - a value with no usable toString is never rethrown', () => {
    // String() throws on Object.create(null) — no toString to call.
    assertEquals(normalizeError(Object.create(null)), {
        name: 'Error',
        message: '<unprintable>',
    })
})

Deno.test('normalizeError - an Error whose name/message getters throw is never rethrown', () => {
    const boom = () => {
        throw new Error('hostile read')
    }
    const hostile = Object.defineProperty(new Error('x'), 'name', {
        get: boom,
    })
    assertEquals(normalizeError(hostile), {
        name: 'Error',
        message: '<unprintable>',
    })
})

Deno.test('normalizeError - a revoked Proxy is never rethrown', () => {
    const { proxy, revoke } = Proxy.revocable({}, {})
    revoke()
    assertEquals(normalizeError(proxy), {
        name: 'Error',
        message: '<unprintable>',
    })
})

Deno.test('normalizeError - an Error whose name is not a string is never rethrown', () => {
    const hostile = Object.defineProperty(new Error('x'), 'name', {
        value: 42,
    })
    assertEquals(normalizeError(hostile), {
        name: 'Error',
        message: '<unprintable>',
    })
})
