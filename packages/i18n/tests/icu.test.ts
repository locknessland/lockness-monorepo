/**
 * @fileoverview Tests for the ICU parser + renderer — SC-001/002/009.
 *
 * @module @lockness/i18n/tests/icu
 */

import { assertEquals, assertThrows } from '@std/assert'
import { ICUParseError, parseICU, renderICU } from '../icu.ts'

function render(msg: string, params: Record<string, unknown>): string {
    return renderICU(parseICU(msg), params, 'en-us')
}

Deno.test('SC-001: interpolation replaces {name}', () => {
    assertEquals(render('Hi {name}!', { name: 'Ada' }), 'Hi Ada!')
})

Deno.test('SC-001: a missing param renders a visible placeholder, not undefined', () => {
    assertEquals(render('Hi {name}', {}), 'Hi {name}')
})

Deno.test('SC-001: cardinal plural via Intl.PluralRules with # count', () => {
    const msg = '{count, plural, one {# item} other {# items}}'
    assertEquals(render(msg, { count: 1 }), '1 item')
    assertEquals(render(msg, { count: 3 }), '3 items')
})

Deno.test('SC-001: an exact =0 plural case wins over the category', () => {
    const msg = '{count, plural, =0 {no items} one {# item} other {# items}}'
    assertEquals(render(msg, { count: 0 }), 'no items')
    assertEquals(render(msg, { count: 1 }), '1 item')
})

Deno.test('SC-002: select resolves each branch, other as fallback', () => {
    const msg = '{g, select, male {he} female {she} other {they}}'
    assertEquals(render(msg, { g: 'male' }), 'he')
    assertEquals(render(msg, { g: 'female' }), 'she')
    assertEquals(render(msg, { g: 'x' }), 'they')
})

Deno.test('a numeric param formats via Intl.NumberFormat', () => {
    assertEquals(render('Total: {n}', { n: 1234 }), 'Total: 1,234')
})

Deno.test('SC-002: a malformed message fails at parse', () => {
    assertThrows(() => parseICU('{unclosed'), ICUParseError)
    assertThrows(() => parseICU('{n, plural, one {x}}'), ICUParseError, 'other') // no other
    assertThrows(
        () => parseICU('{n, bogus, other {x}}'),
        ICUParseError,
        'unsupported',
    )
    assertThrows(() => parseICU('text}'), ICUParseError)
})

Deno.test('SC-009: over-depth and over-length messages fail at parse, not stack overflow', () => {
    // Build a deeply nested select beyond the depth cap.
    let msg = 'x'
    for (let i = 0; i < 15; i++) msg = `{s, select, other {${msg}}}`
    assertThrows(() => parseICU(msg, { maxDepth: 10 }), ICUParseError, 'depth')

    assertThrows(
        () => parseICU('aaaa', { maxLength: 2 }),
        ICUParseError,
        'length',
    )
})

Deno.test('S1: a param containing ICU syntax is NOT re-parsed', () => {
    // The param value is emitted as literal text, not interpreted as a template:
    // the ICU source survives verbatim rather than being rendered as a plural.
    assertEquals(render('{x}', { x: '{y}' }), '{y}')
    assertEquals(
        render('{x}', { x: '{count, plural, other{BAD}}' }),
        '{count, plural, other{BAD}}',
    )
})
